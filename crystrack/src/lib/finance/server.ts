import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { savedTimezone, deadlineInstant } from "@/lib/goals/service";
import { merchantCategory } from "./logic";
import { invalidateToday } from "@/lib/rhythm/cache";
export async function financeSession() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  return { db, user };
}
export function financeError(error: unknown) {
  console.error("Wealth operation failed:", error);
  const code = (error as { code?: string })?.code;
  const status =
    code === "40001" || code === "23505"
      ? 409
      : code === "42501"
        ? 403
        : code === "P0002"
          ? 404
          : ["23514", "22023", "22P02", "23503", "23502", "22003"].includes(
                code || "",
              )
            ? 400
            : 500;
  return NextResponse.json(
    {
      error:
        status === 409
          ? "This item changed or was already recorded. Refresh and try again."
          : status === 403
            ? "Choose accounts and targets from your own Wealth plan."
            : status === 404
              ? "This item is no longer available."
              : status === 400
                ? "Check your details, account choices and savings unlock date."
                : "We could not save your Wealth changes. Please try again.",
    },
    { status },
  );
}
export async function entryPayload(
  db: Awaited<ReturnType<typeof createClient>>,
  uid: string,
  payload: Record<string, unknown>,
) {
  if (
    !payload.category &&
    (typeof payload.source === "string" || typeof payload.note === "string")
  )
    payload.category =
      merchantCategory(`${payload.source || ""} ${payload.note || ""}`) || "";
  const date = payload.date;
  if (typeof date === "string" && !date.includes("T"))
    payload.date = deadlineInstant(date, await savedTimezone(db, uid));
  return payload;
}
export function financeSaved(uid: string, data: unknown, status = 200) {
  invalidateToday(uid);
  return NextResponse.json(data, { status });
}
export const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });
export const invalid = () =>
  NextResponse.json(
    { error: "Check the form details and try again." },
    { status: 400 },
  );
