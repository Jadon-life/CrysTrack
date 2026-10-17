'use client';
import Link from 'next/link';
import { GlassCard } from '@/components/shared/glass-card';
import { useRhythm } from '@/components/rhythm/rhythm-provider';
import { RitualHub } from '@/components/rhythm/ritual-hub';
export default function PlanPage() {
  const { data, error, loading, refresh } = useRhythm();
  return (
    <div className="rhythm-page">
      <header>
        <p className="rhythm-eyebrow">Plan · A little direction</p>
        <h1>Make room for what matters</h1>
        <p>
          Plan a gentle start, protect your focus, and close the day with
          perspective.
        </p>
      </header>
      {error && (
        <p role="alert">
          {error}
          <button onClick={() => void refresh()}>Try again</button>
        </p>
      )}
      {loading && <p role="status">Gathering your plan…</p>}
      <RitualHub />
      {data && (
        <div className="rhythm-modules">
          {[
            {
              href: '/tasks',
              title: 'Tasks',
              count: data.tasks.filter((t) => t.scheduled_today).length,
              note: 'on your local-day plan',
            },
            {
              href: '/goals',
              title: 'Goals',
              count: data.goals.length,
              note: 'directions to grow into',
            },
            {
              href: '/assignments',
              title: 'Assignments',
              count: data.assignments.length,
              note: 'academic next steps',
            },
            {
              href: '/calendar',
              title: 'Timeboxed Calendar',
              count: data.capacity.planned,
              note: 'focus minutes planned today',
            },
          ].map((m) => (
            <Link key={m.href} href={m.href}>
              <GlassCard hover>
                <h2>{m.title}</h2>
                <strong>{m.count}</strong>
                <p>{m.note}</p>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
