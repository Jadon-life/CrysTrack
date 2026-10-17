import { NextResponse } from "next/server";
import {
  financeSession,
  financeError,
  unauthorized,
} from "@/lib/finance/server";
import { loadWealth } from "@/lib/finance/data";
export { POST } from "./entries/route";
export async function GET() {
  const { db, user } = await financeSession();
  if (!user) return unauthorized();
  try {
    const data = await loadWealth(db, user.id);
    return NextResponse.json(
      { targets: data.targets, entries: data.entries.slice(0, 20) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return financeError(error);
  }
}
