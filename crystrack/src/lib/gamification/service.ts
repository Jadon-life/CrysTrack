import { createClient } from "@/lib/supabase/server";
import {
  calculateXP,
  protectedStreak,
  achievementBadges,
  academicDays,
} from "./logic";
import { signedKobo, toKobo } from "@/lib/money";
import { dateKeyForInstant } from "@/lib/reminders";
import type { GamificationSnapshot, RewardEvent } from "@/types/gamification";
type DB = Awaited<ReturnType<typeof createClient>>;
async function ownedRows(db: DB, uid: string, table: string, columns: string) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .eq("user_id", uid)
      .order("id", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}
export function unavailableGamification(today: string): GamificationSnapshot {
  return {
    ready: false,
    hidden: true,
    xp: 0,
    level: 1,
    levelStart: 0,
    nextLevel: 100,
    progress: 0,
    streak: protectedStreak([], today),
    badges: [],
    counts: {},
    today,
  };
}
export async function loadGamification(
  db: DB,
  uid: string,
  timezone: string,
  context?: { targets: any[]; assignments: any[]; entries: any[] },
): Promise<GamificationSnapshot> {
  const today = dateKeyForInstant(new Date(), timezone);
  try {
    const [events, prefs, targets, assignments, entries] = await Promise.all([
      ownedRows(db, uid, "gamification_events", "*"),
      db
        .from("user_preferences")
        .select("hide_gamification")
        .eq("user_id", uid)
        .maybeSingle(),
      context
        ? Promise.resolve(context.targets)
        : ownedRows(
            db,
            uid,
            "finance_targets",
            "id,target_amount,current_amount",
          ),
      context
        ? Promise.resolve(context.assignments)
        : ownedRows(db, uid, "assignments", "id,status,finished_late"),
      context
        ? Promise.resolve(context.entries)
        : ownedRows(
            db,
            uid,
            "money_entries",
            "id,type,flow_kind,amount,deleted_at",
          ),
    ]);
    if (prefs.error) throw prefs.error;
    return gamificationSnapshot(
      events as RewardEvent[],
      today,
      prefs.data?.hide_gamification ?? false,
      targets,
      assignments,
      entries,
    );
  } catch (error) {
    console.error("Progress extras unavailable:", error);
    return unavailableGamification(today);
  }
}
export function gamificationSnapshot(
  events: RewardEvent[],
  today: string,
  hidden: boolean,
  targets: any[] = [],
  assignments: any[] = [],
  entries: any[] = [],
): GamificationSnapshot {
  const result = calculateXP(events, today),
    active = events.filter((e) => e.active && e.day <= today),
    streak = protectedStreak(
      active.map((e) => e.day),
      today,
    );
  const saved = entries
    .filter((e) => !e.deleted_at)
    .reduce((sum: bigint, e: any) => {
      const kind = e.flow_kind || e.type;
      return kind === "saving"
        ? sum + toKobo(e.amount)
        : kind === "savings_release"
          ? sum - toKobo(e.amount)
          : sum;
    }, BigInt(0));
  const metrics = {
    ...result.counts,
    areas: new Set(
      active
        .filter((e) => ["task", "goal"].includes(e.kind))
        .map((e) => e.area?.trim().toLowerCase())
        .filter(Boolean),
    ).size,
    activeRun: streak.longestActiveRun,
    savedKobo: Number(
      saved > BigInt(1000000)
        ? BigInt(1000000)
        : saved > BigInt(0)
          ? saved
          : BigInt(0),
    ),
    fundedTargets: targets.filter(
      (t) =>
        toKobo(t.target_amount) > BigInt(0) &&
        signedKobo(t.current_amount || "0") >= toKobo(t.target_amount),
    ).length,
    assignment: assignments.filter((a) => a.status === "completed").length,
    onTime: assignments.filter(
      (a) => a.status === "completed" && !a.finished_late,
    ).length,
    academicDays: academicDays(active, today),
  };
  return {
    ready: true,
    hidden,
    ...result,
    streak,
    badges: achievementBadges(metrics),
    today,
  };
}
