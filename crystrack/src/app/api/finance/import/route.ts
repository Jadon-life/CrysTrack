import { importRows } from "@/lib/finance/validation";
import {
  financeSession,
  financeError,
  financeSaved,
  entryPayload,
  unauthorized,
  invalid,
} from "@/lib/finance/server";
import { statementKey } from "@/lib/finance/statement";
export async function POST(request: Request) {
  const { db, user } = await financeSession();
  if (!user) return unauthorized();
  const parsed = importRows.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid();
  try {
    const rows = [];
    for (const row of parsed.data.rows) {
      const importKey = statementKey(row);
      rows.push(await entryPayload(db, user.id, { ...row, importKey }));
    }
    const { data, error } = await db.rpc("wealth_import", { p_rows: rows });
    if (error) throw error;
    return financeSaved(user.id, { imported: data });
  } catch (e) {
    return financeError(e);
  }
}
