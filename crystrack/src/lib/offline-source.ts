import { z } from 'zod';
import { dailyContextSchema } from './daily-records';
export const OFFLINE_ROUTINE_LIMIT = 50;
export const offlineSourceSchema = z.object({
  owner: z.string().uuid(), context: dailyContextSchema,
  snapshotId: z.string().uuid(), closesAt: z.string().datetime({offset:true}),
  routines: z.array(z.object({
    routineId: z.string().uuid(), snapshotVersion: z.string().uuid(), definitionVersion: z.string().uuid(),
    expectedRevision: z.number().int().positive(), status: z.enum(['pending','completed','skipped']),
    label: z.string().max(160),
  }).strict()).max(OFFLINE_ROUTINE_LIMIT),
}).strict();
export type OfflineSource = z.infer<typeof offlineSourceSchema>;
