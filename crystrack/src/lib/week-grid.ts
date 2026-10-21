import { z } from 'zod';
import { dailyContextSchema, dayKeySchema } from './daily-records';
import { stepDailyKey } from './today-streak';

export const WEEK_PAST = 52,
  WEEK_FUTURE = 8;
export function weekStart(day: string) {
  dayKeySchema.parse(day);
  return stepDailyKey(day, -new Date(day + 'T12:00:00Z').getUTCDay());
}
export function weekDays(from: string) {
  return Array.from({ length: 7 }, (_, i) => stepDailyKey(from, i));
}
export const weekQuerySchema = z
  .object({
    from: dayKeySchema.optional(),
    after: z.string().uuid().optional(),
    filter: z.enum(['all', 'active', 'history']).default('all'),
    revision: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
  })
  .strict()
  .refine((value) => !value.after || value.revision, 'Refresh before paging');
const daySchema = z.object({
  day: dayKeySchema,
  timezone: z.string().nullable(),
  mode: z.enum(['past', 'today', 'future']),
  evidence: z.enum(['verified', 'incomplete', 'missing', 'planned', 'unavailable']),
  count: z.number().int().nonnegative().nullable(),
});
const cellSchema = z.object({
  day: dayKeySchema,
  state: z.enum(['unverified', 'not_scheduled', 'planned', 'pending', 'completed', 'skipped', 'missed']),
  title: z.string().nullable(),
  revision: z.number().int().positive().nullable(),
  editable: z.boolean(),
});
export const weekGridSchema = z
  .object({
    context: dailyContextSchema,
    from: dayKeySchema,
    to: dayKeySchema,
    minimum: dayKeySchema,
    maximum: dayKeySchema,
    revision: z.string().regex(/^[a-f0-9]{32}$/),
    nextCursor: z.string().uuid().nullable(),
    days: z.array(daySchema).length(7),
    rows: z
      .array(
        z.object({
          id: z.string().uuid(),
          title: z.string(),
          active: z.boolean(),
          nameSource: z.enum(['current', 'recorded', 'planned', 'unverified']),
          cells: z.array(cellSchema).length(7),
        }),
      )
      .max(50),
  })
  .superRefine((view, ctx) => {
    const fail = () =>
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Week evidence is inconsistent. Refresh before using it.',
      });
    try {
      if (
        view.from !== weekStart(view.from) ||
        view.to !== stepDailyKey(view.from, 6) ||
        view.from < view.minimum ||
        view.from > view.maximum
      )
        fail();
      new Intl.DateTimeFormat('en', { timeZone: view.context.timezone });
    } catch {
      fail();
      return;
    }
    if (
      new Set(view.rows.map((row) => row.id)).size !== view.rows.length ||
      view.rows.some((row, i) => i > 0 && row.id <= view.rows[i - 1].id)
    )
      fail();
    if (view.nextCursor !== null && view.nextCursor !== view.rows[view.rows.length - 1]?.id) fail();
    view.days.forEach((day, i) => {
      if (
        day.day !== stepDailyKey(view.from, i) ||
        day.mode !== (day.day < view.context.day ? 'past' : day.day === view.context.day ? 'today' : 'future')
      )
        fail();
      if (
        (day.evidence === 'verified') !== (day.count !== null) ||
        (day.mode === 'future') !== ['planned', 'unavailable'].includes(day.evidence)
      )
        fail();
      if (day.timezone) {
        try {
          new Intl.DateTimeFormat('en', { timeZone: day.timezone });
        } catch {
          fail();
        }
      }
      for (const row of view.rows) {
        const cell = row.cells[i];
        if (!cell) {
          fail();
          continue;
        }
        if (cell.day !== day.day) fail();
        if (day.mode === 'past' && day.evidence !== 'verified' && cell.state !== 'unverified') fail();
        if (day.mode === 'future' && !['planned', 'not_scheduled', 'unverified'].includes(cell.state)) fail();
        if (day.mode !== 'future' && cell.state === 'planned') fail();
        if (
          cell.editable &&
          (day.mode !== 'today' ||
            cell.revision === null ||
            ['unverified', 'not_scheduled', 'planned'].includes(cell.state))
        )
          fail();
        if (!cell.editable && cell.revision !== null) fail();
        if (day.count === 0 && cell.state !== 'not_scheduled') fail();
      }
    });
  });
export type WeekGridView = z.infer<typeof weekGridSchema>;
export type WeekCell = z.infer<typeof cellSchema>;
export const weekStateLabels: Record<WeekCell['state'], string> = {
  completed: 'Completed',
  skipped: 'Skipped',
  missed: 'Missed',
  pending: 'Pending',
  planned: 'Planned',
  not_scheduled: 'Not scheduled',
  unverified: 'Unverified',
};
export function weekDayLabel(day: WeekGridView['days'][number]) {
  if (day.mode === 'future')
    return day.evidence === 'unavailable' ? 'Timezone transition · plan unavailable' : 'Planned · editable';
  if (day.evidence !== 'verified')
    return day.mode === 'today' ? 'Open · partial evidence' : 'History unverified';
  if (day.mode === 'today') return day.count === 0 ? 'Open · no routines' : 'Today · open';
  return day.count === 0 ? 'Verified empty' : 'Recorded';
}
export function weekDate(day: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(day + 'T12:00:00Z'));
}
