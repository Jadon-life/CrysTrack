import { dateKeyForInstant, localClock } from "@/lib/reminders";
export function shiftAcademicDay(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function localDateTimeValue(instant: string, timezone: string) {
  const clock = localClock(new Date(instant), timezone);
  return `${clock.dateKey}T${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
}
/** Local wall-clock deadlines never use the server or browser timezone. */
export function academicDeadline(value: string, timezone: string): string {
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  ) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
      throw new Error("Choose a valid deadline.");
    return date.toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (new Date(value).toISOString().slice(0, 10) !== value)
      throw new Error("Choose a valid date.");
    let low = Date.parse(value) - 86400000,
      high = low + 3 * 86400000;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (dateKeyForInstant(new Date(middle), timezone) <= value) low = middle;
      else high = middle;
    }
    return new Date(low).toISOString();
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Choose a valid local date and time.");
  const anchor = Date.parse(`${value}Z`);
  if (!Number.isFinite(anchor)) throw new Error("Choose a valid deadline.");
  const candidates = new Set<number>();
  for (const hours of [-36, 0, 36]) {
    const probe = anchor + hours * 3600000;
    const local = Date.parse(
      `${localDateTimeValue(new Date(probe).toISOString(), timezone)}Z`,
    );
    const candidate = anchor - (local - probe);
    if (
      localDateTimeValue(new Date(candidate).toISOString(), timezone) === value
    )
      candidates.add(candidate);
  }
  if (!candidates.size)
    throw new Error(
      "That time is unavailable in your timezone. Choose another time.",
    );
  // In a repeated DST hour choose the first occurrence. An explicit offset remains supported by the API.
  return new Date(Math.min(...candidates)).toISOString();
}
