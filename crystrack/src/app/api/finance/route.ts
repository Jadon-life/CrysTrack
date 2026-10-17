import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: targets }, { data: entries }] = await Promise.all([
    supabase
      .from("finance_targets")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active"),
    supabase
      .from("money_entries")
      .select("*")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({ targets: targets || [], entries: entries || [] });
}

export { POST } from "./entries/route";
