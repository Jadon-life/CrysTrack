import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  previewEnabled,
  sameOrigin,
  allowPreviewRequest,
} from "@/lib/coach-preview/guard";
export async function POST(request: Request) {
  if (!previewEnabled()) return new Response(null, { status: 404 });
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const db = await createClient(),
    {
      data: { user },
    } = await db.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  if (!allowPreviewRequest("connect:" + user.id, 5))
    return new Response(null, { status: 429 });
  const username = process.env.PIECE9_TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  if (
    !username ||
    !/^\w{5,32}$/.test(username) ||
    username === process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "")
  )
    return NextResponse.json(
      { error: "Configure a separate staging bot first." },
      { status: 503 },
    );
  const token = randomBytes(24).toString("base64url"),
    expiresAt = new Date(Date.now() + 15 * 60000).toISOString();
  const { error } = await db
    .from("telegram_link_tokens")
    .insert({ user_id: user.id, token, expires_at: expiresAt });
  if (error) {
    console.error("Preview bot link failed", error);
    return NextResponse.json(
      { error: "A connection link could not be created." },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { url: `https://t.me/${username}?start=${token}`, expiresAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}
