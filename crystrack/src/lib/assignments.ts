import { z } from 'zod';

export const reminderConfigSchema = z
  .object({
    enabled: z.boolean(),
    channels: z
      .array(z.enum(['push', 'telegram']))
      .min(1)
      .max(2),
    offsetMinutes: z.array(z.number().int().min(0).max(43200)).max(12),
  })
  .strict()
  .transform((value) => ({
    ...value,
    channels: [...new Set(value.channels)],
    offsetMinutes: [...new Set(value.offsetMinutes)].sort((a, b) => b - a),
  }));
export const assignmentFieldsSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    description: z.string().max(10000).nullable().optional(),
    deadline: z.string().datetime({ offset: true }).optional(),
    localDeadline: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      .optional(),
    timezone: z.string().max(100).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    category: z.string().trim().max(100).nullable().optional(),
    reminderConfig: reminderConfigSchema.default({
      enabled: true,
      channels: ['push'],
      offsetMinutes: [1440, 120, 0],
    }),
  })
  .strict()
  .refine(
    (value) => Boolean(value.deadline) !== Boolean(value.localDeadline),
    'Choose one deadline representation',
  );
export type AssignmentState =
  | 'overdue'
  | 'due_today'
  | 'due_soon'
  | 'upcoming'
  | 'completed_on_time'
  | 'finished_late'
  | 'completion_unknown';
export interface AssignmentRow {
  id: string;
  title: string;
  description: string | null;
  deadline: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string | null;
  status: string;
  completed_at: string | null;
  revision: number;
  reminder_version: number;
  reminder_config: z.infer<typeof reminderConfigSchema>;
  computed_status: AssignmentState;
}
export interface AssignmentList {
  items: AssignmentRow[];
  timezone: string;
  now: string;
  hasMore: boolean;
  page: number;
  counts: Record<AssignmentState, number>;
  week: { day: string; count: number }[];
}
export function localInput(instant: string | Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const p = (name: string) => parts.find((part) => part.type === name)?.value;
  return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}`;
}
/** Enumerate possible offsets, then round-trip. Never guess a DST fold or gap. */
export function resolveLocalDeadline(value: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Choose a valid deadline.');
  const base = Date.parse(value + ':00Z');
  if (!Number.isFinite(base) || new Date(base).toISOString().slice(0, 16) !== value)
    throw new Error('Choose a valid calendar date.');
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = base + hours * 3600000;
    offsets.add(Date.parse(localInput(new Date(sample), timezone) + ':00Z') - sample);
  }
  const matches = [...offsets]
    .map((offset) => base - offset)
    .filter((candidate) => localInput(new Date(candidate), timezone) === value);
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? 'This time occurs twice when clocks change. Choose a time outside the repeated hour.'
        : 'This time does not exist when clocks change. Choose another time.',
    );
  return new Date(matches[0]).toISOString();
}
export function assignmentState(
  deadline: string,
  completedAt: string | null,
  now: string,
  timezone: string,
): AssignmentState {
  if (completedAt)
    return Date.parse(completedAt) > Date.parse(deadline) ? 'finished_late' : 'completed_on_time';
  if (Date.parse(deadline) < Date.parse(now)) return 'overdue';
  const day = localInput(deadline, timezone).slice(0, 10),
    today = localInput(now, timezone).slice(0, 10);
  if (day === today) return 'due_today';
  const distance = (Date.parse(day) - Date.parse(today)) / 86400000;
  return distance < 3 ? 'due_soon' : 'upcoming';
}
export function assignmentDate(instant: string, timezone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(instant));
}
