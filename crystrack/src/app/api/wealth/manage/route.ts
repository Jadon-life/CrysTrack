import { operation } from "@/lib/finance/validation";
import {
  financeSession,
  financeError,
  financeSaved,
  unauthorized,
  invalid,
} from "@/lib/finance/server";
export async function POST(request: Request) {
  const { db, user } = await financeSession();
  if (!user) return unauthorized();
  const parsed = operation.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid();
  const p = parsed.data,
    uid = user.id;
  try {
    let result;
    if (p.kind === "account")
      result = await db
        .from("wealth_accounts")
        .insert({
          user_id: uid,
          name: p.name,
          kind: p.accountKind,
          opening_balance: p.openingBalance,
        })
        .select()
        .single();
    else if (p.kind === "budget")
      result = await db
        .from("wealth_budget_caps")
        .upsert(
          { user_id: uid, month: p.month, category: p.category, cap: p.cap },
          { onConflict: "user_id,month,category" },
        )
        .select()
        .single();
    else if (p.kind === "reallocate")
      result = await db.rpc("wealth_reallocate", {
        p_from: p.from,
        p_to: p.to,
        p_amount: p.amount,
      });
    else if (p.kind === "bill") {
      const row = {
        user_id: uid,
        title: p.title,
        amount: p.amount,
        next_due: p.nextDue,
        frequency: p.frequency,
        category: p.category,
        active: p.active,
      };
      result = p.id
        ? await db
            .from("wealth_bills")
            .update(row)
            .eq("id", p.id)
            .eq("user_id", uid)
            .select()
            .single()
        : await db.from("wealth_bills").insert(row).select().single();
    } else if (p.kind === "settings")
      result = await db
        .from("wealth_settings")
        .upsert({
          user_id: uid,
          spend_save_bps: p.basisPoints,
          target_id: p.targetId,
          low_balance: p.lowBalance,
        })
        .select()
        .single();
    else if (p.kind === "circle")
      result = await db
        .from("wealth_circles")
        .insert({
          user_id: uid,
          title: p.title,
          contribution: p.contribution,
          starts_on: p.startsOn,
          interval_days: p.intervalDays,
          members: p.members,
        })
        .select()
        .single();
    else if (p.kind === "contribution")
      result = await db
        .from("wealth_circle_contributions")
        .insert({
          user_id: uid,
          circle_id: p.circleId,
          member_index: p.memberIndex,
          round: p.round,
          amount: p.amount,
          paid_on: p.paidOn,
        })
        .select()
        .single();
    else if (p.kind === "payBill")
      result = await db.rpc("wealth_pay_bill", {
        p_bill: p.billId,
        p_account: p.accountId,
      });
    else return invalid();
    if (result.error) throw result.error;
    return financeSaved(uid, result.data ?? { ok: true }, 201);
  } catch (e) {
    return financeError(e);
  }
}
