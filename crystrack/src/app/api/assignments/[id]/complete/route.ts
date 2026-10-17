import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { financeError } from "@/lib/finance/server";
import { z } from "zod";
export async function PATCH(
  _request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!z.string().uuid().safeParse(id).success)
    return NextResponse.json(
      { error: "Check the assignment ID." },
      { status: 400 },
    );
  const current = await db
    .from("assignments")
    .select("deadline,status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (current.error) return financeError(current.error);
  if (!current.data || current.data.status === "completed")
    return NextResponse.json(
      { error: "Assignment not found or already completed" },
      { status: 404 },
    );
  if (new Date(current.data.deadline).getTime() < Date.now())
    return NextResponse.json(
      { error: "Assignment deadline has passed; completion is closed" },
      { status: 409 },
    );
  const { data, error } = await db.rpc("finish_academic_assignment", {
    p_id: id,
  });
  if (error) return financeError(error);
  // 0007 emits the completion event and cancels reminders in the same transaction.
  return NextResponse.json(data);
}
