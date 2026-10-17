import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  previewEnabled,
  sameOrigin,
  allowPreviewRequest,
} from "@/lib/coach-preview/guard";
import { readProposal } from "@/lib/coach-preview/signing";
import { z } from "zod";
export async function POST(request: Request) {
  if (!previewEnabled()) return new Response(null, { status: 404 });
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const db = await createClient(),
    {
      data: { user },
    } = await db.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  if (!allowPreviewRequest("inspect:" + user.id, 30))
    return new Response(null, { status: 429 });
  const input = z
    .object({ token: z.string().max(12000) })
    .strict()
    .safeParse(await request.json().catch(() => null));
  try {
    if (!input.success) throw new Error("Invalid link");
    const proposal = readProposal(input.data.token, user.id);
    return NextResponse.json(
      { tool: proposal.tool },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "This confirmation expired or belongs to another workspace." },
      { status: 400 },
    );
  }
}
