import { dayInTimezone } from './today-progress';

/** Match real deadline instants to the user's saved scheduling civil day.
 * Date-only values are calendar dates, not UTC-midnight instants.
 * A timestamp missing an offset is ambiguous and is intentionally rejected.
 */
export function calendarDeadlineDay(value: unknown, timezone: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day, 12));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
    return value;
  }
  if (!/T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  return dayInTimezone(timezone, instant).dateKey;
}
