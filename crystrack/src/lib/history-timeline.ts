/** Calendar-day grouping of already-recorded activity. No database writes. */
export interface HistoryEvent {
  id: string;
  entity_type: string;
  type: string;
  created_at: string;
  metadata_json?: { title?: string; date?: string; status?: string } | null;
}

export interface HistoryDay {
  key: string;
  label: string;
  items: HistoryEvent[];
}

export interface HistoryMonth {
  key: string;
  label: string;
  count: number;
  days: HistoryDay[];
}

function validDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateInZone(date: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const value = (name: string) => parts.find((part) => part.type === name)?.value || '';
    const result = [value('year'), value('month'), value('day')].join('-');
    return validDateKey(result) ? result : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function eventDateKey(event: HistoryEvent, timezone: string): string {
  // Task outcome events explicitly name the scheduled day, which can differ
  // from the timestamp of the check/skip event itself.
  if (event.entity_type === 'task' && event.metadata_json?.date) {
    const scheduled = String(event.metadata_json.date).slice(0, 10);
    if (validDateKey(scheduled)) return scheduled;
  }
  const created = new Date(event.created_at);
  if (Number.isNaN(created.getTime())) return 'unknown';
  return dateInZone(created, timezone);
}

function dateLabel(key: string, options: Intl.DateTimeFormatOptions) {
  if (key === 'unknown') return 'Date unavailable';
  const safe = key.length === 7 ? key + '-15' : key;
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' })
    .format(new Date(safe + 'T12:00:00Z'));
}

export function groupHistoryByMonth(events: HistoryEvent[], timezone: string): HistoryMonth[] {
  const months = new Map<string, Map<string, HistoryEvent[]>>();

  for (const item of events) {
    const day = eventDateKey(item, timezone);
    const month = day === 'unknown' ? 'unknown' : day.slice(0, 7);
    if (!months.has(month)) months.set(month, new Map());
    const days = months.get(month)!;
    if (!days.has(day)) days.set(day, []);
    days.get(day)!.push(item);
  }

  return [...months.entries()]
    .sort(([a], [b]) => a === 'unknown' ? 1 : b === 'unknown' ? -1 : b.localeCompare(a))
    .map(([key, days]) => {
      const grouped = [...days.entries()]
        .sort(([a], [b]) => a === 'unknown' ? 1 : b === 'unknown' ? -1 : b.localeCompare(a))
        .map(([day, items]): HistoryDay => ({
          key: day,
          label: dateLabel(day, { weekday: 'long', month: 'short', day: 'numeric' }),
          items: [...items].sort((a, b) => b.created_at.localeCompare(a.created_at)),
        }));
      return {
        key,
        label: dateLabel(key, { month: 'long', year: 'numeric' }),
        count: grouped.reduce((sum, day) => sum + day.items.length, 0),
        days: grouped,
      };
    });
}
