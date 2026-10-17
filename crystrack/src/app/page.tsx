'use client';
import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  CalendarDays,
  Flame,
  Plus,
  Target,
  Timer,
  ArrowRight,
  Wallet,
  Sun,
  PenLine,
} from 'lucide-react';
import { useRhythm } from '@/components/rhythm/rhythm-provider';
import { useGamification } from '@/components/gamification/provider';
import { RitualFlow } from '@/components/rhythm/ritual-flow';
import { GlassCard } from '@/components/shared/glass-card';
import { WorkloadRadar } from '@/components/dashboard/workload-radar';
import { FocusTimer } from '@/components/dashboard/focus-timer';
import { useAuth } from '@/components/layout/auth-provider';
import { useTheme } from '@/components/layout/theme-provider';
import { WorkspaceOverlay } from '@/components/workspace/overlay';
import { post } from '@/lib/api';
import { localClock } from '@/lib/reminders';
import { formatMoney } from '@/lib/money';
function greetingForLocalTime(localTime: string) {
  const hour = Number(localTime.slice(11, 13));
  if (!Number.isFinite(hour)) return 'Hello';
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}
function GoalProgress({ percent }: { percent: number }) {
  return (
    <div
      className="today-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label="Goal progress"
    >
      <span style={{ width: percent + '%' }} />
    </div>
  );
}
export default function DashboardPage() {
  const { user } = useAuth(),
    { environment } = useTheme(),
    { data, loading, error, refresh } = useRhythm(),
    { hidden: quiet } = useGamification();
  const [planFilter, setPlanFilter] = useState<'today' | 'completed'>('today');
  const [capture, setCapture] = useState(false),
    [ritual, setRitual] = useState<'morning' | 'evening' | 'weekly' | null>(
      null,
    ),
    [saving, setSaving] = useState<string | null>(null),
    [actionError, setActionError] = useState('');
  const locks = useRef(new Set<string>());
  const tasks = useMemo(
    () =>
      [...(data?.tasks || [])]
        .filter((t) => t.scheduled_today)
        .sort((a, b) =>
          (a.preferred_time || '99:99').localeCompare(
            b.preferred_time || '99:99',
          ),
        ),
    [data?.tasks],
  );
  const completedTasks = tasks.filter(
      (t) => t.today_status === 'completed',
    ).length,
    goals = data?.goals || [],
    history = data?.history || [];
  const checkins = goals.filter(
      (g) =>
        g.checkin_state?.due ||
        g.checkin_state?.available ||
        g.checkin_state?.completed,
    ),
    completedCheckins = checkins.filter(
      (g) => g.checkin_state?.completed,
    ).length;
  const wealthSummary = data?.wealth?.summary || {},
    streak =
      !quiet && data?.gamification?.ready
        ? data.gamification.streak.streak
        : null;
  const name = String(
    user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.email?.split('@')[0] ||
      'there',
  ).split(' ')[0];
  const zone = data?.timezone || environment.timezone,
    day = data?.day || environment.localTime.slice(0, 10);
  const dateLabel = day
    ? new Intl.DateTimeFormat('en', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(day + 'T12:00:00Z'))
    : '';
  const metrics = [
    {
      label: 'Tasks completed',
      value: `${completedTasks}/${tasks.length}`,
      note: tasks.length
        ? 'One small win at a time'
        : 'A little room in your day',
      icon: CheckCircle2,
      tone: 'emerald',
      percent: tasks.length ? (completedTasks * 100) / tasks.length : 0,
    },
    {
      label: 'Goal check-ins',
      value: `${completedCheckins}/${checkins.length}`,
      note:
        checkins.length - completedCheckins
          ? `${checkins.length - completedCheckins} ready for a little attention`
          : 'Your next chapter is yours',
      icon: Target,
      tone: 'blue',
      percent: checkins.length
        ? (completedCheckins * 100) / checkins.length
        : 0,
    },
    {
      label: 'Upcoming assignments',
      value: String(data?.workload.count || 0),
      note: 'Across your next seven days',
      icon: CalendarDays,
      tone: 'gold',
      percent: null,
    },
    {
      label: streak === null ? 'Focused minutes' : 'Current streak',
      value: streak === null ? String(data?.focusMinutes || 0) : String(streak),
      note:
        streak === null
          ? 'Recorded today'
          : streak === 1
            ? 'One active day'
            : `${streak} active days · keep it gentle`,
      icon: streak === null ? Timer : Flame,
      tone: 'cyan',
      percent: null,
    },
  ];
  const money = (key: string) =>
    formatMoney(wealthSummary.exact?.[key] ?? wealthSummary[key] ?? '0');
  const eventTime = (value: string) =>
    new Intl.DateTimeFormat('en', {
      timeZone: zone,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  const toggle = async (id: string) => {
    if (!data || locks.current.has(id)) return;
    locks.current.add(id);
    setSaving(id);
    setActionError('');
    try {
      await post(`/api/tasks/${id}/occurrences/${data.day}/toggle`, {});
      await refresh();
      window.dispatchEvent(new Event('crystrack-activity-updated'));
    } catch (e) {
      setActionError(
        e instanceof Error
          ? e.message
          : 'This task could not update. Please try again.',
      );
    } finally {
      locks.current.delete(id);
      setSaving(null);
    }
  };
  if (loading)
    return (
      <div
        className="today-skeleton"
        role="status"
        aria-label="Loading your day"
      >
        <div />
        <section>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} />
          ))}
        </section>
        <div />
      </div>
    );
  if (error && !data)
    return (
      <GlassCard>
        <h1>Ready to pick your day back up?</h1>
        <p role="alert">{error}</p>
        <button className="glass-button" onClick={() => void refresh()}>
          Try again
        </button>
      </GlassCard>
    );
  return (
    <div className="today-workspace">
      <header className="today-heading">
        <div>
          <p className="today-eyebrow">
            {greetingForLocalTime(
              data
                ? data.day +
                    'T' +
                    String(localClock(new Date(), data.timezone).hour).padStart(
                      2,
                      '0',
                    ) +
                    ':00'
                : environment.localTime,
            )}
            , {name}
          </p>
          <h1>Your day, in focus.</h1>
          <p>A little direction. Meaningful progress. Space to be you.</p>
        </div>
        <div className="today-heading-actions">
          <span className="today-date">
            <CalendarDays size={15} />
            {dateLabel}
          </span>
          <button
            className="glass-button-primary"
            onClick={() => setCapture(true)}
          >
            <Plus size={17} /> Quick capture
          </button>
        </div>
      </header>
      <section className="today-metrics" aria-label="Your daily overview">
        {metrics.map(({ label, value, note, icon: Icon, tone, percent }) => (
          <GlassCard
            key={label}
            className={'today-metric today-tone-' + tone}
            hover
          >
            <div className="today-metric-top">
              <span className="today-metric-icon">
                <Icon size={18} />
              </span>
              <span className="today-metric-label">{label}</span>
            </div>
            <div className="today-metric-bottom">
              <strong>{value}</strong>
              {percent !== null && (
                <svg
                  viewBox="0 0 40 40"
                  width="40"
                  height="40"
                  aria-hidden="true"
                >
                  <circle cx="20" cy="20" r="16" />
                  <circle
                    cx="20"
                    cy="20"
                    r="16"
                    pathLength="100"
                    strokeDasharray={`${percent} 100`}
                    transform="rotate(-90 20 20)"
                  />
                </svg>
              )}
            </div>
            <p>{note}</p>
          </GlassCard>
        ))}
      </section>
      {(error || actionError) && (
        <p className="workspace-form-error" role="alert">
          {actionError || error}{' '}
          <button onClick={() => void refresh()}>Try again</button>
        </p>
      )}
      <div className="today-bento">
        <div className="today-main-column">
          <GlassCard className="today-plan" hover>
            <div className="today-section-heading">
              <div>
                <p className="today-eyebrow">A little intention</p>
                <h2>Today’s Plan</h2>
              </div>
              <button
                className="today-subtle-action"
                onClick={() => setRitual('morning')}
              >
                <Sun size={15} /> Plan your day
              </button>
            </div>
            <div className="today-plan-summary">
              <span>
                {completedTasks} of {tasks.length} completed
              </span>
              <Link href="/tasks">
                View tasks <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className="today-plan-tabs" aria-label="Plan view">
              <button
                aria-pressed={planFilter === 'today'}
                onClick={() => setPlanFilter('today')}
              >
                Today
              </button>
              <Link href="/calendar">Upcoming</Link>
              <button
                aria-pressed={planFilter === 'completed'}
                onClick={() => setPlanFilter('completed')}
              >
                Completed
              </button>
            </div>
            <div className="today-task-list">
              {(planFilter === 'completed'
                ? tasks.filter((t) => t.today_status === 'completed')
                : tasks
              ).length ? (
                (planFilter === 'completed'
                  ? tasks.filter((t) => t.today_status === 'completed')
                  : tasks
                )
                  .slice(0, 6)
                  .map((task) => (
                    <div className="today-task" key={task.id}>
                      <button
                        aria-label={
                          (task.today_status === 'completed'
                            ? 'Mark incomplete: '
                            : 'Complete: ') + task.title
                        }
                        aria-pressed={task.today_status === 'completed'}
                        disabled={
                          saving === task.id ||
                          ['skipped', 'missed'].includes(task.today_status)
                        }
                        onClick={() => void toggle(task.id)}
                        className={
                          'today-task-check' +
                          (task.today_status === 'completed'
                            ? ' is-complete'
                            : '')
                        }
                      >
                        {task.today_status === 'completed' && (
                          <Check size={16} />
                        )}
                      </button>
                      <div>
                        <p
                          className={
                            task.today_status === 'completed'
                              ? 'today-task-completed'
                              : ''
                          }
                        >
                          {task.title}
                        </p>
                        <span>
                          {task.category || 'Personal'}
                          {['skipped', 'missed'].includes(task.today_status)
                            ? ' · ' + task.today_status
                            : ''}
                        </span>
                      </div>
                      <time>{task.preferred_time || 'Any time'}</time>
                    </div>
                  ))
              ) : (
                <div className="today-empty">
                  <CheckCircle2 size={24} />
                  <p>
                    {planFilter === 'completed'
                      ? 'Your completed steps will appear here.'
                      : 'A little space to begin.'}
                  </p>
                  <Link href="/tasks?create=task">
                    Choose your first routine <ArrowRight size={14} />
                  </Link>
                </div>
              )}
            </div>
            {tasks.length > 6 && (
              <Link className="today-footer-link" href="/tasks">
                See all {tasks.length} scheduled tasks <ArrowRight size={14} />
              </Link>
            )}
          </GlassCard>
          <div className="today-paired">
            <GlassCard hover className="today-goals">
              <div className="today-section-heading">
                <h2>Goals in Motion</h2>
                <Link href="/goals" aria-label="View all goals">
                  <ArrowUpRight size={18} />
                </Link>
              </div>
              {goals.length ? (
                goals.slice(0, 3).map((goal) => {
                  const percent = Math.max(
                    0,
                    Math.min(100, Number(goal.effort_percent || 0)),
                  );
                  return (
                    <Link
                      href={'/goals#goal-' + goal.id}
                      key={goal.id}
                      className="today-goal"
                    >
                      <div>
                        <span className="today-goal-icon">
                          <Target size={17} />
                        </span>
                        <strong>{goal.title}</strong>
                        <span>{percent}%</span>
                      </div>
                      <GoalProgress percent={percent} />
                      <p>
                        {goal.checkin_state?.due
                          ? 'Ready for a check-in'
                          : goal.pacing || 'One step closer, at your pace.'}
                      </p>
                    </Link>
                  );
                })
              ) : (
                <p className="today-empty-copy">
                  A meaningful direction starts with one small goal.{' '}
                  <Link href="/goals?create=goal">Create a goal →</Link>
                </p>
              )}
            </GlassCard>
            <GlassCard hover className="today-wealth">
              <div className="today-section-heading">
                <h2>Wealth Snapshot</h2>
                <Link href="/finance" aria-label="Open Wealth">
                  <Wallet size={18} />
                </Link>
              </div>
              <p className="today-eyebrow">Available balance · NGN</p>
              <strong className="today-balance">
                {formatMoney(
                  wealthSummary.exact?.availableBalance ??
                    wealthSummary.availableBalance ??
                    '0',
                )}
              </strong>
              <div className="today-wealth-detail">
                <div>
                  <span>Safe to spend</span>
                  <strong>{money('safeToSpend')}</strong>
                </div>
                <div>
                  <span>Protected & saved</span>
                  <strong>{money('savedBalance')}</strong>
                </div>
              </div>
              <Link href="/finance" className="today-footer-link">
                Your money, with clarity <ArrowUpRight size={15} />
              </Link>
            </GlassCard>
          </div>
          <GlassCard hover className="today-reflection">
            <div className="today-section-heading">
              <div>
                <span className="today-eyebrow">A moment for you</span>
                <h2>Quick Reflection</h2>
              </div>
              <PenLine size={19} />
            </div>
            <p>
              {data?.ritual?.reflection ||
                'What felt meaningful today—even in a small way?'}
            </p>
            <button
              className="glass-button"
              onClick={() => setRitual('evening')}
            >
              {data?.ritual?.reflection
                ? 'Revisit your reflection'
                : 'Reflect on today'}
              <ArrowRight size={15} />
            </button>
            <div className="today-ritual-links">
              <button onClick={() => setRitual('weekly')}>
                Weekly perspective
              </button>
              <Link href="/plan">Your planning rituals →</Link>
            </div>
          </GlassCard>
        </div>
        <aside className="today-side-column">
          <GlassCard className="today-focus" hover>
            <div className="today-section-heading">
              <h2 id="focus-session">Focus Session</h2>
              <Timer size={19} />
            </div>
            <p className="today-focus-description">
              One task. A little protected time.
            </p>
            <FocusTimer autoComplete={false} />
            <p className="today-focus-footnote">
              Focused time is saved to the task you choose.
            </p>
          </GlassCard>
          <WorkloadRadar snapshot={data || undefined} />
          <GlassCard className="today-activity" hover>
            <div className="today-section-heading">
              <h2>Recent Activity</h2>
              <Link href="/history" aria-label="Open activity history">
                <ArrowUpRight size={18} />
              </Link>
            </div>
            {history.length ? (
              <ol>
                {history.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <span className="today-activity-dot" />
                    <div>
                      <p>
                        {item.metadata_json?.title ||
                          item.type?.replaceAll('_', ' ') ||
                          'Recorded activity'}
                      </p>
                      <time>{eventTime(item.created_at)}</time>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="today-empty-copy">
                Your small steps will appear here as you go.
              </p>
            )}
          </GlassCard>
        </aside>
      </div>
      <WorkspaceOverlay
        open={capture}
        onClose={() => setCapture(false)}
        title="Capture something that matters"
      >
        <p className="workspace-utility-muted">
          Choose a space. The details are yours.
        </p>
        <div className="today-capture-grid">
          {[
            {
              href: '/tasks?create=task',
              title: 'A task',
              note: 'A small step to repeat',
              icon: CheckCircle2,
            },
            {
              href: '/goals?create=goal',
              title: 'A goal',
              note: 'A direction to grow into',
              icon: Target,
            },
            {
              href: '/assignments?create=assignment',
              title: 'An assignment',
              note: 'Make room for learning',
              icon: CalendarDays,
            },
            {
              href: '/finance?create=entry',
              title: 'A money entry',
              note: 'Keep the real picture clear',
              icon: Wallet,
            },
          ].map(({ href, title, note, icon: Icon }) => (
            <Link href={href} key={href} onClick={() => setCapture(false)}>
              <Icon size={21} />
              <strong>{title}</strong>
              <span>{note}</span>
            </Link>
          ))}
        </div>
      </WorkspaceOverlay>
      {ritual && (
        <RitualFlow
          key={ritual}
          kind={ritual}
          onClose={() => setRitual(null)}
        />
      )}
    </div>
  );
}
