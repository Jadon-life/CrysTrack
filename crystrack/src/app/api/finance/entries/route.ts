import { entryCreate, legacyEntryInput } from "@/lib/finance/validation";
import {
  financeWriteGuard,
  financeTransaction,
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
  const blocked = financeWriteGuard();
  if (blocked) return blocked;
  const parsed = entryCreate.safeParse(
    legacyEntryInput(await request.json().catch(() => null)),
  );
  if (!parsed.success) return invalid();
  try {
    const { requestId, ...fields } = parsed.data;
    const payload = await entryPayload(db, user.id, fields);
    const { data, error } = await financeTransaction(db, "entry", {
      id: null,
      requestId,
      payload: payload,
    });
    if (error) throw error;
    // 0009 emits the single activity event inside the same ledger transaction.
    return financeSaved(user.id, data, 201);
  } catch (e) {
    return financeError(e);
  }
}
