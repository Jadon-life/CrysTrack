import { z } from 'zod';
import { dayKeySchema } from './daily-records';
import { limitSchema, budgetCategorySchema, exactAmountSchema } from './budgets';
export const billFieldsSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    category: budgetCategorySchema,
    merchant: z.string().trim().max(100).nullable(),
    amount: limitSchema,
    frequency: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']),
    firstDue: dayKeySchema,
    endDate: dayKeySchema.nullable(),
    reminderEnabled: z.boolean(),
  })
  .strict()
  .refine((v) => !v.endDate || v.endDate >= v.firstDue, 'End date follows first due date');
export const billMutationResultSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    entryId: z.string().uuid().nullable(),
  })
  .strict();
export const billQuerySchema = z
  .object({
    id: z.string().uuid().optional(),
    page: z.coerce.number().int().min(0).max(10000).default(0),
    revision: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
  })
  .strict()
  .refine((v) => v.page === 0 || v.revision, 'Refresh before paging');
const envelope = {
  id: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  requestId: z.string().uuid(),
  timezone: z.string().min(1).max(100),
};
export const billWriteSchema = z.discriminatedUnion('action', [
  z.object({ ...envelope, action: z.literal('create'), fields: billFieldsSchema }).strict(),
  z.object({ ...envelope, action: z.literal('edit'), fields: billFieldsSchema }).strict(),
  z
    .object({
      ...envelope,
      action: z.literal('pay'),
      fields: z
        .object({
          occurrenceId: z.string().uuid(),
          occurrenceRevision: z.number().int().positive(),
          actualAmount: limitSchema,
        })
        .strict(),
    })
    .strict(),
  ...(['pause', 'resume', 'cancel'] as const).map((action) =>
    z.object({ ...envelope, action: z.literal(action), fields: z.object({}).strict() }).strict(),
  ),
]);
export const billOccurrenceSchema = z
  .object({
    id: z.string().uuid(),
    billId: z.string().uuid(),
    dueDay: dayKeySchema,
    timezone: z.string(),
    title: z.string(),
    category: budgetCategorySchema,
    expected: limitSchema,
    actual: limitSchema.nullable(),
    revision: z.number().int().positive(),
    paidAt: z.string().datetime({ offset: true }).nullable(),
    entryId: z.string().uuid().nullable(),
    status: z.enum(['due_soon', 'overdue', 'planned', 'paid', 'not_confirmed', 'canceled']),
  })
  .superRefine((o, c) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: o.timezone });
    } catch {
      c.addIssue({ code: 'custom', message: 'Occurrence timezone is not confirmed' });
    }
    if (o.status === 'paid' && (!o.paidAt || !o.entryId || !o.actual))
      c.addIssue({ code: 'custom', message: 'Payment proof is not confirmed' });
  });
export const billItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  category: budgetCategorySchema,
  merchant: z.string().nullable(),
  amount: limitSchema,
  frequency: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']),
  firstDue: dayKeySchema,
  endDate: dayKeySchema.nullable(),
  status: z.enum(['active', 'paused', 'canceled']),
  reminderEnabled: z.boolean(),
  revision: z.number().int().positive(),
  next: billOccurrenceSchema.nullable(),
  paidCount: z.number().int().nonnegative(),
});
export const billViewSchema = z
  .object({
    today: dayKeySchema,
    timezone: z.string(),
    revision: z.string().regex(/^[a-f0-9]{32}$/),
    page: z.number().int().nonnegative(),
    hasMore: z.boolean(),
    items: z.array(billItemSchema).max(20),
    occurrences: z.array(billOccurrenceSchema).max(20),
    plans: z.object({
      seven: exactAmountSchema,
      thirty: exactAmountSchema,
      overdue: z.number().int().nonnegative(),
    }),
  })
  .superRefine((v, c) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: v.timezone });
      if (new Set(v.items.map((b) => b.id)).size !== v.items.length) throw Error();
      for (const b of v.items) if (b.next && b.next.billId !== b.id) throw Error();
    } catch {
      c.addIssue({ code: 'custom', message: 'Bill evidence is not confirmed' });
    }
  });
export type BillFields = z.infer<typeof billFieldsSchema>;
export type BillItem = z.infer<typeof billItemSchema>;
export type BillOccurrence = z.infer<typeof billOccurrenceSchema>;
export type BillView = z.infer<typeof billViewSchema>;
export type BillWrite = z.infer<typeof billWriteSchema>;
export function anchoredDue(first: string, frequency: BillFields['frequency'], index: number) {
  dayKeySchema.parse(first);
  if (!Number.isSafeInteger(index) || index < 0 || index > 4096)
    throw Error('Invalid occurrence index');
  const d = new Date(first + 'T12:00Z');
  if (frequency === 'weekly') d.setUTCDate(d.getUTCDate() + index * 7);
  else {
    const anchor = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + index * { monthly: 1, quarterly: 3, yearly: 12 }[frequency]);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(anchor, last));
  }
  return d.toISOString().slice(0, 10);
}
