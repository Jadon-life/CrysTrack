'use client';
import { useEffect, useRef, useState } from 'react';
import { post } from '@/lib/api';
import { useRhythm } from '@/components/rhythm/rhythm-provider';
import type { FocusSession } from '@/types/rhythm';
export function FocusTimer({
  compact = false,
  autoComplete = true,
}: {
  compact?: boolean;
  autoComplete?: boolean;
}) {
  const { data, refresh } = useRhythm();
  const [task, setTask] = useState(''),
    [minutes, setMinutes] = useState(25),
    [session, setSession] = useState<FocusSession | null>(null),
    [remaining, setRemaining] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const attempted = useRef(''),
    lock = useRef(false),
    actionRef = useRef<(action: string) => Promise<void>>(async () => {});
  const serverSession = data?.focus;
  useEffect(() => {
    if (serverSession) queueMicrotask(() => setSession(serverSession));
    else if (data)
      queueMicrotask(() =>
        setSession((current) =>
          current && ['running', 'paused'].includes(current.status)
            ? null
            : current,
        ),
      );
  }, [serverSession, data]);
  const action = async (kind: string) => {
    if (lock.current || !data) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await post(
        '/api/rhythm/focus',
        kind === 'start'
          ? { action: 'start', id: crypto.randomUUID(), taskId: task, minutes }
          : { action: kind, id: session?.id },
      );
      setSession(result);
      if (kind === 'complete' && result.status === 'completed') {
        setNotice(
          `${result.planned_minutes} focused minutes saved to your task.`,
        );
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your focus is safe to retry.');
      await refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    actionRef.current = action;
  });
  useEffect(() => {
    if (!session || !['running', 'paused'].includes(session.status)) {
      queueMicrotask(() => setRemaining(0));
      return;
    }
    const elapsed =
      session.elapsed_seconds +
      (session.status === 'running' && session.resumed_at
        ? Math.max(
            0,
            (Date.parse(session.as_of || data?.asOf || session.resumed_at) -
              Date.parse(session.resumed_at)) /
              1000,
          )
        : 0);
    const initial = Math.max(0, session.planned_minutes * 60 - elapsed),
      anchor = performance.now();
    let finishTimeout: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const left = Math.max(
        0,
        Math.ceil(
          initial -
            (session.status === 'running'
              ? (performance.now() - anchor) / 1000
              : 0),
        ),
      );
      setRemaining(left);
      if (
        autoComplete &&
        !left &&
        session.status === 'running' &&
        attempted.current !== session.id &&
        !finishTimeout
      ) {
        finishTimeout = setTimeout(() => {
          attempted.current = session.id;
          void actionRef.current('complete');
        }, 1000);
      }
    };
    queueMicrotask(tick);
    const interval = setInterval(tick, 250);
    return () => {
      clearInterval(interval);
      if (finishTimeout) clearTimeout(finishTimeout);
    };
  }, [session, data?.asOf, autoComplete]);
  const active = session && ['running', 'paused'].includes(session.status);
  const taskTitle =
    data?.tasks.find((t) => t.id === session?.task_id)?.title || 'Your task';
  return (
    <div
      className={compact ? 'rhythm-focus rhythm-focus-compact' : 'rhythm-focus'}
    >
      {!compact && (
        <div className="rhythm-focus-clock">
          <svg viewBox="0 0 128 128" aria-hidden="true">
            <circle cx="64" cy="64" r="55" />
            <circle
              cx="64"
              cy="64"
              r="55"
              pathLength="100"
              strokeDasharray={`${active ? Math.max(0, Math.min(100, (remaining / (session.planned_minutes * 60)) * 100)) : 100} 100`}
              transform="rotate(-90 64 64)"
            />
          </svg>
          <output aria-label="Focus time remaining">
            {String(
              Math.floor((active ? remaining : minutes * 60) / 60),
            ).padStart(2, '0')}
            :{String((active ? remaining : minutes * 60) % 60).padStart(2, '0')}
          </output>
          <span>Focus minutes</span>
        </div>
      )}
      {active ? (
        <>
          <strong>{taskTitle}</strong>
          {compact && (
            <output aria-label="Focus time remaining">
              {String(Math.floor(remaining / 60)).padStart(2, '0')}:
              {String(remaining % 60).padStart(2, '0')}
            </output>
          )}
          <button
            disabled={busy}
            onClick={() =>
              void action(session.status === 'running' ? 'pause' : 'resume')
            }
          >
            {session.status === 'running' ? 'Pause' : 'Resume'}
          </button>
          <button disabled={busy} onClick={() => void action('cancel')}>
            End
          </button>
          {remaining === 0 && (
            <button disabled={busy} onClick={() => void action('complete')}>
              Save focus
            </button>
          )}
        </>
      ) : (
        <>
          <label>
            Focus task
            <select
              aria-label="Focus task"
              value={task}
              disabled={busy}
              onChange={(e) => setTask(e.target.value)}
            >
              <option value="">Choose a task</option>
              {data?.tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Duration · minutes
            <input
              aria-label="Focus minutes"
              type="number"
              min="1"
              max="180"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </label>
          <button
            disabled={
              busy ||
              !task ||
              !Number.isInteger(minutes) ||
              minutes < 1 ||
              minutes > 180
            }
            onClick={() => void action('start')}
          >
            Start focus
          </button>
        </>
      )}
      {error && <span role="alert">{error}</span>}
      {notice && (
        <button
          aria-label="Dismiss focus notification"
          onClick={() => setNotice('')}
        >
          {notice} ×
        </button>
      )}
    </div>
  );
}
