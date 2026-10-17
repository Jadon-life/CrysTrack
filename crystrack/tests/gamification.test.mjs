import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const {
  calculateXP,
  levelProgress,
  protectedStreak,
  achievementBadges,
  BADGE_DEFINITIONS,
} = loadTs("src/lib/gamification/logic.ts");
const { gamificationSnapshot, unavailableGamification } = loadTs(
  "src/lib/gamification/service.ts",
  { "@/lib/supabase/server": {} },
);
const event = (kind, key, day = "2026-10-17", extra = {}) => ({
  id: key,
  user_id: "owner",
  action_key: key,
  kind,
  source_id: key,
  day,
  area: "Health",
  active: true,
  on_time: true,
  created_at: day + "T12:00:00Z",
  ...extra,
});
const days = (n, start = "2026-10-01") =>
  Array.from({ length: n }, (_, i) =>
    new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10),
  );
test("verified event formulas award fixed integer XP without weighting expense values", () => {
  const r = calculateXP(
    [
      "task",
      "goal",
      "expense",
      "morning",
      "evening",
      "weekly",
      "assignment",
    ].map((k, i) => event(k, String(i))),
    "2026-10-17",
  );
  assert.equal(r.xp, 125);
  assert.equal(r.level, 2);
  assert.equal(r.progress, 12);
});
test("duplicate keys, undone and future actions never multiply XP", () => {
  const e = event("task", "task:1");
  assert.equal(
    calculateXP(
      [
        e,
        e,
        { ...e, id: "different" },
        event("expense", "deleted", undefined, { active: false }),
        event("goal", "future", "2026-10-18"),
      ],
      "2026-10-17",
    ).xp,
    10,
  );
});
test("per-kind daily caps limit farming, reset by saved calendar day, and keep badge action counts", () => {
  const rows = Array.from({ length: 30 }, (_, i) => event("task", "t" + i));
  const r = calculateXP(rows, "2026-10-17");
  assert.equal(r.xp, 200);
  assert.equal(r.counts.task, 30);
  assert.equal(
    calculateXP([...rows, event("task", "next", "2026-10-18")], "2026-10-18")
      .xp,
    210,
  );
  const expenses = Array.from({ length: 20 }, (_, i) =>
    event("expense", "e" + i),
  );
  assert.equal(calculateXP(expenses, "2026-10-17").xp, 25);
});
test("XP levels follow increasing thresholds with exact boundary transitions", () => {
  for (const [xp, level, start, next] of [
    [0, 1, 0, 100],
    [99, 1, 0, 100],
    [100, 2, 100, 300],
    [299, 2, 100, 300],
    [300, 3, 300, 600],
    [600, 4, 600, 1000],
    [1000, 5, 1000, 1500],
  ]) {
    const r = levelProgress(xp);
    assert.equal(r.level, level);
    assert.equal(r.levelStart, start);
    assert.equal(r.nextLevel, next);
    assert.ok(r.progress >= 0 && r.progress < 100);
  }
  for (const bad of [-1, 1.1, NaN, Infinity])
    assert.throws(() => levelProgress(bad));
});
test("a new account has no invented streak, freezes or XP", () => {
  const r = protectedStreak([], "2026-10-17");
  assert.equal(r.streak, 0);
  assert.equal(r.freezes, 0);
  assert.equal(r.state, "new");
  assert.equal(calculateXP([], "2026-10-17").xp, 0);
});
test("never miss twice grants one gap day and preserves progress on next-day return", () => {
  const quiet = protectedStreak(["2026-10-01"], "2026-10-03");
  assert.equal(quiet.streak, 1);
  assert.equal(quiet.state, "gentle");
  assert.match(quiet.message, /Ready to pick this back up/);
  const back = protectedStreak(["2026-10-01", "2026-10-03"], "2026-10-03");
  assert.equal(back.streak, 2);
  assert.equal(back.freezes, 0);
  assert.match(back.message, /Welcome back/);
});
test("two missed days without a freeze restart the rhythm while retaining longest record", () => {
  const r = protectedStreak(
    ["2026-10-01", "2026-10-02", "2026-10-05"],
    "2026-10-05",
  );
  assert.equal(r.streak, 1);
  assert.equal(r.longest, 2);
  assert.equal(protectedStreak(["2026-10-01"], "2026-10-04").state, "rest");
});
test("every seven actual consecutive active days earns one freeze, bank capped at three", () => {
  for (const [n, bank] of [
    [6, 0],
    [7, 1],
    [14, 2],
    [21, 3],
    [28, 3],
  ]) {
    const d = days(n);
    assert.equal(protectedStreak(d, d.at(-1)).freezes, bank);
  }
  assert.equal(
    protectedStreak([...days(7), "2026-10-09"], "2026-10-09").activeRun,
    1,
  );
});
test("one grace day plus one freeze protects two absent days and consumes exactly one", () => {
  const r = protectedStreak([...days(7), "2026-10-10"], "2026-10-10");
  assert.equal(r.streak, 8);
  assert.equal(r.freezes, 0);
  assert.equal(r.consumed, 1);
  assert.equal(r.earned, 1);
  assert.equal(r.activeRun, 1);
});
test("multiple freezes cover additional quiet days once, today is never counted missing", () => {
  const d = days(21);
  const r = protectedStreak(d, "2026-10-26");
  assert.equal(r.streak, 21);
  assert.equal(r.consumed, 3);
  assert.equal(r.freezes, 0);
  assert.equal(r.state, "protected");
  const resume = protectedStreak([...d, "2026-10-26"], "2026-10-26");
  assert.equal(resume.streak, 22);
  assert.equal(resume.consumed, 3);
  assert.equal(resume.activeRun, 1);
});
test("exhausted protection resets only the current rhythm, preserves historical achievements", () => {
  const r = protectedStreak([...days(7), "2026-10-11"], "2026-10-11");
  assert.equal(r.streak, 1);
  assert.equal(r.longest, 7);
  assert.equal(r.longestActiveRun, 7);
  assert.equal(r.consumed, 1);
});
test("grace and freezes never count toward earning new freezes", () => {
  const alternating = Array.from({ length: 15 }, (_, i) =>
    new Date(Date.parse("2026-10-01") + i * 2 * 86400000)
      .toISOString()
      .slice(0, 10),
  );
  const r = protectedStreak(alternating, alternating.at(-1));
  assert.equal(r.streak, 15);
  assert.equal(r.freezes, 0);
  assert.equal(r.earned, 0);
  assert.equal(r.longestActiveRun, 1);
});
test("streak replay is deterministic, deduplicates days and uses date keys across DST and year rollover", () => {
  const input = ["2026-12-31", "2027-01-02", "2026-12-31"];
  assert.equal(protectedStreak(input, "2027-01-02").streak, 2);
  assert.deepEqual(
    protectedStreak(input, "2027-01-02"),
    protectedStreak([...input].reverse(), "2027-01-02"),
  );
  assert.equal(
    protectedStreak(["2026-10-31", "2026-11-01", "2026-11-02"], "2026-11-02")
      .activeRun,
    3,
  );
});
test("26 badge definitions have distinct IDs and inclusive unlock thresholds across three groups", () => {
  assert.ok(BADGE_DEFINITIONS.length >= 20);
  assert.equal(
    new Set(BADGE_DEFINITIONS.map((b) => b.id)).size,
    BADGE_DEFINITIONS.length,
  );
  assert.equal(new Set(BADGE_DEFINITIONS.map((b) => b.group)).size, 3);
  for (const d of BADGE_DEFINITIONS) {
    assert.equal(
      achievementBadges({ [d.metric]: d.target }).find((b) => b.id === d.id)
        .unlocked,
      true,
    );
    assert.equal(
      achievementBadges({ [d.metric]: d.target - 1 }).find((b) => b.id === d.id)
        .unlocked,
      false,
    );
  }
});
test("money badges use exact kobo and late assignments still unlock academic badges", () => {
  const result = gamificationSnapshot(
    [event("expense", "e")],
    "2026-10-17",
    false,
    [{ target_amount: "0.30", current_amount: "0.30" }],
    [{ status: "completed", finished_late: true }],
    [
      { type: "saving", amount: "0.10" },
      { type: "saving", amount: "0.20" },
    ],
  );
  assert.equal(
    result.badges.find((b) => b.id === "funded-target").unlocked,
    true,
  );
  assert.equal(
    result.badges.find((b) => b.id === "first-savings").unlocked,
    true,
  );
  assert.equal(
    result.badges.find((b) => b.id === "academic-first").unlocked,
    true,
  );
  assert.equal(
    result.badges.find((b) => b.id === "academic-ontime").unlocked,
    false,
  );
});
test("quiet mode and pre-migration fallback are explicit and never invent achievements", () => {
  assert.equal(gamificationSnapshot([], "2026-10-17", true).hidden, true);
  const r = unavailableGamification("2026-10-17");
  assert.equal(r.hidden, true);
  assert.equal(r.ready, false);
  assert.deepEqual(r.badges, []);
});
