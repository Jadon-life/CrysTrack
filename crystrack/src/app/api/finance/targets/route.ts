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
    title: z.string().trim().min(1).max(255),
    targetAmount: positiveMoney,
    deadline: day.nullable().optional(),
    description: z.string().max(4000).optional(),
    lockedUntil: day.nullable().optional(),
  })
  .strict();
export async function POST(request: Request) {
  const { db, user } = await financeSession();
  if (!user) return unauthorized();
  const parsed = fields.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid();
  try {
    const p = parsed.data,
      d = p.deadline
        ? await entryPayload(db, user.id, { date: p.deadline })
        : null;
    const { data, error } = await db
      .from("finance_targets")
      .insert({
        user_id: user.id,
        title: p.title,
        target_amount: p.targetAmount,
        deadline: d?.date || null,
        description: p.description || null,
        locked_until: p.lockedUntil || null,
      })
      .select()
      .single();
    if (error) throw error;
    return financeSaved(user.id, data, 201);
  } catch (e) {
    return financeError(e);
  }
}
