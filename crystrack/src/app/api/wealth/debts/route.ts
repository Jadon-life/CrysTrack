import { z } from "zod";
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
    kind: z.enum(["receivable", "liability"]),
    counterparty: z.string().trim().min(1).max(255),
    amount: positiveMoney,
    dueDate: day.nullable().optional(),
    note: z.string().max(4000).optional(),
  })
  .strict();
export async function POST(request: Request) {
  const { db, user } = await financeSession();
  if (!user) return unauthorized();
  const parsed = fields.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid();
  try {
    const p = parsed.data,
      d = p.dueDate
        ? await entryPayload(db, user.id, { date: p.dueDate })
        : null;
    const { data, error } = await db.rpc("create_wealth_debt", {
      p_kind: p.kind,
      p_counterparty: p.counterparty,
      p_amount: p.amount,
      p_due_date: d?.date || null,
      p_note: p.note || null,
    });
    if (error) throw error;
    return financeSaved(user.id, data, 201);
  } catch (e) {
    return financeError(e);
  }
}
export async function PATCH(request: Request) {
  const { db, user } = await financeSession();
  if (!user) return unauthorized();
  const parsed = z
    .object({ debtId: z.string().uuid(), amount: positiveMoney })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid();
  try {
    const { data, error } = await db.rpc("repay_wealth_debt", {
      p_debt_id: parsed.data.debtId,
      p_amount: parsed.data.amount,
    });
    if (error) throw error;
    return financeSaved(user.id, data);
  } catch (e) {
    return financeError(e);
  }
}
