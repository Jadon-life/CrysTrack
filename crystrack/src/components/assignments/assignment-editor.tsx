'use client';
import React, { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Loader2 } from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';
import { Button } from '@/components/ui/button';
import { patch, post } from '@/lib/api';
import { AssignmentRow, localInput, resolveLocalDeadline } from '@/lib/assignments';

const fieldClass =
  '[color-scheme:dark] min-h-10 w-full rounded-lg border border-white/20 bg-slate-950/40 px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300';
export function AssignmentEditor({
  assignment,
  timezone,
  onClose,
  onSaved,
  defaultChannels = ['push'],
}: {
  assignment: AssignmentRow | null;
  timezone: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  defaultChannels?: string[];
}) {
  const [title, setTitle] = useState(assignment?.title || '');
  const [description, setDescription] = useState(assignment?.description || '');
  const [deadline, setDeadline] = useState(assignment ? localInput(assignment.deadline, timezone) : '');
  const [priority, setPriority] = useState(assignment?.priority || 'medium');
  const [category, setCategory] = useState(assignment?.category || '');
  const [enabled, setEnabled] = useState(assignment?.reminder_config?.enabled !== false);
  const [channels, setChannels] = useState<string[]>(
    assignment?.reminder_config?.channels || defaultChannels,
  );
  const [offsets, setOffsets] = useState<number[]>(
    assignment?.reminder_config?.offsetMinutes || [1440, 120, 0],
  );
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const intent = useRef<string | null>(null);
  const returnFocus = useRef<HTMLElement | null>(
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement),
  );
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (!title.trim()) throw new Error('Give this assignment a title.');
      if (!channels.length) throw new Error('Choose at least one reminder channel.');
      const unchanged = assignment && deadline === localInput(assignment.deadline, timezone);
      if (!unchanged) resolveLocalDeadline(deadline, timezone);
      const body = {
        title,
        description,
        priority,
        category,
        ...(unchanged ? { deadline: assignment.deadline } : { localDeadline: deadline, timezone }),
        reminderConfig: { enabled, channels, offsetMinutes: offsets },
      };
      if (assignment)
        await patch(`/api/assignments/${assignment.id}`, { ...body, revision: assignment.revision });
      else {
        intent.current ||= crypto.randomUUID();
        await post('/api/assignments', { ...body, id: intent.current });
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not confirm the save. Refresh before retrying.');
    } finally {
      setBusy(false);
    }
  };
  const choices = [...new Set([2880, 1440, 360, 120, 60, 0, ...offsets])].sort((a, b) => b - a);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
          aria-describedby="assignment-editor-description"
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (busy) event.preventDefault();
          }}
          className="fixed left-1/2 top-1/2 z-[71] max-h-[90dvh] w-[calc(100vw_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl focus:outline-none"
        >
          <GlassCard padding="lg">
            <div className="flex items-center justify-between gap-3">
              <Dialog.Title className="text-lg font-semibold text-white">
                {assignment ? 'Edit assignment' : 'Create assignment'}
              </Dialog.Title>
              <Dialog.Close
                disabled={busy}
                aria-label="Close assignment editor"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-cyan-300"
              >
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>
            <Dialog.Description id="assignment-editor-description" className="mt-2 text-sm text-slate-200">
              Deadline times use your saved scheduling timezone: <strong>{timezone}</strong>. Existing
              finished work keeps its recorded deadline.
            </Dialog.Description>
            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-amber-300/30 bg-black/30 p-3 text-sm text-amber-100"
              >
                {error}
              </p>
            )}
            <form onSubmit={submit} className="mt-5 space-y-4">
              <fieldset disabled={busy} className="space-y-4">
                <div>
                  <label htmlFor="assignment-title" className="mb-1 block text-sm text-slate-200">
                    Title *
                  </label>
                  <input
                    id="assignment-title"
                    required
                    maxLength={255}
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label htmlFor="assignment-description" className="mb-1 block text-sm text-slate-200">
                    Description
                  </label>
                  <textarea
                    id="assignment-description"
                    maxLength={10000}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label htmlFor="assignment-deadline" className="mb-1 block text-sm text-slate-200">
                    Deadline ({timezone}) *
                  </label>
                  <input
                    id="assignment-deadline"
                    required
                    type="datetime-local"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="assignment-priority" className="mb-1 block text-sm text-slate-200">
                      Priority
                    </label>
                    <select
                      id="assignment-priority"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as typeof priority)}
                      className={fieldClass}
                    >
                      {['low', 'medium', 'high', 'urgent'].map((p) => (
                        <option key={p} value={p} className="bg-slate-950">
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="assignment-category" className="mb-1 block text-sm text-slate-200">
                      Subject / category
                    </label>
                    <input
                      id="assignment-category"
                      maxLength={100}
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                </div>
                <div className="space-y-3 rounded-xl border border-white/15 bg-black/20 p-3">
                  <label className="flex min-h-10 items-center gap-3 text-sm text-white">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setEnabled(e.target.checked)}
                      className="h-5 w-5 accent-cyan-400"
                    />{' '}
                    Assignment reminders
                  </label>
                  <p className="text-xs text-slate-200">
                    Delivery needs configured Push or connected Telegram. Your selection is saved even if a
                    channel is unavailable.
                  </p>
                  <fieldset className="flex flex-wrap gap-4">
                    <legend className="mb-1 text-sm text-slate-200">Channels</legend>
                    {['push', 'telegram'].map((c) => (
                      <label key={c} className="flex min-h-10 items-center gap-2 text-sm text-white">
                        <input
                          type="checkbox"
                          checked={channels.includes(c)}
                          onChange={() =>
                            setChannels((old) => (old.includes(c) ? old.filter((x) => x !== c) : [...old, c]))
                          }
                        />
                        {c === 'push' ? 'Web Push' : 'Telegram'}
                      </label>
                    ))}
                  </fieldset>
                  <fieldset className="grid grid-cols-2 gap-2">
                    <legend className="mb-2 text-sm text-slate-200">Remind me before the deadline</legend>
                    {choices.map((offset) => (
                      <label
                        key={offset}
                        className="flex min-h-10 items-center gap-2 rounded-lg border border-white/10 p-2 text-xs text-white"
                      >
                        <input
                          type="checkbox"
                          checked={offsets.includes(offset)}
                          onChange={() =>
                            setOffsets((old) =>
                              old.includes(offset)
                                ? old.filter((x) => x !== offset)
                                : [...old, offset].sort((a, b) => b - a),
                            )
                          }
                        />
                        {offset === 0 ? 'At deadline' : `${offset} minutes before`}
                      </label>
                    ))}
                  </fieldset>
                  <label htmlFor="assignment-custom-offset" className="block text-xs text-slate-200">
                    Custom offset in minutes (0–43200, up to 12 selected)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="assignment-custom-offset"
                      type="number"
                      min={0}
                      max={43200}
                      step={1}
                      value={custom}
                      onChange={(e) => setCustom(e.target.value)}
                      className={fieldClass}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!/^\d+$/.test(custom) || Number(custom) > 43200 || offsets.length >= 12}
                      onClick={() => {
                        setOffsets((old) => [...new Set([...old, Number(custom)])].sort((a, b) => b - a));
                        setCustom('');
                      }}
                    >
                      Add
                    </Button>
                  </div>
                  {priority === 'urgent' && (
                    <p className="text-xs text-amber-100">
                      Urgent reminders may bypass Do Not Disturb, as before.
                    </p>
                  )}
                </div>
              </fieldset>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
                </Button>
              </div>
            </form>
          </GlassCard>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
