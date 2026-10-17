'use client';
import {
  BookOpen,
  Heart,
  Mountain,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react';
import type { GoalPlan } from '@/types/goals';
import { formatMoney, moneyPercent } from '@/lib/money';
export function GoalBadge({
  badge,
  achieved,
}: {
  badge: string;
  achieved: boolean;
}) {
  const Icon = achieved
    ? Trophy
    : {
        book: BookOpen,
        heart: Heart,
        mountain: Mountain,
        sparkles: Sparkles,
        target: Target,
      }[badge] || Target;
  return <Icon className="goal-badge" aria-hidden="true" />;
}
export function GoalDetails({
  goal,
  onMilestone,
  busy,
}: {
  goal: GoalPlan;
  onMilestone: (id: string) => void;
  busy: boolean;
}) {
  const percent = goal.effort_percent;
  return (
    <div className="goal-details">
      {percent != null && (
        <div className="goal-ring-row">
          <svg
            viewBox="0 0 100 100"
            role="img"
            aria-label={`${percent}% effort progress`}
            className="goal-ring"
          >
            <circle cx="50" cy="50" r="42" className="goal-ring-track" />
            <circle
              cx="50"
              cy="50"
              r="42"
              pathLength="100"
              strokeDasharray={`${percent} 100`}
              className="goal-ring-value"
            />
            <text x="50" y="54" textAnchor="middle">
              {percent}%
            </text>
          </svg>
          <p>
            {goal.progress_source === 'tasks'
              ? `${goal.completed_tasks} of ${goal.routine_target} routine completions`
              : goal.progress_source === 'milestones'
                ? 'One meaningful step at a time'
                : 'Your measured progress'}
          </p>
        </div>
      )}
      {goal.milestones?.length > 0 && (
        <ul className="goal-milestones">
          {goal.milestones.map((m) => (
            <li key={m.id}>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(m.completedAt)}
                  disabled={busy || goal.status !== 'active'}
                  onChange={() => onMilestone(m.id)}
                />
                <span>
                  {m.title}
                  <small>
                    {m.dueDate
                      ? `Planned for ${m.dueDate}`
                      : 'At your own pace'}
                  </small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {goal.finance_target && (
        <div className="goal-finance">
          <p>{goal.finance_target.title} · Wealth</p>
          <strong>
            {formatMoney(goal.finance_target.current_amount)}{' '}
            <span>of {formatMoney(goal.finance_target.target_amount)}</span>
          </strong>
          <progress
            aria-label="Financial progress"
            max="100"
            value={moneyPercent(
              goal.finance_target.current_amount,
              goal.finance_target.target_amount,
            )}
          />
          <small>Financial progress is separate from effort.</small>
        </div>
      )}
      <p className="goal-pacing">{goal.pacing}</p>
    </div>
  );
}
