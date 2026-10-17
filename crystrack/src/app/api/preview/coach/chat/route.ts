import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  previewEnabled,
  sameOrigin,
  allowPreviewRequest,
} from "@/lib/coach-preview/guard";
import { chatInput } from "@/lib/coach-preview/contracts";
import { coachContext } from "@/lib/coach-preview/context";
import { coachStream } from "@/lib/coach-preview/stream";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!previewEnabled()) return new Response(null, { status: 404 });
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Open the coach from your preview workspace." },
      { status: 403 },
    );
  const db = await createClient(),
    {
      data: { user },
    } = await db.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Sign in to continue." },
      { status: 401 },
    );
  if (!allowPreviewRequest("chat:" + user.id))
    return NextResponse.json(
      { error: "Take a breath and try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  const input = chatInput.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json(
      { error: "Please send a shorter message." },
      { status: 400 },
    );
  if (!process.env.OPENROUTER_API_KEY)
    return NextResponse.json(
      { error: "Preview AI is not configured yet." },
      { status: 503 },
    );
  try {
    const context = await coachContext(db, user.id),
      encoder = new TextEncoder(),
      abort = new AbortController();
    const stop = () => abort.abort();
    request.signal.addEventListener("abort", stop, { once: true });
    const timeout = setTimeout(stop, 60000);
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: unknown) => {
          if (!cancelled && !abort.signal.aborted)
            controller.enqueue(
              encoder.encode("data: " + JSON.stringify(event) + "\n\n"),
            );
        };
        try {
          send({
            type: "context",
            chips: context.chips,
            timezone: context.timezone,
            today: context.today,
          });
          for await (const event of coachStream(
            context,
            input.data.messages,
            user.id,
            abort.signal,
          ))
            send(event);
        } catch (error) {
          if (!abort.signal.aborted) {
            console.error("Preview coach stream failed", error);
            send({
              type: "error",
              message:
                "Your coach paused. No changes were saved; ready to try again?",
            });
          }
        } finally {
          clearTimeout(timeout);
          request.signal.removeEventListener("abort", stop);
          if (!cancelled) controller.close();
        }
      },
      cancel() {
        cancelled = true;
        stop();
        clearTimeout(timeout);
        request.signal.removeEventListener("abort", stop);
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Preview context unavailable", error);
    return NextResponse.json(
      { error: "Your preview statistics could not load. Please try again." },
      { status: 503 },
    );
  }
}
