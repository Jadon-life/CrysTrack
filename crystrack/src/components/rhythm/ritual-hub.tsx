'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRhythm } from './rhythm-provider';
import { RitualFlow } from './ritual-flow';
import { GlassCard } from '@/components/shared/glass-card';
export function RitualHub() {
  const { data } = useRhythm();
  const [flow, setFlow] = useState<'morning' | 'evening' | 'weekly' | null>(
    null,
  );
  if (!data) return null;
  const max = Math.max(1, ...data.weekly.areas.map((a) => a.count));
  const count = Math.max(3, data.weekly.areas.length);
  const points = data.weekly.areas
    .map((a, i) => {
      const angle = (i * 2 * Math.PI) / count - Math.PI / 2,
        r = 15 + (a.count / max) * 60;
      return `${100 + Math.cos(angle) * r},${100 + Math.sin(angle) * r}`;
    })
    .join(' ');
  return (
    <section className="rhythm-hub">
      {!!data.priorities?.length && (
        <GlassCard className="rhythm-priorities" hover>
          <h2>Your Top 3</h2>
          <ol>
            {data.priorities.map((item) => (
              <li key={item.type + item.id}>
                <Link
                  href={
                    item.type === 'task'
                      ? '/tasks'
                      : item.type === 'assignment'
                        ? '/assignments'
                        : '/goals'
                  }
                >
                  {item.completed ? '✓ ' : ''}
                  {item.title}
                </Link>
              </li>
            ))}
          </ol>
        </GlassCard>
      )}

      {!data.priorities?.length && (
        <GlassCard className="rhythm-priorities" hover>
          <h2>Your Top 3</h2>
          <p>
            A little direction makes room for focus. Choose up to three
            priorities for today.
          </p>
          <button onClick={() => setFlow('morning')}>
            Choose your priorities →
          </button>
        </GlassCard>
      )}
      <div className="rhythm-ritual-actions">
        <button onClick={() => setFlow('morning')}>
          Morning Plan · 1 min {data.ritual?.morning_at ? '✓' : ''}
        </button>
        <button onClick={() => setFlow('evening')}>
          Evening Wrap-up · 1 min {data.ritual?.evening_at ? '✓' : ''}
        </button>
        <button onClick={() => setFlow('weekly')}>
          Sunday Weekly Review {data.weekRitual?.review_at ? '✓' : ''}
        </button>
      </div>
      <GlassCard hover padding="md">
        <h2>This week, in perspective</h2>
        <p>
          {data.weekly.completed} completions · {data.weekly.focusedMinutes}{' '}
          focused minutes
        </p>
        <div className="rhythm-balance">
          <svg
            viewBox="0 0 200 200"
            role="img"
            aria-label={
              data.weekly.areas.length
                ? data.weekly.areas
                    .map((a) => `${a.label}: ${a.count} completions`)
                    .join('; ')
                : 'No completion evidence yet'
            }
          >
            <circle cx="100" cy="100" r="75" />
            <circle cx="100" cy="100" r="45" />
            {data.weekly.areas.length >= 3 ? (
              <polygon points={points} />
            ) : (
              data.weekly.areas.map((a, i) => (
                <circle
                  key={a.label}
                  cx={75 + i * 50}
                  cy="100"
                  r={8 + (a.count / max) * 15}
                  className="rhythm-balance-point"
                />
              ))
            )}
          </svg>
          <ul>
            {data.weekly.areas.map((a) => (
              <li key={a.label}>
                {a.label} · {a.count}
              </li>
            ))}
            {!data.weekly.areas.length && (
              <li>Your life-area wheel grows from recorded completions.</li>
            )}
          </ul>
        </div>
        <p className="rhythm-secondary">
          A view of recorded activity, not a score for your life. Next week’s
          focus:{' '}
          {data.weekRitual?.next_focus
            .map((id) => data.goals.find((g) => g.id === id)?.title)
            .filter(Boolean)
            .join(', ') || 'Choose what matters in your weekly review.'}
        </p>
      </GlassCard>
      {flow && <RitualFlow kind={flow} onClose={() => setFlow(null)} />}
    </section>
  );
}
