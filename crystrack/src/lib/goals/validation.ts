import { z } from 'zod';
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
  );
const numeric = z
  .union([
    z.string().regex(/^-?\d{1,8}(\.\d{1,2})?$/),
    z.number().finite().min(-99999999).max(99999999),
  ])
  .nullable();
const channels = z
  .array(z.enum(['push', 'telegram']))
  .min(1)
  .max(2);
export const goalFields = z
  .object({
    title: z.string().trim().min(1).max(255),
    description: z.string().max(10000).nullable().optional(),
    category: z.string().max(100).nullable().optional(),
    deadline: z
      .union([date, z.string().datetime({ offset: true })])
      .nullable()
      .optional(),
    progressMode: z.enum(['percentage', 'ai']).optional(),
    startingValue: numeric.optional(),
    targetValue: numeric.optional(),
    progressValue: numeric.optional(),
    progressUnit: z.string().max(50).nullable().optional(),
    aiCoaching: z.boolean().optional(),
    checkinConfig: z
      .object({
        frequency: z.enum(['daily', 'weekly', 'specific']),
        days: z.array(z.number().int().min(0).max(6)).max(7),
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        channels,
      })
      .refine((v) => v.frequency === 'daily' || v.days.length > 0)
      .optional(),
    deadlineReminderConfig: z
      .object({
        enabled: z.boolean(),
        offsetMinutes: z.array(z.number().int().min(0).max(525600)).max(10),
        channels,
      })
      .optional(),
    whyMatters: z.string().max(5000).nullable().optional(),
    badge: z
      .enum(['target', 'book', 'heart', 'sparkles', 'mountain'])
      .optional(),
    reflection: z.string().max(5000).nullable().optional(),
    status: z.enum(['active', 'achieved', 'paused', 'let_go']).optional(),
    progressSource: z.enum(['manual', 'milestones', 'tasks']).optional(),
    routineTarget: z.number().int().min(1).max(100000).optional(),
    financeTargetId: z.string().uuid().nullable().optional(),
    taskIds: z
      .array(z.string().uuid())
      .max(50)
      .refine((v) => new Set(v).size === v.length)
      .optional(),
    milestones: z
      .array(
        z.object({
          id: z.string().uuid(),
          title: z.string().trim().min(1).max(255),
          dueDate: date.nullable(),
          completedAt: z.string().datetime({ offset: true }).nullable(),
        }),
      )
      .max(50)
      .refine((v) => new Set(v.map((m) => m.id)).size === v.length)
      .optional(),
  })
  .strict();
export const goalPatch = goalFields
  .partial()
  .extend({ expectedRevision: z.number().int().nonnegative() })
  .refine((v) => Object.keys(v).length > 1);
