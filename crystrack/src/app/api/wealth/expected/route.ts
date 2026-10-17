import { z } from "zod";
import { toKobo } from "@/lib/money";
import { positiveMoney, day } from "@/lib/finance/validation";
import {
  financeSession,
  financeError,
  financeSaved,
  entryPayload,
  unauthorized,
  invalid,
} from "@/lib/finance/server";
const fields = z
  .object({
    title: z.string().trim().min(1).max(150),
    direction: z.enum(["income", "expense"]),
    amountMin: positiveMoney,
    amountMax: positiveMoney.nullable(),
    frequency: z.enum([
      "one_off",
      "weekly",
      "monthly",
      "quarterly",
      "yearly",
      "irregular",
    ]),
    expectedOn: day.nullable(),
    category: z.string().max(100),
    timingHint: z.string().max(500),
    note: z.string().max(4000),
  })
  .strict()
  .refine((p) => !p.amountMax || toKobo(p.amountMax) >= toKobo(p.amountMin));
export async function POST(request: Request) {
  const { db, user } = await financeSession();
  if (!user) return unauthorized();
  const parsed = fields.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid();
  try {
    const p = parsed.data,
      d = p.expectedOn
        ? await entryPayload(db, user.id, { date: p.expectedOn })
        : null;
    const { data, error } = await db
      .from("wealth_expected_flows")
      .insert({
        user_id: user.id,
        title: p.title,
        direction: p.direction,
        amount_min: p.amountMin,
        amount_max: p.amountMax,
        frequency: p.frequency,
        expected_on: d?.date || null,
        category: p.category,
        timing_hint: p.timingHint,
        note: p.note,
      })
      .select()
      .single();
    if (error) throw error;
    return financeSaved(user.id, data, 201);
  } catch (e) {
    return financeError(e);
  }
}
const update = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("confirm"),
    flowId: z.string().uuid(),
    actualAmount: positiveMoney,
  }),
  z.object({ action: z.enum(["pause", "resume"]), flowId: z.string().uuid() }),
]);
export async function PATCH(request: Request) {
  const { db, user } = await financeSession();
  if (!user) return unauthorized();
  const parsed = update.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid();
  try {
    const p = parsed.data,
      result =
        p.action === "confirm"
          ? await db.rpc("confirm_expected_flow", {
              p_flow_id: p.flowId,
              p_actual_amount: p.actualAmount,
            })
          : await db
              .from("wealth_expected_flows")
              .update({ status: p.action === "pause" ? "paused" : "active" })
              .eq("id", p.flowId)
              .eq("user_id", user.id)
              .select()
              .single();
    if (result.error) throw result.error;
    return financeSaved(user.id, result.data);
  } catch (e) {
    return financeError(e);
  }
}
