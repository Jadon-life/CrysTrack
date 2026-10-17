import { NextResponse } from "next/server";
import {
  financeSession,
  financeError,
  unauthorized,
} from "@/lib/finance/server";
import { loadWealth, readLedger } from "@/lib/finance/data";
import { exportCSV } from "@/lib/finance/statement";
export async function GET(request: Request) {
  const { db, user } = await financeSession();
  if (!user) return unauthorized();
  try {
    const data = await loadWealth(db, user.id);
    data.entries = await readLedger(db, user.id, true);
    const csv = new URL(request.url).searchParams.get("format") === "csv";
    return new NextResponse(
      csv ? exportCSV(data.entries) : JSON.stringify(data, null, 2),
      {
        headers: {
          "Content-Type": csv ? "text/csv; charset=utf-8" : "application/json",
          "Content-Disposition": `attachment; filename="crystrack-wealth.${csv ? "csv" : "json"}"`,
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (e) {
    return financeError(e);
  }
}
