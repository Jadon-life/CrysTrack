import { NextResponse } from "next/server";
import { previewEnabled, allowPreviewRequest } from "@/lib/coach-preview/guard";
import { telegramUpdate, expenseFromText } from "@/lib/coach-preview/contracts";
import { secretMatches, signProposal } from "@/lib/coach-preview/signing";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  telegramProposalId,
  confirmationUrl,
  sendPreviewTelegram,
  dailyAgenda,
} from "@/lib/coach-preview/telegram";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!previewEnabled()) return new Response(null, { status: 404 });
  const secret = process.env.PIECE9_TELEGRAM_WEBHOOK_SECRET;
  if (
    !secret ||
    secret === process.env.TELEGRAM_WEBHOOK_SECRET ||
    !secretMatches(
      request.headers.get("x-telegram-bot-api-secret-token"),
      secret,
    )
  )
    return new Response(null, { status: 401 });
  const parsed = telegramUpdate.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  const message = parsed.data.message;
  if (
    !message ||
    !message.text ||
    message.chat.type !== "private" ||
    message.from?.is_bot ||
    message.from?.id !== message.chat.id
  )
    return NextResponse.json({ ok: true });
  if (!allowPreviewRequest("telegram:" + message.chat.id, 20))
    return new Response(null, { status: 429 });
  try {
    const admin = createAdminClient(),
      text = message.text.trim(),
      start = /^\/start\s+([A-Za-z0-9_-]{32})$/.exec(text);
    if (start) {
      const { data: link, error } = await admin
        .from("telegram_link_tokens")
        .update({ consumed_at: new Date().toISOString() })
        .eq("token", start[1])
        .is("consumed_at", null)
        .gt("expires_at", new Date().toISOString())
        .select("user_id")
        .maybeSingle();
      if (error) throw error;
      if (!link) {
        await sendPreviewTelegram(
          message.chat.id,
          "This preview connection link expired. Create a fresh one in your preview coach.",
        );
        return NextResponse.json({ ok: true });
      }
      const linked = await admin.rpc("link_telegram_connection", {
        p_user_id: link.user_id,
        p_chat_id: String(message.chat.id),
        p_username: message.from.username || null,
        p_first_name: message.from.first_name || null,
      });
      if (linked.error) throw linked.error;
      await sendPreviewTelegram(
        message.chat.id,
        "Your preview bot is connected. Try /today or “Spent 2500 on lunch”. Expenses always wait for your approval in CrysTrack.",
      );
      return NextResponse.json({ ok: true });
    }
    const { data: connection, error } = await admin
      .from("telegram_connections")
      .select("user_id")
      .eq("chat_id", String(message.chat.id))
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!connection) {
      await sendPreviewTelegram(
        message.chat.id,
        "Connect this staging bot from your CrysTrack preview coach first.",
      );
      return NextResponse.json({ ok: true });
    }
    const tool = expenseFromText(text);
    if (tool) {
      const token = signProposal(
        connection.user_id,
        tool,
        telegramProposalId(connection.user_id, parsed.data.update_id),
      );
      await sendPreviewTelegram(
        message.chat.id,
        `Review this preview expense: ₦${tool.amount} on ${tool.note}. Nothing is saved until you approve it in your signed-in preview workspace.`,
        confirmationUrl(token),
      );
    } else if (/^\/(today|agenda)(?:@\w+)?$|^(today|agenda)$/i.test(text))
      await sendPreviewTelegram(
        message.chat.id,
        await dailyAgenda(admin, connection.user_id),
      );
    else
      await sendPreviewTelegram(
        message.chat.id,
        "Try /today for your daily agenda, or “Spent 2500 on lunch” to review an expense.",
      );
    return NextResponse.json({ ok: true });
  } catch {
    console.error(
      "Staging Telegram handler failed; check preview configuration and database availability.",
    );
    return NextResponse.json(
      { error: "Preview bot is temporarily unavailable." },
      { status: 503 },
    );
  }
}
