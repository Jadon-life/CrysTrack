import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  previewEnabled,
  sameOrigin,
  allowPreviewRequest,
} from "@/lib/coach-preview/guard";
import { decisionInput } from "@/lib/coach-preview/contracts";
import { readProposal } from "@/lib/coach-preview/signing";
import { invalidateToday } from "@/lib/rhythm/cache";
export async function POST(request: Request) {
  if (!previewEnabled()) return new Response(null, { status: 404 });
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Return to your preview workspace to confirm." },
      { status: 403 },
    );
  const db = await createClient(),
    {
      data: { user },
    } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in to confirm." }, { status: 401 });
  if (!allowPreviewRequest("action:" + user.id, 30))
    return NextResponse.json(
      { error: "Please try again in a minute." },
      { status: 429 },
    );
  const parsed = decisionInput.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check this confirmation link." },
      { status: 400 },
    );
  let proposal;
  try {
    proposal = readProposal(parsed.data.token, user.id);
  } catch {
    return NextResponse.json(
      {
        error: "This confirmation has expired or belongs to another workspace.",
      },
      { status: 400 },
    );
  }
  const { data, error } = await db.rpc("preview_decide_coach_action", {
    p_id: proposal.id,
    p_tool: proposal.tool,
    p_approve: parsed.data.decision === "approve",
  });
  if (error) {
    console.error("Preview action failed", error);
    return NextResponse.json(
      {
        error:
          "This proposal could not be saved. Refresh your preview data and try again.",
      },
      { status: ["40001", "23514"].includes(error.code) ? 409 : 503 },
    );
  }
  invalidateToday(user.id);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
