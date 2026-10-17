import { z } from "zod";
import {
  financeSession,
  financeWriteGuard,
  financeError,
  unauthorized,
  invalid,
  financeSaved,
} from "@/lib/finance/server";
const fields = z
  .object({
    name: z.string().trim().min(1).max(100),
    kind: z.enum(["cash", "bank", "savings", "usd_wallet"]),
  })
  .strict();
export async function POST(request: Request) {
  const { db, user } = await financeSession();
  if (!user) return unauthorized();
  const blocked = financeWriteGuard();
  if (blocked) return blocked;
  const parsed = fields.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid();
  try {
    const { data, error } = await db
      .from("wealth_accounts")
      .insert({ user_id: user.id, ...parsed.data, opening_balance: "0.00" })
      .select()
      .single();
    if (error) throw error;
    return financeSaved(user.id, data, 201);
  } catch (error) {
    return financeError(error);
  }
}
