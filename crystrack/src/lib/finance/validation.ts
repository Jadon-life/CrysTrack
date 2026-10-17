import { z } from "zod";
import { toKobo, fromKobo } from "@/lib/money";
export const money = z.union([z.string(), z.number()]).transform((v, ctx) => {
  try {
    return fromKobo(toKobo(v));
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Use an amount with up to two decimal places.",
    });
    return z.NEVER;
  }
});
export const positiveMoney = money.pipe(
  z
    .string()
    .refine((v) => toKobo(v) > BigInt(0), "Amount must be greater than zero"),
);
export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v,
    "Choose a valid date",
  );
const nullableId = z.string().uuid().nullable();
export const entryFields = z
  .object({
    flowKind: z.enum([
      "income",
      "expense",
      "saving",
      "savings_release",
      "transfer",
    ]),
    amount: positiveMoney,
    date: z.union([day, z.string().datetime({ offset: true })]).optional(),
    source: z.string().trim().max(255).default(""),
    category: z.string().trim().max(100).default(""),
    note: z.string().max(4000).default(""),
    targetId: nullableId.optional(),
    accountId: z.string().uuid().optional(),
    destinationAccountId: nullableId.optional(),
  })
  .strict();
export const entryPatch = entryFields
  .partial()
  .extend({
    expectedRevision: z.number().int().positive(),
    action: z.enum(["save", "restore"]).default("save"),
  })
  .strict();
export const operation = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("account"),
    name: z.string().trim().min(1).max(100),
    accountKind: z.enum(["cash", "bank", "savings", "usd_wallet"]),
    openingBalance: money,
  }),
  z.object({
    kind: z.literal("budget"),
    month: day.refine((v) => v.endsWith("-01")),
    category: z.string().trim().min(1).max(100),
    cap: money,
  }),
  z.object({
    kind: z.literal("reallocate"),
    from: z.string().uuid(),
    to: z.string().uuid(),
    amount: positiveMoney,
  }),
  z.object({
    kind: z.literal("bill"),
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(150),
    amount: positiveMoney,
    nextDue: day,
    frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
    category: z.string().trim().min(1).max(100),
    active: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal("settings"),
    basisPoints: z.number().int().min(0).max(10000),
    targetId: nullableId,
    lowBalance: money,
  }),
  z.object({
    kind: z.literal("circle"),
    title: z.string().trim().min(1).max(150),
    contribution: positiveMoney,
    startsOn: day,
    intervalDays: z.number().int().min(1).max(366),
    members: z.array(z.string().trim().min(1).max(100)).min(2).max(50),
  }),
  z.object({
    kind: z.literal("payBill"),
    billId: z.string().uuid(),
    accountId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("contribution"),
    circleId: z.string().uuid(),
    memberIndex: z.number().int().min(0).max(49),
    round: z.number().int().min(1).max(50),
    amount: positiveMoney,
    paidOn: day,
  }),
]);
export const importRows = z
  .object({
    rows: z
      .array(
        entryFields
          .extend({
            accountId: z.string().uuid(),
            importKey: z.string().min(1).max(200),
          })
          .refine((r) => ["income", "expense"].includes(r.flowKind)),
      )
      .min(1)
      .max(500),
  })
  .strict();
