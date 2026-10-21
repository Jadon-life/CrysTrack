import { z } from 'zod';
import { dayKeySchema } from './daily-records';

export const OFFLINE_INTENT_BYTES = 2048;
const uuid = z.string().uuid().transform(value => value.toLowerCase());
const revision = z.number().int().positive().max(2147483647);
/** Immutable attempt envelope. No owner, task labels, private responses or reward fields. */
export const offlineOutcomeIntentSchema = z.object({
  mode: z.literal('offline-v1'), requestId: uuid, day: dayKeySchema,
  timezone: z.string().min(1).max(100), contextRevision: revision,
  snapshotId: uuid, snapshotVersion: uuid,
  definitionVersion: uuid, routineId: uuid,
  expectedRevision: revision, desiredStatus: z.enum(['pending', 'completed', 'skipped']),
}).strict();
export type OfflineOutcomeIntent = z.infer<typeof offlineOutcomeIntentSchema>;
export const offlineOutcomeResolutionSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('not-found') }).strict(),
  z.object({ state: z.literal('confirmed'), receipt: z.object({
    requestId: uuid, day: dayKeySchema, routineId: uuid,
    status: z.enum(['pending', 'completed', 'skipped']), revision,
  }).strict(), reconciliation: z.enum(['current', 'manual-review']) }).strict(),
]);
export type OfflineOutcomeResolution = z.infer<typeof offlineOutcomeResolutionSchema>;

/** Enforce streaming bytes, even with absent/lying Content-Length. Never log the body. */
export async function readOfflineIntent(request: Request): Promise<OfflineOutcomeIntent> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '') ||
      Number(request.headers.get('content-length') || 0) > OFFLINE_INTENT_BYTES) throw new z.ZodError([]);
  const reader = request.body?.getReader();
  if (!reader) throw new z.ZodError([]);
  const parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > OFFLINE_INTENT_BYTES) { await reader.cancel(); throw new z.ZodError([]); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new z.ZodError([]); }
  return offlineOutcomeIntentSchema.parse(body);
}
