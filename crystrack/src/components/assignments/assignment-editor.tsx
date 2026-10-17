'use client';
import { useState } from 'react';
import { GoalDialog } from '@/components/goals/goal-dialog';
import { localDateTimeValue } from '@/lib/assignments/time';
import { assignmentFields } from '@/lib/assignments/validation';
import { patch, post } from '@/lib/api';
import type {
  AcademicAssignment,
  AssignmentSubtask,
} from '@/types/assignments';
const reminderChoices = [10080, 4320, 2880, 1440, 360, 120, 60, 0];
export function AssignmentEditor({
  assignment,
  timezone,
  defaultChannels,
  onClose,
  onSaved,
}: {
  assignment: AcademicAssignment | null;
  timezone: string;
  defaultChannels: ('push' | 'telegram')[];
  onClose: () => void;
  onSaved: (value: AcademicAssignment) => void;
}) {
  const [draft, setDraft] = useState(() => ({
    title: assignment?.title || '',
    description: assignment?.description || '',
    deadline: assignment
      ? localDateTimeValue(assignment.deadline, timezone)
      : '',
    priority: assignment?.priority || 'medium',
    category: assignment?.category || '',
    courseCode: assignment?.course_code || '',
    academicKind: assignment?.academic_kind || 'Assignment',
    pointWeight: assignment?.point_weight ?? '',
    estimatedHours:
      assignment?.estimated_minutes == null
        ? ''
        : String(assignment.estimated_minutes / 60),
    workStartAt: assignment?.work_start_at
      ? localDateTimeValue(assignment.work_start_at, timezone)
      : '',
    subtasks: assignment?.subtasks || ([] as AssignmentSubtask[]),
    remindersEnabled: assignment?.reminder_config?.enabled ?? true,
    channels: assignment?.reminder_config?.channels || defaultChannels,
    offsets: assignment?.reminder_config?.offsetMinutes || [1440, 120, 0],
  }));
  const set = (name: string, value: unknown) =>
    setDraft((current) => ({ ...current, [name]: value }));
  const save = async () => {
    const minutes =
      draft.estimatedHours === ''
        ? null
        : Math.round(Number(draft.estimatedHours) * 60);
    const payload = {
      title: draft.title,
      description: draft.description || null,
      deadline:
        assignment &&
        draft.deadline === localDateTimeValue(assignment.deadline, timezone)
          ? assignment.deadline
          : draft.deadline,
      priority: draft.priority,
      category: draft.category || null,
      courseCode: draft.courseCode || null,
      academicKind: draft.academicKind,
      pointWeight: draft.pointWeight === '' ? null : Number(draft.pointWeight),
      estimatedMinutes: minutes,
      workStartAt: !draft.workStartAt
        ? null
        : assignment?.work_start_at &&
            draft.workStartAt ===
              localDateTimeValue(assignment.work_start_at, timezone)
          ? assignment.work_start_at
          : draft.workStartAt,
      subtasks: draft.subtasks,
      reminderConfig: {
        enabled: draft.remindersEnabled,
        channels: draft.channels,
        offsetMinutes: draft.offsets,
      },
    };
    const parsed = assignmentFields.safeParse(payload);
    if (!parsed.success)
      throw new Error(
        'Check your title, deadline, hours, weighting, and step titles.',
      );
    const saved = assignment
      ? await patch(`/api/assignments/${assignment.id}`, {
          ...parsed.data,
          expectedRevision: assignment.revision,
        })
      : await post('/api/assignments', parsed.data);
    onSaved(saved);
  };
  return (
    <GoalDialog
      isOpen
      onClose={onClose}
      title={assignment ? 'Edit assignment' : 'New assignment'}
      onSubmit={save}
    >
      <p className="academic-help">
        Dates and times use your saved timezone: {timezone}.
      </p>
      <label className="goal-field">
        Title
        <input
          required
          maxLength={255}
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="e.g. Explore motion and forces"
        />
      </label>
      <label className="goal-field">
        Description
        <textarea
          value={draft.description}
          maxLength={10000}
          onChange={(e) => set('description', e.target.value)}
        />
      </label>
      <div className="academic-form-grid">
        <label className="goal-field">
          Course code
          <input
            value={draft.courseCode}
            maxLength={30}
            onChange={(e) => set('courseCode', e.target.value)}
            placeholder="PHY 101"
          />
        </label>
        <label className="goal-field">
          Item type
          <select
            aria-label="Item type"
            value={draft.academicKind}
            onChange={(e) => set('academicKind', e.target.value)}
          >
            {['Assignment', 'Test', 'Lab', 'Project'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="academic-form-grid">
        <label className="goal-field">
          Deadline
          <input
            type="datetime-local"
            required
            value={draft.deadline}
            onChange={(e) => set('deadline', e.target.value)}
          />
        </label>
        <label className="goal-field">
          Priority
          <select
            aria-label="Priority"
            value={draft.priority}
            onChange={(e) => set('priority', e.target.value)}
          >
            {['low', 'medium', 'high', 'urgent'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="academic-form-grid">
        <label className="goal-field">
          Point weighting (%)
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={draft.pointWeight}
            onChange={(e) => set('pointWeight', e.target.value)}
            placeholder="Optional"
          />
        </label>
        <label className="goal-field">
          Estimated duration (hours)
          <input
            type="number"
            min="0"
            max="1000"
            step="any"
            value={draft.estimatedHours}
            onChange={(e) => set('estimatedHours', e.target.value)}
            placeholder="e.g. 2.5"
          />
        </label>
      </div>
      <label className="goal-field">
        Category / topic
        <input
          maxLength={100}
          value={draft.category}
          onChange={(e) => set('category', e.target.value)}
          placeholder="e.g. Mechanics"
        />
      </label>
      <label className="goal-field">
        Timebox start (optional)
        <input
          type="datetime-local"
          value={draft.workStartAt}
          onChange={(e) => set('workStartAt', e.target.value)}
        />
        <span className="academic-help">
          Your estimated duration defines the work block. Leave blank to plan it
          later.
        </span>
      </label>
      <section className="goal-editor-section">
        <h3>Small steps</h3>
        {draft.subtasks.map((step, index) => (
          <div key={step.id} className="academic-step-editor">
            <label className="goal-field">
              Step {index + 1}
              <input
                required
                maxLength={255}
                value={step.title}
                onChange={(e) =>
                  set(
                    'subtasks',
                    draft.subtasks.map((s) =>
                      s.id === step.id ? { ...s, title: e.target.value } : s,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              aria-label={`Remove step ${index + 1}`}
              onClick={() =>
                set(
                  'subtasks',
                  draft.subtasks.filter((s) => s.id !== step.id),
                )
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={draft.subtasks.length >= 50}
          onClick={() =>
            set('subtasks', [
              ...draft.subtasks,
              { id: crypto.randomUUID(), title: '', completed: false },
            ])
          }
        >
          Add step
        </button>
      </section>
      <section className="goal-editor-section">
        <h3>Reminders</h3>
        <label className="academic-check-label">
          <input
            type="checkbox"
            checked={draft.remindersEnabled}
            onChange={(e) => set('remindersEnabled', e.target.checked)}
          />{' '}
          Send gentle reminders
        </label>
        {draft.remindersEnabled && (
          <>
            <div className="academic-form-grid">
              {(['push', 'telegram'] as const).map((channel) => (
                <label key={channel} className="academic-check-label">
                  <input
                    type="checkbox"
                    checked={draft.channels.includes(channel)}
                    onChange={(e) =>
                      set(
                        'channels',
                        e.target.checked
                          ? [...draft.channels, channel]
                          : draft.channels.filter((c) => c !== channel),
                      )
                    }
                  />
                  {channel === 'push' ? 'Web Push' : 'Telegram'}
                </label>
              ))}
            </div>
            <div className="academic-reminder-options">
              {[...new Set([...reminderChoices, ...draft.offsets])]
                .sort((a, b) => b - a)
                .map((offset) => (
                  <label key={offset} className="academic-check-label">
                    <input
                      type="checkbox"
                      checked={draft.offsets.includes(offset)}
                      onChange={(e) =>
                        set(
                          'offsets',
                          e.target.checked
                            ? [...draft.offsets, offset]
                            : draft.offsets.filter((v) => v !== offset),
                        )
                      }
                    />
                    {offset === 0
                      ? 'At deadline'
                      : `${offset / 60} hours before`}
                  </label>
                ))}
            </div>
          </>
        )}
      </section>
    </GoalDialog>
  );
}
