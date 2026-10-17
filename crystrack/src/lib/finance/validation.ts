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
/** Old snake-case endpoint names are aliases, never additional writable DB fields. */
export function legacyEntryInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result: Record<string, unknown> = { ...value };
  for (const key of ["source", "category", "note"])
    if (result[key] === null) result[key] = "";
  if ("flow_kind" in result) {
    if ("flowKind" in result && result.flowKind !== result.flow_kind)
      return null;
    result.flowKind = result.flow_kind;
    delete result.flow_kind;
  }
  if (
    "type" in result &&
    "flowKind" in result &&
    result.type === "transfer" &&
    result.flowKind === "savings_release"
  )
    delete result.type;
  for (const [old, key] of Object.entries({
    type: "flowKind",
    target_id: "targetId",
    account_id: "accountId",
    destination_account_id: "destinationAccountId",
  })) {
    if (!(old in result)) continue;
    if (key in result && result[key] !== result[old]) return null;
    result[key] = result[old];
    delete result[old];
  }
  return result;
}
export const entryCreate = entryFields
  .extend({ requestId: z.string().uuid().optional() })
  .superRefine((p, ctx) => {
    if (
      p.flowKind === "transfer" &&
      (!p.accountId ||
        !p.destinationAccountId ||
        p.accountId === p.destinationAccountId)
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose two different owned accounts.",
        path: ["destinationAccountId"],
      });
    if (p.flowKind !== "transfer" && p.destinationAccountId)
      ctx.addIssue({
        code: "custom",
        message: "Only transfers have a destination account.",
      });
    if (p.targetId && !["saving", "savings_release"].includes(p.flowKind))
      ctx.addIssue({
        code: "custom",
        message: "Choose a savings action for this target.",
      });
  });
