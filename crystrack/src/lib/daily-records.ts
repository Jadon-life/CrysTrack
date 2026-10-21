import { z } from 'zod';
import type { DailySnapshot } from './daily-streak';

export const dayKeySchema = z.string().regex(/^(?!0000)\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');
export const outcomeRequestSchema = z.object({
  desiredStatus: z.enum(['pending', 'completed', 'skipped']),
  expectedRevision: z.number().int().positive().max(2147483647), requestId: z.string().uuid(),
}).strict();
export const noteRequestSchema = z.object({
  body: z.string().refine(value => [...value].length <= 4000, 'Use at most 4,000 characters').transform(value => value.trim() === '' ? '' : value),
  expectedRevision: z.number().int().nonnegative().max(2147483646),
}).strict();
export const dailyContextSchema = z.object({
  day: dayKeySchema, timezone: z.string().min(1), revision: z.number().int().positive(), captureStartsOn: dayKeySchema,
});
const routineSchema = z.object({
  routine_key: z.string().uuid(), status: z.enum(['pending','completed','skipped','missed']),
  revision: z.number().int().positive(), title: z.string(), description: z.string().nullable(),
  preferred_time: z.string().nullable(), category: z.string().nullable(), legacy_conflict: z.boolean(),
  compatibility_occurrence_id: z.string().uuid().nullable(), id: z.string().uuid(),
});
export const dailyPageSchema = z.object({
  dataRevision: z.number().int().positive().safe(), nextCursor: dayKeySchema.nullable(), context: dailyContextSchema,
  records: z.array(z.object({
    day_key: dayKeySchema, timezone: z.string(), policy_version: z.literal(1),
    expected_count: z.number().int().nonnegative(), evidence: z.enum(['verified','incomplete']),
    close_status: z.enum(['open','closed']), routines: z.array(routineSchema),
  })),
});
export type DailyPage = z.infer<typeof dailyPageSchema>;
export type DailyContext = z.infer<typeof dailyContextSchema>;

/** Server assembler. Every child is checked; partial/duplicate sets cannot claim verified evidence. */
export function assembleDailySnapshots(records: DailyPage['records'], today: string): DailySnapshot[] {
  const dates = new Set<string>();
  return records.map(record => {
    if (dates.has(record.day_key)) throw new Error('Duplicate authoritative day');
    dates.add(record.day_key);
    const ids = record.routines.map(r => r.routine_key);
    const complete = record.expected_count === ids.length && new Set(ids).size === ids.length &&
      !record.routines.some(r => r.legacy_conflict) && (record.day_key === today || record.close_status === 'closed');
    return {
      date: record.day_key, evidence: record.evidence === 'verified' && complete ? 'verified' : 'incomplete',
      scheduledRoutineIds: ids, outcomes: record.routines.map(r => ({routineId:r.routine_key, status:r.status})),
    };
  });
}

/** Pinned revision across scalar pages; an interrupted or mutated read is never returned as complete. */
export async function readDailyWindow(
  readPage: (after: string | null, revision: number | null) => Promise<unknown>, from: string, to: string,
) {
  dayKeySchema.parse(from); dayKeySchema.parse(to);
  if (from > to) throw new Error('Invalid daily window');
  const records: DailyPage['records'] = [];
  let cursor: string | null = null;
  let revision: number | null = null;
  let context: DailyContext | undefined;
  do {
    const page = dailyPageSchema.parse(await readPage(cursor, revision));
    if (revision !== null && revision !== page.dataRevision) throw new Error('Daily window changed; retry');
    revision = page.dataRevision;
    if (context && (context.day !== page.context.day || context.timezone !== page.context.timezone)) throw new Error('Daily boundary changed; retry');
    context = page.context;
    let previous = cursor;
    for (const row of page.records) {
      if (row.day_key < from || row.day_key > to || (previous && row.day_key <= previous)) throw new Error('Invalid daily page ordering');
      previous = row.day_key;
      records.push(row);
    }
    if (page.nextCursor && (page.nextCursor !== previous || page.nextCursor === cursor || page.records.length === 0)) throw new Error('Invalid daily cursor');
    cursor = page.nextCursor;
  } while (cursor);
  return { records, context: context!, snapshots: assembleDailySnapshots(records, context!.day), dataRevision: revision! };
}
