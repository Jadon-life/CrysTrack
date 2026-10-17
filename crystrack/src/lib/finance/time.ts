import { createClient } from "@/lib/supabase/server";
import { dateKeyForInstant } from "@/lib/reminders";
export async function savedTimezone(
  db: Awaited<ReturnType<typeof createClient>>,
  uid: string,
) {
  const { data, error } = await db
    .from("profiles")
    .select("timezone,current_timezone")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw error;
  const zone = data?.current_timezone || data?.timezone || "UTC";
  new Intl.DateTimeFormat("en", { timeZone: zone });
  return zone;
}
/** Final instant of a saved-zone calendar date; retained legacy date-only form semantics. */
export function deadlineInstant(day: string, zone: string) {
  if (day.includes("T")) return day;
  let low = Date.parse(day + "T00:00:00Z") - 86400000,
    high = low + 3 * 86400000;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (dateKeyForInstant(new Date(mid), zone) <= day) low = mid;
    else high = mid;
  }
  return new Date(low).toISOString();
}
