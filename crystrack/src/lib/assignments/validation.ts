import { z } from 'zod';
const calendarDate = z.string().refine((v) => {
  const day = v.slice(0, 10);
  const d = new Date(day);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === day;
}, 'Choose a valid date.');
const deadline = calendarDate.refine((v) =>
  /^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?)?$/.test(
    v,
  ),
);
const subtask = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(255),
    completed: z.boolean(),
  })
  .strict();
export const assignmentFields = z
  .object({
    title: z.string().trim().min(1).max(255),
    description: z.string().max(10000).nullable().optional(),
    deadline,
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    category: z.string().max(100).nullable().optional(),
    courseCode: z.string().trim().max(30).nullable().optional(),
    academicKind: z.enum(['Assignment', 'Test', 'Lab', 'Project']).optional(),
    pointWeight: z
      .number()
      .finite()
      .min(0)
      .max(100)
      .multipleOf(0.01)
      .nullable()
      .optional(),
    estimatedMinutes: z.number().int().min(0).max(60000).nullable().optional(),
    workStartAt: deadline.nullable().optional(),
    subtasks: z
      .array(subtask)
      .max(50)
      .refine((v) => new Set(v.map((s) => s.id)).size === v.length)
      .optional(),
    reminderConfig: z
      .object({
        enabled: z.boolean(),
        channels: z
          .array(z.enum(['push', 'telegram']))
          .min(1)
          .max(2),
        offsetMinutes: z.array(z.number().int().min(0).max(43200)).max(20),
      })
      .strict()
      .optional(),
  })
  .strict();
export const assignmentPatch = assignmentFields
  .partial()
  .extend({
    expectedRevision: z.number().int().nonnegative(),
    status: z.enum(['active', 'dropped']).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 1);
