import { z } from 'zod';
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  });
const ref = z
  .object({
    type: z.enum(['task', 'assignment', 'goal']),
    id: z.string().uuid(),
  })
  .strict();
export const ritualInput = z
  .object({
    kind: z.enum(['morning', 'evening', 'weekly']),
    day,
    topThree: z.array(ref).max(3),
    deferred: z.array(ref).max(50),
    deferredTo: day.nullable(),
    capacityMinutes: z.number().int().min(0).max(1440),
    wins: z.string().max(3000),
    reflection: z.string().max(500),
    nextFocus: z.array(z.string().uuid()).max(3),
    expectedRevision: z.number().int().min(0),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.topThree.map((r) => r.type + r.id)).size ===
        v.topThree.length &&
      new Set(v.deferred.map((r) => r.type + r.id)).size ===
        v.deferred.length &&
      !v.topThree.some((r) =>
        v.deferred.some((d) => r.type === d.type && r.id === d.id),
      ) &&
      (!v.deferred.length || Boolean(v.deferredTo && v.deferredTo > v.day)),
  );
export const boxInput = z
  .object({
    taskId: z.string().uuid(),
    day,
    startsAt: z.string().datetime({ offset: true }),
    minutes: z.number().int().min(5).max(480),
  })
  .strict();
export const focusInput = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('start'),
      taskId: z.string().uuid(),
      minutes: z.number().int().min(1).max(180),
      id: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.enum(['pause', 'resume', 'complete', 'cancel']),
      id: z.string().uuid(),
    })
    .strict(),
]);
