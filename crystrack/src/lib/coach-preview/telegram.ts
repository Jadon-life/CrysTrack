import { createHash } from "node:crypto";
import { loadToday } from "@/lib/rhythm/service";
import { savedTimezone } from "@/lib/goals/service";
import { dateKeyForInstant } from "@/lib/reminders";
import type { createAdminClient } from "@/lib/supabase/admin";
export function telegramProposalId(uid: string, updateId: number) {
  const hash = createHash("sha256")
    .update("piece9:" + uid + ":" + updateId)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export function confirmationUrl(token: string) {
  const origin = new URL(process.env.PIECE9_PREVIEW_APP_URL || "");
  if (origin.protocol !== "https:" || origin.username || origin.password)
    throw new Error("A secure preview origin is required");
  if (
    process.env.NEXT_PUBLIC_APP_URL &&
    origin.origin === new URL(process.env.NEXT_PUBLIC_APP_URL).origin &&
    process.env.VERCEL_ENV !== "preview"
  )
    throw new Error("Use a dedicated staging origin");
  return origin.origin + "/preview/coach#confirm=" + encodeURIComponent(token);
}
export async function sendPreviewTelegram(
  chatId: number,
  text: string,
  url?: string,
) {
  const token = process.env.PIECE9_TELEGRAM_BOT_TOKEN;
  if (!token || token === process.env.TELEGRAM_BOT_TOKEN)
    throw new Error("Use a separate staging bot");
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(url
          ? {
              reply_markup: {
                inline_keyboard: [
                  [{ text: "Review in preview workspace", url }],
                ],
              },
            }
          : {}),
      }),
    },
  );
  if (!response.ok)
    throw new Error("Staging Telegram delivery failed: " + response.status);
}
export async function dailyAgenda(
  admin: ReturnType<typeof createAdminClient>,
  uid: string,
) {
  const timezone = await savedTimezone(admin, uid),
    today = await loadToday(admin, uid, timezone),
    day = today.day;
  const lines = today.tasks
    .filter((t) => t.scheduled_today && t.today_status !== "completed")
    .slice(0, 10)
    .map((t) => "• " + t.title);
  for (const item of today.assignments
    .filter((a) => dateKeyForInstant(new Date(a.deadline), timezone) === day)
    .slice(0, 5))
    lines.push("• Assignment: " + item.title);
  for (const box of today.boxes
    .filter((b) => b.occurrence_day === day)
    .slice(0, 5))
    lines.push(
      "• Focus: " +
        new Intl.DateTimeFormat("en-GB", {
          timeZone: timezone,
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(box.starts_at)) +
        " " +
        (box.task_title || "Your task"),
    );
  return (
    `Your preview agenda for ${day} (${timezone})\n` +
    (lines.length
      ? lines.join("\n")
      : "There is room to choose a gentle priority today.")
  );
}
