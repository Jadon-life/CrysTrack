import { NextResponse } from "next/server";
import {
  financeSession,
  financeError,
  unauthorized,
} from "@/lib/finance/server";
import { loadWealth } from "@/lib/finance/data";
export const dynamic = "force-dynamic";
export async function GET() {
  const { db, user } = await financeSession();
  if (!user) return unauthorized();
  try {
    return NextResponse.json(await loadWealth(db, user.id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return financeError(e);
  }
}
