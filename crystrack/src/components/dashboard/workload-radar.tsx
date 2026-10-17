'use client';
import Link from 'next/link';
import {GlassCard} from '@/components/shared/glass-card';
import { useCallback, useEffect, useState } from 'react';
import { fetcher } from '@/lib/api';
import { workloadSummary } from '@/lib/assignments/workload';
import type { AcademicWorkload } from '@/types/assignments';
export function WorkloadRadar({snapshot}:{snapshot?:import('@/types/rhythm').TodayData} = {}) {
  const [remote, setData] = useState<
      (AcademicWorkload & { timezone: string; asOf: string }) | null
    >(null),
    [error, setError] = useState(false);
  const data = snapshot ? {...snapshot.workload,timezone:snapshot.timezone,asOf:snapshot.asOf} : remote;
  const load = useCallback(async () => {
    try {
      setData(await fetcher('/api/assignments/workload'));
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    if(snapshot)return;
    queueMicrotask(() => void load());
    const refresh = () => {
      if (!document.hidden) void load();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('crystrack-activity-updated', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('crystrack-activity-updated', refresh);
      document.removeEventListener('visibilitychange', refresh);
      clearInterval(timer);
    };
  }, [load,snapshot]);
  return (
    <GlassCard className="workload-radar" aria-label="Academic workload radar">
      <header>
        <div>
          <p className="academic-eyebrow">Make space for learning</p>
          <h2>Workload Radar</h2>
        </div>
        <Link href="/assignments">Plan coursework →</Link>
      </header>
      {error && (
        <p role="status">
          {data
            ? 'This estimate may be out of date.'
            : 'Your workload could not load.'}{' '}
          <button onClick={() => void load()}>Try again</button>
        </p>
      )}
      {!data && !error && <p role="status">Gathering your next seven days…</p>}
      {data && (
        <>
          <p className="workload-summary">{workloadSummary(data)}.</p>
          <p className="academic-help">
            {data.timezone} · {data.weeklyLimitMinutes / 60}h weekly /{' '}
            {data.dailyLimitMinutes / 60}h daily planning guide
          </p>
          <div
            className="workload-chart"
            role="img"
            aria-label={data.days
              .map(
                (d) =>
                  `${d.day}: ${Number((d.minutes / 60).toFixed(2))} hours, ${d.count} items`,
              )
              .join('; ')}
          >
            {data.days.map((day) => (
              <div key={day.day}>
                <span>{Number((day.minutes / 60).toFixed(2))}h</span>
                <div className="workload-bar-track">
                  <div
                    style={{
                      height: `${Math.min(100, (day.minutes / Math.max(data.dailyLimitMinutes, ...data.days.map((d) => d.minutes))) * 100)}%`,
                    }}
                    data-heavy={day.minutes > data.dailyLimitMinutes}
                  />
                </div>
                <small>
                  {new Intl.DateTimeFormat('en-NG', {
                    weekday: 'short',
                    timeZone: 'UTC',
                  }).format(new Date(`${day.day}T12:00:00Z`))}
                </small>
              </div>
            ))}
          </div>
          <div aria-live="polite">
            {data.warning && (
              <p className="workload-warning">
                Your week is filling up. Breaking a task into smaller blocks or
                moving one deadline may help.
              </p>
            )}
            {data.unestimated > 0 && (
              <p className="academic-help">
                {data.unestimated} item
                {data.unestimated === 1 ? ' still needs' : 's still need'} an
                estimate; those hours are not included.
              </p>
            )}
            {data.overdueCount > 0 && (
              <Link className="workload-overdue" href="/assignments">
                {data.overdueCount} earlier item
                {data.overdueCount === 1 ? ' is' : 's are'} ready to pick back
                up →
              </Link>
            )}
          </div>
        </>
      )}
    </GlassCard>
  );
}
