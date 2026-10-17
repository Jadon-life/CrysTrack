import type {
  RewardKind,
  RewardEvent,
  StreakState,
  Badge,
} from "@/types/gamification";
import { shiftAcademicDay } from "@/lib/assignments/time";
export const XP: Record<RewardKind, number> = {
  task: 10,
  goal: 15,
  expense: 5,
  morning: 20,
  evening: 20,
  weekly: 30,
  assignment: 25,
};
export const DAILY_CAP: Record<RewardKind, number> = {
  task: 20,
  goal: 10,
  expense: 5,
  morning: 1,
  evening: 1,
  weekly: 1,
  assignment: 10,
};
export function levelProgress(xp: number) {
  if (!Number.isSafeInteger(xp) || xp < 0)
    throw new Error("XP must be a non-negative safe integer");
  const level = Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2);
  const start = 50 * (level - 1) * level,
    next = 50 * level * (level + 1);
  return {
    level,
    levelStart: start,
    nextLevel: next,
    progress: Math.floor(((xp - start) * 100) / (next - start)),
  };
}
export function calculateXP(events: RewardEvent[], today: string) {
  const seen = new Set<string>(),
    buckets = new Map<string, number>(),
    counts: Partial<Record<RewardKind, number>> = {};
  let xp = 0;
  for (const e of [...events].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) ||
      a.action_key.localeCompare(b.action_key),
  )) {
    if (
      !e.active ||
      e.day > today ||
      seen.has(e.action_key) ||
      !Object.hasOwn(XP, e.kind)
    )
      continue;
    seen.add(e.action_key);
    counts[e.kind] = (counts[e.kind] || 0) + 1;
    const key = e.day + ":" + e.kind,
      used = buckets.get(key) || 0;
    buckets.set(key, used + 1);
    if (used < DAILY_CAP[e.kind]) xp += XP[e.kind];
  }
  return { xp, counts, ...levelProgress(xp) };
}
/** Replay verified calendar days. One grace day per gap; additional absent days spend freezes.
 * Freeze earnings require seven actual consecutive active days; protection never earns a freeze.
 * Today is still open and is never treated as a missed day. */
export function protectedStreak(
  activeDays: string[],
  today: string,
): StreakState {
  const days = [
    ...new Set(
      activeDays.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today),
    ),
  ].sort();
  let streak = 0,
    longest = 0,
    run = 0,
    longestRun = 0,
    bank = 0,
    earned = 0,
    consumed = 0,
    graceDays = 0,
    last: string | null = null,
    gap = 0,
    protectedNow = false;
  for (const day of days) {
    if (last) {
      const missing =
        Math.round((Date.parse(day) - Date.parse(last)) / 86400000) - 1;
      if (missing > 0) {
        run = 0;
        graceDays++;
        const need = Math.max(0, missing - 1);
        const used = Math.min(bank, need);
        bank -= used;
        consumed += used;
        if (used < need) streak = 0;
      }
    }
    streak++;
    run++;
    longestRun = Math.max(longestRun, run);
    longest = Math.max(longest, streak);
    if (run % 7 === 0 && bank < 3) {
      bank++;
      earned++;
    }
    last = day;
  }
  if (last) {
    gap = Math.max(
      0,
      Math.round((Date.parse(today) - Date.parse(last)) / 86400000) - 1,
    );
    if (gap > 0) {
      run = 0;
      graceDays++;
      const need = Math.max(0, gap - 1),
        used = Math.min(bank, need);
      bank -= used;
      consumed += used;
      protectedNow = used > 0;
      if (used < need) streak = 0;
    }
  }
  const state: StreakState["state"] = !last
    ? "new"
    : last === today
      ? "active"
      : streak === 0
        ? "rest"
        : protectedNow
          ? "protected"
          : gap > 0
            ? "gentle"
            : "active";
  const message =
    state === "new"
      ? "Every small step counts. Start whenever you’re ready."
      : state === "gentle"
        ? "Ready to pick this back up? One quiet day won’t undo your progress."
        : state === "protected"
          ? "Your saved freezes made a little breathing room. Ready for a small step?"
          : state === "rest"
            ? "Ready for a fresh rhythm? Your earned XP and badges are still here."
            : last === today &&
                days.length > 1 &&
                Math.round(
                  (Date.parse(today) - Date.parse(days.at(-2)!)) / 86400000,
                ) === 2
              ? "Welcome back. Your rhythm has room for real life."
              : "Small steps, at your own pace.";
  return {
    streak,
    longest,
    activeRun: run,
    longestActiveRun: longestRun,
    freezes: bank,
    earned,
    consumed,
    graceDays,
    lastActive: last,
    state,
    message,
  };
}
type Definition = {
  id: string;
  name: string;
  description: string;
  group: Badge["group"];
  icon: Badge["icon"];
  metric: string;
  target: number;
};
export const BADGE_DEFINITIONS: Definition[] = [
  [
    "first-step",
    "A small beginning",
    "Complete your first routine.",
    "Life Areas",
    "spark",
    "task",
    1,
  ],
  [
    "five-steps",
    "Finding a rhythm",
    "Complete five routines.",
    "Life Areas",
    "spark",
    "task",
    5,
  ],
  [
    "ten-steps",
    "Ten small wins",
    "Complete ten routines.",
    "Life Areas",
    "trophy",
    "task",
    10,
  ],
  [
    "twenty-five",
    "Making room",
    "Complete 25 routines.",
    "Life Areas",
    "trophy",
    "task",
    25,
  ],
  [
    "hundred-steps",
    "A hundred moments",
    "Complete 100 routines.",
    "Life Areas",
    "trophy",
    "task",
    100,
  ],
  [
    "first-checkin",
    "A moment to reflect",
    "Check in on a goal.",
    "Life Areas",
    "heart",
    "goal",
    1,
  ],
  [
    "ten-checkins",
    "Keep your why close",
    "Check in on goals ten times.",
    "Life Areas",
    "heart",
    "goal",
    10,
  ],
  [
    "three-areas",
    "Room for balance",
    "Take verified steps in three life areas.",
    "Life Areas",
    "heart",
    "areas",
    3,
  ],
  [
    "five-areas",
    "A fuller picture",
    "Take verified steps in five life areas.",
    "Life Areas",
    "heart",
    "areas",
    5,
  ],
  [
    "seven-days",
    "One steady week",
    "Be active seven consecutive days.",
    "Life Areas",
    "shield",
    "activeRun",
    7,
  ],
  [
    "fourteen-days",
    "A growing rhythm",
    "Be active fourteen consecutive days.",
    "Life Areas",
    "shield",
    "activeRun",
    14,
  ],
  [
    "twenty-one-days",
    "Three gentle weeks",
    "Be active 21 consecutive days.",
    "Life Areas",
    "shield",
    "activeRun",
    21,
  ],
  [
    "first-plan",
    "A little direction",
    "Finish a Morning Plan.",
    "Life Areas",
    "spark",
    "morning",
    1,
  ],
  [
    "ten-plans",
    "Room for priorities",
    "Finish ten Morning Plans.",
    "Life Areas",
    "spark",
    "morning",
    10,
  ],
  [
    "five-reflections",
    "Notice the good",
    "Finish five Evening Wrap-ups.",
    "Life Areas",
    "heart",
    "evening",
    5,
  ],
  [
    "weekly-review",
    "The bigger picture",
    "Finish a Weekly Review.",
    "Life Areas",
    "book",
    "weekly",
    1,
  ],
  [
    "first-expense",
    "Money awareness",
    "Log an expense. No spending target required.",
    "Wealth Milestones",
    "coin",
    "expense",
    1,
  ],
  [
    "twenty-five-expenses",
    "A clearer ledger",
    "Record 25 expenses.",
    "Wealth Milestones",
    "coin",
    "expense",
    25,
  ],
  [
    "first-savings",
    "A little set aside",
    "Record a positive saved balance.",
    "Wealth Milestones",
    "shield",
    "savedKobo",
    1,
  ],
  [
    "savings-ten-thousand",
    "Room for tomorrow",
    "Set aside ₦10,000 in your ledger.",
    "Wealth Milestones",
    "coin",
    "savedKobo",
    1000000,
  ],
  [
    "funded-target",
    "A target within reach",
    "Fully fund a savings target.",
    "Wealth Milestones",
    "trophy",
    "fundedTargets",
    1,
  ],
  [
    "academic-first",
    "First page finished",
    "Finish an assignment. Late work counts too.",
    "Academic Consistency",
    "book",
    "assignment",
    1,
  ],
  [
    "academic-five",
    "Learning in motion",
    "Finish five assignments.",
    "Academic Consistency",
    "book",
    "assignment",
    5,
  ],
  [
    "academic-twenty",
    "Knowledge grows",
    "Finish twenty assignments.",
    "Academic Consistency",
    "trophy",
    "assignment",
    20,
  ],
  [
    "academic-ontime",
    "A little breathing room",
    "Finish five assignments by their deadlines.",
    "Academic Consistency",
    "shield",
    "onTime",
    5,
  ],
  [
    "academic-rhythm",
    "Return to learning",
    "Finish academic work on three days in the last week.",
    "Academic Consistency",
    "book",
    "academicDays",
    3,
  ],
].map(
  ([id, name, description, group, icon, metric, target]) =>
    ({ id, name, description, group, icon, metric, target }) as Definition,
);
export function achievementBadges(metrics: Record<string, number>): Badge[] {
  return BADGE_DEFINITIONS.map((d) => ({
    ...d,
    current: Math.max(0, Math.min(d.target, metrics[d.metric] || 0)),
    unlocked: (metrics[d.metric] || 0) >= d.target,
  }));
}
export function academicDays(events: RewardEvent[], today: string) {
  const start = shiftAcademicDay(today, -6);
  return new Set(
    events
      .filter(
        (e) =>
          e.active &&
          e.kind === "assignment" &&
          e.day >= start &&
          e.day <= today,
      )
      .map((e) => e.day),
  ).size;
}
