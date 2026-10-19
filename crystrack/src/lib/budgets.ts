import { z } from 'zod';
import { EXPERIENCE_CONFIG } from '../config/experience';
import { dayKeySchema } from './daily-records';
import { kobo, usedPercent } from './budget-money';
export const budgetCategories = EXPERIENCE_CONFIG.wealth.categories;
export const budgetCategorySchema = z
  .string()
  .refine(
    (c) => budgetCategories.some((category) => category === c),
    'Choose a supported category',
  );
export const budgetMonthSchema = dayKeySchema.refine(
  (d) => d.endsWith('-01'),
  'Choose a calendar month',
);
export const exactAmountSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/)
  .max(60);
export const limitSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/)
  .refine((v) => {
    try {
      return kobo(v) > BigInt(0) && kobo(v) < BigInt(1000000000000);
    } catch {
      return false;
    }
  }, 'Use a positive NGN limit with at most two decimal places');
export const budgetQuerySchema = z.object({ month: budgetMonthSchema.optional() }).strict();
const base = {
  month: budgetMonthSchema,
  category: budgetCategorySchema,
  revision: z.number().int().nonnegative(),
  requestId: z.string().uuid(),
  timezone: z.string().min(1).max(100),
};
export const budgetSetSchema = z.object({ ...base, limit: limitSchema }).strict();
export const budgetRemoveSchema = z
  .object(base)
  .strict()
  .refine((v) => v.revision > 0, 'Refresh before removing');
export const budgetViewSchema = z
  .object({
    month: budgetMonthSchema,
    currentMonth: budgetMonthSchema,
    minimum: budgetMonthSchema,
    timezone: z.string(),
    currency: z.literal('NGN'),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    items: z
      .array(
        z.object({
          category: budgetCategorySchema,
          id: z.string().uuid().nullable(),
          revision: z.number().int().nonnegative(),
          active: z.boolean(),
          limit: limitSchema.nullable(),
          spent: exactAmountSchema,
          entryCount: z.number().int().nonnegative(),
          left: z.string().nullable(),
          percentUsed: exactAmountSchema.nullable(),
          createdAt: z.string().datetime({ offset: true }).nullable(),
          updatedAt: z.string().datetime({ offset: true }).nullable(),
          removedAt: z.string().datetime({ offset: true }).nullable(),
        }),
      )
      .length(budgetCategories.length),
  })
  .superRefine((v, ctx) => {
    const fail = () =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Budget evidence is inconsistent' });
    try {
      new Intl.DateTimeFormat('en', { timeZone: v.timezone });
      if (
        v.month < v.minimum ||
        v.month > v.currentMonth ||
        v.minimum !== shiftMonth(v.currentMonth, -12) ||
        new Date(v.startsAt) >= new Date(v.endsAt)
      )
        fail();
      v.items.forEach((b, i) => {
        if (
          b.category !== budgetCategories[i] ||
          b.active !== (b.limit !== null) ||
          (b.id === null) !== (b.revision === 0) ||
          (b.id === null) !== (b.createdAt === null) ||
          (b.id === null && (b.active || b.updatedAt !== null || b.removedAt !== null)) ||
          (b.id !== null && (b.updatedAt === null || (!b.active && b.removedAt === null)))
        )
          fail();
        if (b.active) {
          if (
            b.removedAt ||
            b.left === null ||
            kobo(b.left) !== kobo(b.limit!) - kobo(b.spent) ||
            b.percentUsed !== usedPercent(b.spent, b.limit!)
          )
            fail();
        } else if (b.left !== null || b.percentUsed !== null) fail();
        if (b.entryCount === 0 && kobo(b.spent) !== BigInt(0)) fail();
      });
    } catch {
      fail();
    }
  });
export type BudgetView = z.infer<typeof budgetViewSchema>;
export type CategoryBudget = BudgetView['items'][number];
export type BudgetSet = z.infer<typeof budgetSetSchema>;
export function shiftMonth(month: string, offset: number) {
  budgetMonthSchema.parse(month);
  const d = new Date(month + 'T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 10);
}
export function monthLabel(month: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(month + 'T12:00:00Z'));
}
