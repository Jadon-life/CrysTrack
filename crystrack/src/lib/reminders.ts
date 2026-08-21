export interface LocalClock {
  dateKey: string;
  weekday: number;
  minuteOfDay: number;
  hour: number;
  minute: number;
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function localClock(date: Date, timeZone: string): LocalClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = Number(get('hour')) || 0;
  const minute = Number(get('minute')) || 0;
  return {
    dateKey: `${year}-${month}-${day}`,
    weekday: WEEKDAY_MAP[get('weekday')] ?? 0,
    minuteOfDay: hour * 60 + minute,
    hour,
    minute,
  };
}

export function dateKeyForInstant(date: Date, timeZone: string) {
  return localClock(date, timeZone).dateKey;
}

export function previousDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function weekdayForDateKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

export function clockMinutes(value: string | null | undefined) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function minuteMatches(current: number, target: number, graceMinutes = 5) {
  const delta = current - target;
  return delta >= 0 && delta < graceMinutes;
}

export function isWithinDnd(currentMinute: number, enabled: boolean, start?: string | null, end?: string | null) {
  if (!enabled) return false;
  const startMinute = clockMinutes(start || '') ?? 22 * 60;
  const endMinute = clockMinutes(end || '') ?? 7 * 60;
  if (startMinute === endMinute) return true;
  if (startMinute < endMinute) return currentMinute >= startMinute && currentMinute < endMinute;
  return currentMinute >= startMinute || currentMinute < endMinute;
}

export function normaliseChannels(value: unknown, fallback: string[] = ['push']) {
  const channels = Array.isArray(value) ? value.filter((item) => item === 'push' || item === 'telegram') : [];
  return channels.length ? Array.from(new Set(channels)) : fallback;
}

export function dueAssignmentOffset(diffMinutes: number, offsetMinutes: number) {
  if (offsetMinutes === 0) return diffMinutes <= 0 && diffMinutes > -24 * 60;
  const grace = offsetMinutes >= 24 * 60 ? 15 : 5;
  return diffMinutes <= offsetMinutes && diffMinutes > offsetMinutes - grace;
}
