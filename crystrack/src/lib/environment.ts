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

export interface Coordinates { latitude: number; longitude: number; }

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

function deviceLocalIso(date = new Date()) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d}T${h}:${mi}`;
}

export function environmentLocalIso(timezone: string, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
    const year = value('year');
    const month = value('month');
    const day = value('day');
    const hour = value('hour');
    const minute = value('minute');
    if (year && month && day && hour && minute) return `${year}-${month}-${day}T${hour}:${minute}`;
  } catch {
    // Fall back to device-local time if a saved timezone is invalid.
  }
  return deviceLocalIso(date);
}

export function fallbackEnvironment(): EnvironmentState {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const localTime = environmentLocalIso(timezone);
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

// Stability mode: scenery no longer depends on third-party weather/geocoding calls.
// The signature stays compatible with ThemeProvider/requestLocation call sites.
export async function loadEnvironment(coordinates?: Coordinates): Promise<EnvironmentState> {
  const environment = fallbackEnvironment();
  return coordinates ? { ...environment, locationSource: 'gps' } : environment;
}

export interface EnvironmentBackgroundAsset {
  id: string;
  src: string;
  srcSet: string;
  objectPosition: string;
  phases: TimePhase[];
  weather: WeatherKind[];
  slotStartMinute: number;
  fallbackSrc: string;
}

const ALL_WEATHER: WeatherKind[] = ['clear', 'cloudy', 'rain', 'storm', 'fog', 'snow', 'unknown'];

// Eight approved local scenes, compressed without resizing and ordered by local-time mood.
export const ENVIRONMENT_BACKGROUND_POOL: EnvironmentBackgroundAsset[] = [
  { id: 'approved-deep-night-dubai-terrace', src: '/backgrounds/adaptive/01-deep-night-dubai-terrace.webp', srcSet: '', objectPosition: '50% 50%', phases: ['night'], weather: ALL_WEATHER, slotStartMinute: 0, fallbackSrc: '/backgrounds/adaptive/01-deep-night-dubai-terrace.webp' },
  { id: 'approved-predawn-blue-dubai', src: '/backgrounds/adaptive/02-predawn-blue-dubai.webp', srcSet: '', objectPosition: '50% 50%', phases: ['night', 'morning'], weather: ALL_WEATHER, slotStartMinute: 300, fallbackSrc: '/backgrounds/adaptive/02-predawn-blue-dubai.webp' },
  { id: 'approved-sunrise-mountain-lake', src: '/backgrounds/adaptive/03-sunrise-mountain-lake.webp', srcSet: '', objectPosition: '50% 50%', phases: ['morning'], weather: ALL_WEATHER, slotStartMinute: 390, fallbackSrc: '/backgrounds/adaptive/03-sunrise-mountain-lake.webp' },
  { id: 'approved-morning-mountain-lake', src: '/backgrounds/adaptive/04-morning-mountain-lake.webp', srcSet: '', objectPosition: '50% 50%', phases: ['morning', 'day'], weather: ALL_WEATHER, slotStartMinute: 540, fallbackSrc: '/backgrounds/adaptive/04-morning-mountain-lake.webp' },
  { id: 'approved-midday-nature-terrace', src: '/backgrounds/adaptive/05-midday-nature-terrace.webp', srcSet: '', objectPosition: '50% 50%', phases: ['day'], weather: ALL_WEATHER, slotStartMinute: 750, fallbackSrc: '/backgrounds/adaptive/05-midday-nature-terrace.webp' },
  { id: 'approved-afternoon-dubai', src: '/backgrounds/adaptive/06-afternoon-dubai.webp', srcSet: '', objectPosition: '50% 50%', phases: ['day', 'golden'], weather: ALL_WEATHER, slotStartMinute: 960, fallbackSrc: '/backgrounds/adaptive/06-afternoon-dubai.webp' },
  { id: 'approved-golden-hour-dubai', src: '/backgrounds/adaptive/07-golden-hour-dubai.webp', srcSet: '', objectPosition: '50% 50%', phases: ['golden', 'evening'], weather: ALL_WEATHER, slotStartMinute: 1110, fallbackSrc: '/backgrounds/adaptive/07-golden-hour-dubai.webp' },
  { id: 'approved-night-dubai-city', src: '/backgrounds/adaptive/08-night-dubai-city.webp', srcSet: '', objectPosition: '50% 50%', phases: ['evening', 'night'], weather: ALL_WEATHER, slotStartMinute: 1230, fallbackSrc: '/backgrounds/adaptive/08-night-dubai-city.webp' },
];

function localClockParts(now: Date, timezone: string, fallbackLocalTime: string): { minute: number; dayKey: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    const lookup = (type: string) => parts.find((part) => part.type === type)?.value || '';
    const hour = Number(lookup('hour'));
    const minute = Number(lookup('minute'));
    const year = lookup('year');
    const month = lookup('month');
    const day = lookup('day');
    if (Number.isFinite(hour) && Number.isFinite(minute) && year && month && day) {
      return { minute: hour * 60 + minute, dayKey: `${year}-${month}-${day}` };
    }
  } catch {}
  const parsedMinute = minuteOfDay(fallbackLocalTime);
  const dayKey = fallbackLocalTime.slice(0, 10) || now.toISOString().slice(0, 10);
  return { minute: parsedMinute ?? (now.getHours() * 60 + now.getMinutes()), dayKey };
}

function baseRotationIndex(minute: number) {
  let index = 0;
  for (let i = 0; i < ENVIRONMENT_BACKGROUND_POOL.length; i += 1) {
    if (minute >= ENVIRONMENT_BACKGROUND_POOL[i].slotStartMinute) index = i;
    else break;
  }
  return index;
}

export function millisecondsUntilNextBackgroundSlot(environment: Pick<EnvironmentState, 'timezone' | 'localTime'>, now = new Date()) {
  const { minute } = localClockParts(now, environment.timezone, environment.localTime);
  const next = ENVIRONMENT_BACKGROUND_POOL.find((asset) => asset.slotStartMinute > minute)?.slotStartMinute
    ?? (ENVIRONMENT_BACKGROUND_POOL[0].slotStartMinute + 1440);
  const deltaMinutes = next - minute;
  const elapsedThisMinute = now.getSeconds() * 1000 + now.getMilliseconds();
  return Math.max(5_000, deltaMinutes * 60_000 - elapsedThisMinute + 750);
}

export function selectEnvironmentBackground(
  environment: Pick<EnvironmentState, 'phase' | 'weather' | 'city' | 'countryCode' | 'localTime' | 'timezone'>,
  now = new Date(),
): EnvironmentBackgroundAsset {
  const { minute } = localClockParts(now, environment.timezone, environment.localTime);
  return ENVIRONMENT_BACKGROUND_POOL[baseRotationIndex(minute)];
}

// Kept for API compatibility, but the renderer intentionally does not prefetch these in stability mode.
export function nextEnvironmentBackgrounds(
  environment: Pick<EnvironmentState, 'phase' | 'weather' | 'city' | 'countryCode' | 'localTime' | 'timezone'>,
  now = new Date(),
  count = 3,
): EnvironmentBackgroundAsset[] {
  const { minute } = localClockParts(now, environment.timezone, environment.localTime);
  const baseIndex = baseRotationIndex(minute);
  const results: EnvironmentBackgroundAsset[] = [];
  for (let offset = 1; offset <= Math.max(0, count); offset += 1) {
    results.push(ENVIRONMENT_BACKGROUND_POOL[(baseIndex + offset) % ENVIRONMENT_BACKGROUND_POOL.length]);
  }
  return results;
}

export function environmentBackgroundAsset(phase: TimePhase) {
  const fallback = ENVIRONMENT_BACKGROUND_POOL.find((asset) => asset.phases.includes(phase)) || ENVIRONMENT_BACKGROUND_POOL[0];
  return { src: fallback.fallbackSrc, srcSet: '' };
}

export function environmentBackgroundPath(phase: TimePhase): string { return environmentBackgroundAsset(phase).src; }
export function weatherLabel(kind: WeatherKind): string {
  const labels: Record<WeatherKind, string> = {
    clear: 'Clear skies', cloudy: 'Cloudy', rain: 'Rain', storm: 'Storm', fog: 'Fog', snow: 'Snow', unknown: 'Weather unavailable',
  };
  return labels[kind];
}
