import { entryFields } from "@/lib/finance/validation";
import {
  financeSession,
  financeError,
  financeSaved,
  entryPayload,
  unauthorized,
  invalid,
} from "@/lib/finance/server";
export async function POST(request: Request) {
  const { db, user } = await financeSession();
  if (!user) return unauthorized();
  const parsed = entryFields.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid();
  try {
    const payload = await entryPayload(db, user.id, parsed.data);
    const { data, error } = await db.rpc("wealth_write_entry", {
      p_id: null,
      p_payload: payload,
    });
    if (error) throw error;
    return financeSaved(user.id, data, 201);
  } catch (e) {
    return financeError(e);
  }
}
