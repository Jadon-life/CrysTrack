'use client';
import { useState } from 'react';
import { GoalDialog } from '@/components/goals/goal-dialog';
import { useRhythm } from './rhythm-provider';
import { post } from '@/lib/api';
import { shiftAcademicDay } from '@/lib/assignments/time';
import { weekStart } from '@/lib/rhythm/logic';
import type { RitualRef } from '@/types/rhythm';
export function RitualFlow({
  kind,
  onClose,
}: {
  kind: 'morning' | 'evening' | 'weekly';
  onClose: () => void;
}) {
  const { data, refresh } = useRhythm();
  const old = kind === 'weekly' ? data?.weekRitual : data?.ritual;
  const [revision] = useState(old?.revision ?? 0);
  const [top, setTop] = useState<RitualRef[]>(old?.top_three || []),
    [deferred, setDeferred] = useState<RitualRef[]>(old?.deferred || []),
    [capacity, setCapacity] = useState(old?.capacity_minutes ?? 480),
    [wins, setWins] = useState(old?.wins || ''),
    [reflection, setReflection] = useState(
      (kind === 'weekly' ? old?.weekly_reflection : old?.reflection) || '',
    ),
    [focus, setFocus] = useState<string[]>(old?.next_focus || []),
    [date, setDate] = useState(
      data ? old?.deferred_to || shiftAcademicDay(data.day, 1) : '',
    );
  if (!data)
    return (
      <GoalDialog
        isOpen
        onClose={onClose}
        title="Your daily rhythm"
        onSubmit={async () => {
          throw new Error('Load your day before saving.');
        }}
      >
        <p>Your day is still loading. Close and try again shortly.</p>
      </GoalDialog>
    );
  const choices = [
    ...data.tasks
      .filter((t) => t.scheduled_today && t.today_status !== 'completed')
      .map((t) => ({ type: 'task' as const, id: t.id, title: t.title })),
    ...data.assignments.map((a) => ({
      type: 'assignment' as const,
      id: a.id,
      title: a.title,
    })),
    ...data.goals.map((g) => ({
      type: 'goal' as const,
      id: g.id,
      title: g.title,
    })),
  ];
  const same = (a: RitualRef, b: RitualRef) =>
    a.id === b.id && a.type === b.type;
  const save = async () => {
    await post('/api/rhythm/ritual', {
      kind,
      day: kind === 'weekly' ? weekStart(data.day) : data.day,
      topThree: kind === 'morning' ? top : [],
      deferred: kind === 'weekly' ? [] : deferred,
      deferredTo: kind === 'weekly' ? null : date,
      capacityMinutes: capacity,
      wins,
      reflection,
      nextFocus: focus,
      expectedRevision: revision,
    });
    await refresh();
  };
  return (
    <GoalDialog
      isOpen
      onClose={onClose}
      title={
        kind === 'morning'
          ? 'Morning Plan · one minute'
          : kind === 'evening'
            ? 'Evening Wrap-up · one minute'
            : 'Sunday Weekly Review'
      }
      onSubmit={save}
    >
      <p>
        {data.day} · {data.timezone}
      </p>
      {kind === 'weekly' ? (
        <>
          <p>
            {data.weekly.completed} completions and {data.weekly.focusedMinutes}{' '}
            focused minutes recorded this week.
          </p>
          <label className="goal-field">
            What will you carry forward?
            <textarea
              maxLength={500}
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
            />
          </label>
          <h3>Next week’s focus goals · choose up to three</h3>
          {data.goals.map((g) => (
            <label key={g.id} className="rhythm-check">
              <input
                type="checkbox"
                checked={focus.includes(g.id)}
                disabled={!focus.includes(g.id) && focus.length >= 3}
                onChange={(e) =>
                  setFocus(
                    e.target.checked
                      ? [...focus, g.id]
                      : focus.filter((id) => id !== g.id),
                  )
                }
              />
              {g.title}
            </label>
          ))}
        </>
      ) : (
        <>
          {kind === 'morning' ? (
            <>
              <p>
                Pick up to three things that would make today feel meaningful.
              </p>
              {choices.map((c) => (
                <label key={c.type + c.id} className="rhythm-check">
                  <input
                    type="checkbox"
                    checked={top.some((t) => same(t, c))}
                    disabled={!top.some((t) => same(t, c)) && top.length >= 3}
                    onChange={(e) => {
                      setTop(
                        e.target.checked
                          ? [...top, { type: c.type, id: c.id }]
                          : top.filter((t) => !same(t, c)),
                      );
                      setDeferred(deferred.filter((t) => !same(t, c)));
                    }}
                  />
                  {c.title}
                </label>
              ))}
              <label className="goal-field">
                Day capacity (minutes)
                <input
                  type="number"
                  min="0"
                  max="1440"
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                />
              </label>
              <p>
                {data.capacity.planned} minutes timeboxed / {capacity}{' '}
                available.
                {data.capacity.planned > capacity
                  ? ' A smaller plan may feel more spacious.'
                  : ''}
              </p>
            </>
          ) : (
            <>
              <p>
                {
                  data.tasks.filter(
                    (t) => t.scheduled_today && t.today_status === 'completed',
                  ).length
                }{' '}
                routines finished. {data.focusMinutes} minutes of focused work
                today.
              </p>
              <label className="goal-field">
                Wins worth keeping
                <textarea
                  maxLength={3000}
                  value={wins}
                  onChange={(e) => setWins(e.target.value)}
                />
              </label>
              <label className="goal-field">
                One-line reflection
                <input
                  maxLength={500}
                  value={reflection}
                  onChange={(e) => setReflection(e.target.value)}
                />
              </label>
            </>
          )}
          <h3>
            {kind === 'morning'
              ? 'Make room · defer non-essentials'
              : 'Carry pending items forward'}
          </h3>
          <p>
            Routine changes apply to this occurrence. Assignment deadlines move
            to the chosen local date.
          </p>
          {choices
            .filter(
              (c) =>
                c.type !== 'goal' &&
                (kind === 'evening' || !top.some((t) => same(t, c))),
            )
            .map((c) => (
              <label className="rhythm-check" key={'defer' + c.type + c.id}>
                <input
                  type="checkbox"
                  checked={deferred.some((t) => same(t, c))}
                  onChange={(e) =>
                    setDeferred(
                      e.target.checked
                        ? [...deferred, { type: c.type, id: c.id }]
                        : deferred.filter((t) => !same(t, c)),
                    )
                  }
                />
                {c.title}
              </label>
            ))}
          <label className="goal-field">
            Pick back up on
            <input
              type="date"
              min={shiftAcademicDay(data.day, 1)}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </>
      )}
    </GoalDialog>
  );
}
