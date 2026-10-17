"use client";
import React, { useState } from "react";
import {
  Sparkles,
  Heart,
  BookOpen,
  Coins,
  Trophy,
  Shield,
  LockKeyhole,
} from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";
import { useGamification } from "./provider";
import { gamificationThemeTokens } from "@/lib/theme";
const icons = {
  spark: Sparkles,
  heart: Heart,
  book: BookOpen,
  coin: Coins,
  trophy: Trophy,
  shield: Shield,
};
export function AvatarXP({ children }: { children: React.ReactNode }) {
  const { data, hidden } = useGamification();
  if (hidden || !data?.ready) return <>{children}</>;
  return (
    <span className="gamification-avatar" data-level={data.level}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="21" className="xp-ring-track" />
        <circle
          cx="24"
          cy="24"
          r="21"
          pathLength="100"
          strokeDasharray={`${data.progress} 100`}
          className="xp-ring-gold"
        />
      </svg>
      {children}
      <span className="xp-level">{data.level}</span>
    </span>
  );
}
export function StreakEncouragement() {
  const { data, hidden } = useGamification();
  if (hidden || !data?.ready) return null;
  return (
    <GlassCard
      className="gamification-streak"
      style={gamificationThemeTokens as React.CSSProperties}
    >
      <div>
        <p>{data.streak.message}</p>
        <p className="gamification-secondary">
          {data.streak.streak} active days in this rhythm ·{" "}
          {data.streak.freezes} / 3 freezes banked
        </p>
      </div>
      <a href="/insights#achievement-cabinet">Your small wins</a>
    </GlassCard>
  );
}
export function QuietGamificationSetting() {
  const { data, preference, setHidden, saving, error } = useGamification();
  return (
    <div className="gamification-setting">
      <label>
        <input
          type="checkbox"
          checked={preference}
          disabled={saving || !data?.ready}
          onChange={(e) => void setHidden(e.target.checked)}
        />
        <span>Hide Gamification Elements</span>
      </label>
      <p>
        Keep a quiet workspace without XP rings, levels, streak panels or badge
        notifications. Your recorded activity stays available.
      </p>
      {!data?.ready && <p>Progress extras aren’t available just yet.</p>}
      {saving && <p role="status">Saving your preference…</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function AchievementCabinet() {
  const { data, hidden } = useGamification(),
    [filter, setFilter] = useState("All");
  if (hidden || !data?.ready) return null;
  const groups = [
    "All",
    "Life Areas",
    "Wealth Milestones",
    "Academic Consistency",
  ];
  return (
    <section
      id="achievement-cabinet"
      className="gamification-cabinet"
      style={gamificationThemeTokens as React.CSSProperties}
      aria-label="Trophy and badges cabinet"
    >
      <GlassCard>
        <div className="gamification-heading">
          <Trophy aria-hidden="true" />
          <h2>Your small wins</h2>
          <span>
            Level {data.level} · {data.xp} XP
          </span>
        </div>
        <p>{data.streak.message}</p>
        <p>
          {data.badges.filter((b) => b.unlocked).length} / {data.badges.length}{" "}
          badges · {data.streak.freezes} / 3 freezes banked
        </p>
        <progress
          aria-label="XP toward next level"
          max={data.nextLevel - data.levelStart}
          value={data.xp - data.levelStart}
        />
        <p className="gamification-secondary">
          {data.xp - data.levelStart} / {data.nextLevel - data.levelStart} XP
          toward level {data.level + 1}. One missed day gets grace; extra quiet
          days use a freeze. Every 7 consecutive active days earns a freeze, up
          to 3 banked.
        </p>
        <details>
          <summary>How your progress works</summary>
          <p>
            Verified routine completions earn 10 XP, goal check-ins 15 XP,
            expense logs 5 XP, Morning Plans and Evening Wrap-ups 20 XP each,
            Weekly Reviews 30 XP, and assignments 25 XP. Expense amounts never
            affect XP. Daily limits keep this gentle; repeating or undoing an
            action cannot multiply its reward.
          </p>
          <p className="gamification-secondary">
            Daily XP limits: 20 routines, 10 goal check-ins, 5 expenses, 10
            assignments, and one of each ritual. Undoing an action removes its
            XP; restoring it keeps its original earning day. XP starts when
            rewards are enabled for your account. Freeze protection preserves
            your rhythm, while only actual active days earn new freezes.
          </p>
        </details>
      </GlassCard>
      <div
        className="gamification-filters"
        role="group"
        aria-label="Filter badges"
      >
        {groups.map((g) => (
          <button
            key={g}
            aria-pressed={filter === g}
            onClick={() => setFilter(g)}
          >
            {g}
          </button>
        ))}
      </div>
      <div className="gamification-grid">
        {data.badges
          .filter((b) => filter === "All" || b.group === filter)
          .map((b) => {
            const Icon = icons[b.icon];
            return (
              <GlassCard
                as="article"
                hover
                key={b.id}
                className={`gamification-badge ${b.unlocked ? "is-unlocked" : "is-locked"}`}
              >
                <div className="gamification-badge-icon">
                  <Icon aria-hidden="true" />
                  {!b.unlocked && (
                    <LockKeyhole aria-hidden="true" className="badge-lock" />
                  )}
                </div>
                <p className="gamification-secondary">
                  {b.group} · {b.unlocked ? "Unlocked" : "Still growing"}
                </p>
                <h3>{b.name}</h3>
                <p>{b.description}</p>
                <progress
                  max={b.target}
                  value={b.current}
                  aria-label={`${b.name} progress`}
                />
                <p className="gamification-secondary">
                  {b.unlocked
                    ? "A small win, earned."
                    : `${Math.floor((b.current * 100) / b.target)}% of the way there`}
                </p>
              </GlassCard>
            );
          })}
      </div>
    </section>
  );
}
