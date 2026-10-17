'use client';
import { GraduationCap, Pencil, Trash2 } from 'lucide-react';
import { GoalCard } from '@/components/goals/goal-card';
import { subtaskPercent } from '@/lib/assignments/workload';
import type { AcademicAssignment } from '@/types/assignments';
export function AssignmentCard({
  item,
  busy,
  onFinish,
  onEdit,
  onDelete,
  onStep,
  onRestore,
}: {
  item: AcademicAssignment;
  busy: boolean;
  onFinish: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStep: (id: string) => void;
  onRestore: () => void;
}) {
  const terminal = item.status === 'completed' || item.status === 'dropped',
    percent = subtaskPercent(item.subtasks);
  const deadline = new Intl.DateTimeFormat('en-NG', {
    timeZone: item.timezone,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(item.deadline));
  return (
    <GoalCard
      className={`goal-card academic-card ${item.status === 'completed' ? 'academic-finished' : ''}`}
    >
      <header className="academic-card-header">
        <span className="academic-course">
          <GraduationCap size={18} aria-hidden="true" />
          {item.course_code || 'Your coursework'}
        </span>
        <span className="academic-kind">{item.academic_kind}</span>
      </header>
      <div className="academic-title-row">
        <label className="academic-finish-control">
          <input
            type="checkbox"
            aria-label={`Finish ${item.title}`}
            checked={item.status === 'completed'}
            disabled={busy || terminal}
            onChange={onFinish}
          />
          <span aria-hidden="true" />
        </label>
        <h2>{item.title}</h2>
      </div>
      <div className="academic-badges">
        <span data-status={item.computed_status}>
          {item.completion_label ||
            (item.computed_status === 'overdue'
              ? 'Ready to pick back up'
              : item.computed_status.replaceAll('_', ' '))}
        </span>
        <span>{item.priority} priority</span>
        {item.category && <span>{item.category}</span>}
      </div>
      {item.description && (
        <p className="academic-description">{item.description}</p>
      )}
      <dl className="academic-metadata">
        <div>
          <dt>Deadline · {item.timezone}</dt>
          <dd>{deadline}</dd>
        </div>
        <div>
          <dt>Estimated effort</dt>
          <dd>
            {item.estimated_minutes == null
              ? 'Add an estimate'
              : `${Number((item.estimated_minutes / 60).toFixed(2))} hours`}
          </dd>
        </div>
        {item.point_weight != null && (
          <div>
            <dt>Point weighting</dt>
            <dd>{item.point_weight}%</dd>
          </div>
        )}
      </dl>
      {item.subtasks.length > 0 && (
        <section className="academic-steps">
          <div className="academic-progress-heading">
            <svg
              viewBox="0 0 100 100"
              role="img"
              aria-label={`${percent}% of steps complete`}
            >
              <circle cx="50" cy="50" r="42" />
              <circle
                cx="50"
                cy="50"
                r="42"
                pathLength="100"
                strokeDasharray={`${percent} 100`}
              />
              <text x="50" y="55" textAnchor="middle">
                {percent}%
              </text>
            </svg>
            <span>
              {item.subtasks.filter((s) => s.completed).length} of{' '}
              {item.subtasks.length} small steps
            </span>
          </div>
          <ul>
            {item.subtasks.map((step) => (
              <li key={step.id}>
                <label className="academic-check-label">
                  <input
                    type="checkbox"
                    checked={step.completed}
                    disabled={busy || terminal}
                    onChange={() => onStep(step.id)}
                  />
                  <span>{step.title}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
      <footer className="academic-card-actions">
        <button onClick={onEdit} disabled={busy}>
          <Pencil size={16} aria-hidden="true" />
          Edit
        </button>
        {terminal && (
          <button onClick={onRestore} disabled={busy}>
            Pick this back up
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={busy}
          aria-label={`Delete ${item.title} permanently`}
          title="Delete assignment permanently"
        >
          <Trash2 size={16} aria-hidden="true" />
          Delete
        </button>
      </footer>
    </GoalCard>
  );
}
