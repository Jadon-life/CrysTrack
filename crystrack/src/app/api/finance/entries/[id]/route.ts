import { z } from "zod";
import { entryPatch } from "@/lib/finance/validation";
import {
  financeSession,
  financeError,
  financeSaved,
  entryPayload,
  unauthorized,
  invalid,
} from "@/lib/finance/server";
async function write(
  request: Request,
  context: { params: Promise<{ id: string }> },
  remove: boolean,
) {
  const { db, user } = await financeSession();
  if (!user) return unauthorized();
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return invalid();
  const body = await request.json().catch(() => null),
    parsed = (
      remove
        ? z.object({ expectedRevision: z.number().int().positive() }).strict()
        : entryPatch
    ).safeParse(body);
  if (!parsed.success) return invalid();
  try {
    const { expectedRevision, ...rest } = parsed.data;
    const action = remove ? "delete" : "action" in rest ? rest.action : "save";
    delete (rest as { action?: string }).action;
    const { data, error } = await db.rpc("wealth_write_entry", {
      p_id: id,
      p_revision: expectedRevision,
      p_action: action,
      p_payload: await entryPayload(db, user.id, rest),
    });
    if (error) throw error;
    return financeSaved(user.id, data);
  } catch (e) {
    return financeError(e);
  }
}
export const PATCH = (r: Request, c: { params: Promise<{ id: string }> }) =>
  write(r, c, false);
export const DELETE = (r: Request, c: { params: Promise<{ id: string }> }) =>
  write(r, c, true);
