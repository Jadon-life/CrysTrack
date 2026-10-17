import { z } from "zod";
const id = z.string().uuid();
const amount = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/)
  .refine((v) => /[1-9]/.test(v), "Choose a positive amount");
export const coachTool = z
  .discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("create_task"),
        title: z.string().trim().min(1).max(255),
        weekdays: z
          .array(z.number().int().min(0).max(6))
          .min(1)
          .max(7)
          .refine((v) => new Set(v).size === v.length),
      })
      .strict(),
    z
      .object({
        kind: z.literal("reallocate_budget"),
        from: id,
        to: id,
        amount,
      })
      .strict(),
    z
      .object({
        kind: z.literal("adjust_goal_target"),
        goalId: id,
        expectedRevision: z.number().int().nonnegative(),
        targetValue: amount,
      })
      .strict(),
    z
      .object({
        kind: z.literal("log_expense"),
        amount,
        note: z.string().trim().min(1).max(255),
      })
      .strict(),
  ])
  .superRefine((v, ctx) => {
    if (v.kind === "reallocate_budget" && v.from === v.to)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose different budget categories",
      });
  });
export type CoachTool = z.infer<typeof coachTool>;
export const chatInput = z
  .object({
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(4000),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict()
  .refine((v) => v.messages.at(-1)?.role === "user");
export const decisionInput = z
  .object({
    token: z.string().min(1).max(12000),
    decision: z.enum(["approve", "dismiss"]),
  })
  .strict();
export const telegramUpdate = z.object({
  update_id: z.number().int().nonnegative(),
  message: z
    .object({
      message_id: z.number().int().nonnegative(),
      text: z.string().max(4000).optional(),
      chat: z.object({
        id: z.number().int().safe(),
        type: z.enum(["private", "group", "supergroup", "channel"]),
      }),
      from: z
        .object({
          id: z.number().int().safe(),
          is_bot: z.boolean().optional(),
          username: z.string().max(255).optional(),
          first_name: z.string().max(255).optional(),
        })
        .optional(),
    })
    .optional(),
});
export type CardState =
  | "pending"
  | "applying"
  | "approved"
  | "dismissed"
  | "failed";
export function cardTransition(
  state: CardState,
  event: "approve" | "dismiss" | "success" | "failure",
): CardState {
  if (state === "pending")
    return event === "approve"
      ? "applying"
      : event === "dismiss"
        ? "dismissed"
        : state;
  if (state === "applying")
    return event === "success"
      ? "approved"
      : event === "failure"
        ? "failed"
        : state;
  return state;
}
export function expenseFromText(
  text: string,
): Extract<CoachTool, { kind: "log_expense" }> | null {
  const match =
    /^spent\s+(?:₦|NGN\s*)?(\d{1,9}(?:\.\d{1,2})?)\s+on\s+(.{1,255})$/i.exec(
      text.trim(),
    );
  if (!match) return null;
  const result = coachTool.safeParse({
    kind: "log_expense",
    amount: match[1],
    note: match[2],
  });
  return result.success && result.data.kind === "log_expense"
    ? result.data
    : null;
}
