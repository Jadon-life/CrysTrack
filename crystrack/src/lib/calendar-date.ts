import { dayInTimezone } from './today-progress';

/** Match real deadline instants to the user's saved scheduling civil day.
 * Date-only values are calendar dates, not UTC-midnight instants.
 * A timestamp missing an offset is ambiguous and is intentionally rejected.
 */
export function calendarDeadlineDay(value: unknown, timezone: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // Strict civil-date validation also handles years 0001–0099 correctly.
    const parsed = new Date(value + 'T12:00:00Z');
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
    return value;
  }
  if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  // JS Date normalises impossible month-days, so reject them before converting.
  const civil = value.slice(0, 10);
  const strict = new Date(civil + 'T12:00:00Z');
  if (Number.isNaN(strict.getTime()) || strict.toISOString().slice(0, 10) !== civil) return null;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  return dayInTimezone(timezone, instant).dateKey;
}
