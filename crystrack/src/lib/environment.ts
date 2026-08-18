import type { TimePhase } from '@/lib/theme';

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow' | 'unknown';
export type LocationSource = 'gps' | 'ip' | 'device' | 'fallback';

export interface EnvironmentState {
  phase: TimePhase;
  weather: WeatherKind;
  weatherCode: number | null;
  temperatureC: number | null;
  city: string | null;
  countryCode: string | null;
  timezone: string;
  timezoneAbbreviation: string | null;
  sunrise: string | null;
  sunset: string | null;
  localTime: string;
  locationSource: LocationSource;
  updatedAt: string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

function minuteOfDay(isoLike: string | null | undefined): number | null {
  if (!isoLike) return null;
  const time = isoLike.includes('T') ? isoLike.split('T')[1] : isoLike;
  const [h, m] = time.slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function weatherKindFromWmo(code: number | null | undefined): WeatherKind {
  if (code == null || Number.isNaN(code)) return 'unknown';
  if (code === 0 || code === 1) return 'clear';
  if (code === 2 || code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'storm';
  return 'cloudy';
}

export function phaseFromSolarTimes(currentLocal: string, sunrise: string | null, sunset: string | null): TimePhase {
  const now = minuteOfDay(currentLocal);
  const rise = minuteOfDay(sunrise);
  const set = minuteOfDay(sunset);
  if (now == null || rise == null || set == null) {
    const hour = Number(currentLocal.slice(11, 13) || currentLocal.slice(0, 2));
    if (hour >= 5 && hour < 10) return 'morning';
    if (hour >= 10 && hour < 16) return 'day';
    if (hour >= 16 && hour < 18) return 'golden';
    if (hour >= 18 && hour < 21) return 'evening';
    return 'night';
  }

  if (now < rise - 30 || now >= set + 75) return 'night';
  if (now < rise + 180) return 'morning';
  if (now < set - 120) return 'day';
  if (now < set) return 'golden';
  return 'evening';
}

function deviceLocalIso() {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d}T${h}:${mi}`;
}

export function fallbackEnvironment(): EnvironmentState {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const localTime = deviceLocalIso();
  return {
    phase: phaseFromSolarTimes(localTime, null, null),
    weather: 'unknown',
    weatherCode: null,
    temperatureC: null,
    city: null,
    countryCode: null,
    timezone,
    timezoneAbbreviation: null,
    sunrise: null,
    sunset: null,
    localTime,
    locationSource: 'device',
    updatedAt: new Date().toISOString(),
  };
}

async function reverseGeocode(coordinates?: Coordinates) {
  const params = new URLSearchParams({ localityLanguage: 'en' });
  if (coordinates) {
    params.set('latitude', String(coordinates.latitude));
    params.set('longitude', String(coordinates.longitude));
  }
  const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${params.toString()}`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Location lookup failed');
  return response.json();
}

async function fetchWeather(coordinates: Coordinates) {
  const params = new URLSearchParams({
    latitude: String(coordinates.latitude),
    longitude: String(coordinates.longitude),
    current: 'temperature_2m,weather_code,is_day',
    daily: 'sunrise,sunset',
    timezone: 'auto',
    forecast_days: '1',
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Weather lookup failed');
  return response.json();
}

export async function loadEnvironment(coordinates?: Coordinates): Promise<EnvironmentState> {
  const fallback = fallbackEnvironment();

  if (!coordinates) {
    try {
      const place = await reverseGeocode();
      return {
        ...fallback,
        city: place.city || place.locality || place.principalSubdivision || null,
        countryCode: place.countryCode || null,
        locationSource: 'ip',
      };
    } catch {
      return fallback;
    }
  }

  const [weatherResult, placeResult] = await Promise.allSettled([
    fetchWeather(coordinates),
    reverseGeocode(coordinates),
  ]);

  if (weatherResult.status !== 'fulfilled') {
    return {
      ...fallback,
      city: placeResult.status === 'fulfilled' ? (placeResult.value.city || placeResult.value.locality || null) : null,
      countryCode: placeResult.status === 'fulfilled' ? (placeResult.value.countryCode || null) : null,
      locationSource: 'gps',
    };
  }

  const weather = weatherResult.value;
  const currentLocal = weather.current?.time || fallback.localTime;
  const sunrise = weather.daily?.sunrise?.[0] || null;
  const sunset = weather.daily?.sunset?.[0] || null;
  const place = placeResult.status === 'fulfilled' ? placeResult.value : null;

  return {
    phase: phaseFromSolarTimes(currentLocal, sunrise, sunset),
    weather: weatherKindFromWmo(weather.current?.weather_code),
    weatherCode: typeof weather.current?.weather_code === 'number' ? weather.current.weather_code : null,
    temperatureC: typeof weather.current?.temperature_2m === 'number' ? weather.current.temperature_2m : null,
    city: place?.city || place?.locality || place?.principalSubdivision || null,
    countryCode: place?.countryCode || null,
    timezone: weather.timezone || fallback.timezone,
    timezoneAbbreviation: weather.timezone_abbreviation || null,
    sunrise,
    sunset,
    localTime: currentLocal,
    locationSource: 'gps',
    updatedAt: new Date().toISOString(),
  };
}

const COMMONS_BACKGROUNDS: Record<TimePhase, string> = {
  morning: 'Sunrise Bettmerhorn snowy mountains (Unsplash).jpg',
  day: 'Mountain Landscape (Unsplash).jpg',
  golden: 'Golden city skyline (Unsplash).jpg',
  evening: 'Sunset Vibes (Unsplash).jpg',
  night: 'Dubai skyline unsplash.jpg',
};

function commonsRedirect(file: string, width: number) {
  return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(file)}?width=${width}`;
}

export function environmentBackgroundAsset(phase: TimePhase) {
  const file = COMMONS_BACKGROUNDS[phase];
  return {
    src: commonsRedirect(file, 2560),
    srcSet: `${commonsRedirect(file, 1280)} 1280w, ${commonsRedirect(file, 1920)} 1920w, ${commonsRedirect(file, 2560)} 2560w, ${commonsRedirect(file, 3840)} 3840w`,
  };
}

export function environmentBackgroundPath(phase: TimePhase): string {
  return environmentBackgroundAsset(phase).src;
}

export function weatherLabel(kind: WeatherKind): string {
  const labels: Record<WeatherKind, string> = {
    clear: 'Clear skies',
    cloudy: 'Cloudy',
    rain: 'Rain',
    storm: 'Storm',
    fog: 'Fog',
    snow: 'Snow',
    unknown: 'Weather unavailable',
  };
  return labels[kind];
}
