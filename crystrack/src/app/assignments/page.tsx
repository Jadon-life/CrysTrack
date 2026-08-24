'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Bell, Clock, Loader2, Plus, Trash2 } from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';
import { DomainInsightCard } from '@/components/ai/domain-insight-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CreateModal } from '@/components/shared/create-modal';
import { del, fetcher, patch, post } from '@/lib/api';
import { cn, formatDateTime, getRelativeTime } from '@/lib/utils';

const priorityColors = {
  low: 'border-l-slate-500',
  medium: 'border-l-amber-500',
  high: 'border-l-orange-500',
  urgent: 'border-l-red-500',
};
const statusOrder = ['overdue', 'due_today', 'due_soon', 'upcoming'];

function proposedOffsets(priority: string) {
  return priority === 'urgent' ? [2880, 1440, 360, 60, 0] : [1440, 120, 0];
}

function offsetLabel(minutes: number) {
  if (minutes === 0) return 'At deadline';
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? '' : 's'} before`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'} before`;
  return `${minutes} minutes before`;
}

export default function AssignmentsPage() {
  const searchParams = useSearchParams();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newAssignment, setNewAssignment] = useState({
    title: '', description: '', deadline: '', priority: 'medium', category: '',
    remindersEnabled: true, reminderChannel: 'push', reminderOffsets: [1440, 120, 0] as number[],
  });

  const loadAssignments = async () => {
    setLoading(true);
    setError('');
    try { setAssignments(await fetcher('/api/assignments')); }
    catch (e: any) { setError(e.message || 'Failed to load assignments'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetcher('/api/preferences').then((prefs: any) => {
      const channels = prefs?.default_reminder_channels || ['push'];
      const reminderChannel = channels.includes('push') && channels.includes('telegram') ? 'both' : channels.includes('telegram') ? 'telegram' : 'push';
      setNewAssignment((current: any) => ({ ...current, reminderChannel }));
    }).catch(() => null);
  }, []);

  useEffect(() => { void loadAssignments(); }, []);
  useEffect(() => { if (searchParams.get('create') === 'assignment') setShowCreate(true); }, [searchParams]);

  const setPriority = (priority: string) => setNewAssignment((current) => ({
    ...current,
    priority,
    reminderOffsets: proposedOffsets(priority),
  }));

  const toggleOffset = (offset: number) => setNewAssignment((current) => ({
    ...current,
    reminderOffsets: current.reminderOffsets.includes(offset)
      ? current.reminderOffsets.filter((value) => value !== offset)
      : [...current.reminderOffsets, offset].sort((a, b) => b - a),
  }));

  const handleCreate = async () => {
    if (!newAssignment.title.trim()) throw new Error('Title is required');
    if (!newAssignment.deadline) throw new Error('Deadline is required');
    const deadline = new Date(newAssignment.deadline);
    if (Number.isNaN(deadline.getTime())) throw new Error('Deadline is invalid');

    await post('/api/assignments', {
      title: newAssignment.title,
      description: newAssignment.description,
      deadline: deadline.toISOString(),
      priority: newAssignment.priority,
      category: newAssignment.category,
      reminderConfig: {
        enabled: newAssignment.remindersEnabled,
        channels: newAssignment.reminderChannel === 'both' ? ['push', 'telegram'] : [newAssignment.reminderChannel],
        offsetMinutes: newAssignment.reminderOffsets,
      },
    });
    await loadAssignments();
    window.dispatchEvent(new Event('crystrack-activity-updated'));
    setNewAssignment((current) => ({ title: '', description: '', deadline: '', priority: 'medium', category: '', remindersEnabled: true, reminderChannel: current.reminderChannel, reminderOffsets: [1440, 120, 0] }));
  };

  const handleComplete = async (id: string) => {
    try { await patch(`/api/assignments/${id}/complete`, {}); await loadAssignments(); window.dispatchEvent(new Event('crystrack-activity-updated')); }
    catch (e: any) { setError(e.message || 'Failed to complete assignment'); }
  };

  const handleDeleteAssignment = async (assignment: any) => {
    if (!window.confirm(`Delete "${assignment.title}" permanently?`)) return;
    setError('');
    try {
      await del(`/api/assignments/${assignment.id}`);
      await loadAssignments();
      window.dispatchEvent(new Event('crystrack-activity-updated'));
    } catch (e: any) {
      setError(e.message || 'Failed to delete assignment');
    }
  };

  const sortedAssignments = useMemo(() => [...assignments].sort((a, b) => statusOrder.indexOf(a.computed_status) - statusOrder.indexOf(b.computed_status)), [assignments]);
  const statusCounts = {
    overdue: assignments.filter((item: any) => item.computed_status === 'overdue').length,
    due_today: assignments.filter((item: any) => item.computed_status === 'due_today').length,
    due_soon: assignments.filter((item: any) => item.computed_status === 'due_soon').length,
    upcoming: assignments.filter((item: any) => item.computed_status === 'upcoming').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-primary)]">Plan · Deadlines</p><h1 className="text-2xl font-bold text-white mt-1">Assignments</h1><p className="text-sm text-[var(--theme-text-muted)] mt-1">Deadline-driven obligations with deliberate reminders.</p></div>
        <Button variant="primary" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1.5" /> New assignment</Button>
      </div>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      <DomainInsightCard domain="assignments" />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Overdue', count: statusCounts.overdue, color: 'text-red-400' },
          { label: 'Due Today', count: statusCounts.due_today, color: 'text-orange-300' },
          { label: 'Due Soon', count: statusCounts.due_soon, color: 'text-amber-300' },
          { label: 'Upcoming', count: statusCounts.upcoming, color: 'text-blue-300' },
        ].map((stat) => <GlassCard key={stat.label} padding="sm" className="text-center"><div className={cn('text-2xl font-bold', stat.color)}>{stat.count}</div><div className="text-xs text-[var(--theme-text-muted)]">{stat.label}</div></GlassCard>)}
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-[var(--theme-primary)] animate-spin" /></div>}
      {!loading && assignments.length === 0 && <GlassCard padding="lg" className="text-center py-12"><p className="text-[var(--theme-text-muted)]">No active assignments.</p></GlassCard>}

      <div className="space-y-3">
        {sortedAssignments.map((assignment: any, index: number) => {
          const overdue = assignment.computed_status === 'overdue';
          return (
            <GlassCard key={assignment.id} hover={!overdue} padding="md" className={cn('animate-enter border-l-4', priorityColors[assignment.priority as keyof typeof priorityColors], overdue && 'opacity-55 grayscale border-l-slate-500')} style={{ animationDelay: `${index * 60}ms` }}>
              <div className="flex items-start gap-4">
                {overdue ? (
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-white/10 bg-white/[0.03]" title="Deadline passed">
                    <AlertTriangle className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                ) : (
                  <Checkbox onCheckedChange={() => void handleComplete(assignment.id)} className="mt-1 border-white/30 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap"><h3 className={cn('text-base font-semibold', overdue ? 'text-slate-400' : 'text-white')}>{assignment.title}</h3><StatusBadge status={assignment.computed_status} /><StatusBadge status={assignment.priority} /></div>
                  {assignment.description && <p className="text-sm text-[var(--theme-text-muted)] mt-1">{assignment.description}</p>}
                  <div className="flex items-center gap-4 mt-3 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs text-[var(--theme-text-muted)]"><Clock className="w-3.5 h-3.5" /><span>{formatDateTime(assignment.deadline)}</span></div>
                    <div className={cn('flex items-center gap-1.5 text-xs font-medium', overdue ? 'text-slate-400' : assignment.computed_status === 'due_today' ? 'text-orange-300' : 'text-[var(--theme-text-muted)]')}>{overdue && <AlertTriangle className="w-3.5 h-3.5" />}<span>{overdue ? 'Deadline passed — completion closed' : getRelativeTime(assignment.deadline)}</span></div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {assignment.category && <span className="text-xs px-2 py-1 rounded-full bg-white/5 text-[var(--theme-text-muted)] border border-white/10 shrink-0">{assignment.category}</span>}
                  <button type="button" onClick={() => void handleDeleteAssignment(assignment)} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/20" title="Delete assignment permanently"><Trash2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Delete</span></button>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      <CreateModal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create assignment" onSubmit={handleCreate}>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Title *</label><input value={newAssignment.title} onChange={(e) => setNewAssignment({ ...newAssignment, title: e.target.value })} placeholder="e.g. Submit project proposal" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-500" /></div>
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label><textarea value={newAssignment.description} onChange={(e) => setNewAssignment({ ...newAssignment, description: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white resize-none h-20" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Deadline *</label><input type="datetime-local" value={newAssignment.deadline} onChange={(e) => setNewAssignment({ ...newAssignment, deadline: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" /></div>
            <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Priority</label><select value={newAssignment.priority} onChange={(e) => setPriority(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white"><option value="low" className="bg-slate-950">Low</option><option value="medium" className="bg-slate-950">Medium</option><option value="high" className="bg-slate-950">High</option><option value="urgent" className="bg-slate-950">Urgent</option></select></div>
          </div>
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Category</label><input value={newAssignment.category} onChange={(e) => setNewAssignment({ ...newAssignment, category: e.target.value })} placeholder="e.g. Work" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" /></div>

          <div className="rounded-xl border border-white/10 bg-black/10 p-4 space-y-4">
            <div className="flex items-start justify-between gap-4"><div className="flex gap-2"><Bell className="w-4 h-4 text-[var(--theme-primary)] mt-0.5" /><div><p className="text-sm font-medium text-white">Assignment reminders</p><p className="text-xs text-slate-400 mt-0.5">CrysTrack proposes useful defaults; you can remove any reminder.</p></div></div><button type="button" onClick={() => setNewAssignment({ ...newAssignment, remindersEnabled: !newAssignment.remindersEnabled })} className={cn('w-11 h-6 rounded-full relative transition-colors shrink-0', newAssignment.remindersEnabled ? 'bg-[var(--theme-primary)]' : 'bg-white/10')}><span className={cn('absolute top-1 w-4 h-4 rounded-full bg-white transition-all', newAssignment.remindersEnabled ? 'left-6' : 'left-1')} /></button></div>
            {newAssignment.remindersEnabled && <>
              <div><label className="block text-xs text-slate-400 mb-1.5">Delivery channel</label><select value={newAssignment.reminderChannel} onChange={(e) => setNewAssignment({ ...newAssignment, reminderChannel: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"><option value="push" className="bg-slate-950">Web Push</option><option value="telegram" className="bg-slate-950">Telegram</option><option value="both" className="bg-slate-950">Web Push + Telegram</option></select></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{proposedOffsets(newAssignment.priority).map((offset) => <label key={offset} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300"><input type="checkbox" checked={newAssignment.reminderOffsets.includes(offset)} onChange={() => toggleOffset(offset)} /> {offsetLabel(offset)}</label>)}</div>
              {newAssignment.priority === 'urgent' && <p className="text-[11px] text-amber-300">Urgent assignments may bypass Do Not Disturb at critical reminder times.</p>}
            </>}
          </div>
        </div>
      </CreateModal>
    </div>
  );
}
