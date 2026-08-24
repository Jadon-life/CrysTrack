'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Bell, BrainCircuit, Calendar, CheckCircle2, Loader2, MessageSquareText, Plus, Target, Trash2 } from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';
import { DomainInsightCard } from '@/components/ai/domain-insight-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CreateModal } from '@/components/shared/create-modal';
import { del, fetcher, post } from '@/lib/api';
import { cn, getRelativeTime } from '@/lib/utils';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const emptyCheckIn = { durationMinutes: '', responseText: '', learnedText: '', blockers: '', progressValue: '' };

function newGoalState() {
  return {
    title: '', description: '', deadline: '', category: '',
    progressMode: 'percentage', startingValue: '0', targetValue: '', progressUnit: '%', aiCoaching: false,
    checkinFrequency: 'weekly', checkinDays: [new Date().getDay()] as number[], checkinTime: '20:00', reminderChannel: 'push',
    deadlineReminders: true,
  };
}

function goalPercent(goal: any) {
  if (goal.progress_mode !== 'percentage' && !goal.measurable) return null;
  const start = goal.starting_value == null ? 0 : Number(goal.starting_value);
  const current = Number(goal.progress_value ?? start);
  const target = Number(goal.target_value);
  if (!Number.isFinite(target) || target === start) return null;
  return Math.max(0, Math.min(100, Math.round((((current - start) / (target - start)) * 100) * 10) / 10));
}

function checkInState(goal: any) {
  return goal.checkin_state || { status: 'not_scheduled', due: false, available: false, completed: false };
}

function goalIsOverdue(goal: any) {
  if (!goal.deadline || goal.status !== 'active') return false;
  const deadline = new Date(goal.deadline).getTime();
  return Number.isFinite(deadline) && deadline < Date.now();
}

function latestAnalysis(goal: any) {
  return (goal.goal_checkins || []).find((item: any) => item.ai_analysis)?.ai_analysis || null;
}

function analysisTone(status: string) {
  if (status === 'strong_progress' || status === 'on_track') return 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10';
  if (status === 'needs_attention') return 'text-amber-200 border-amber-500/20 bg-amber-500/10';
  if (status === 'at_risk' || status === 'stalled') return 'text-red-200 border-red-500/20 bg-red-500/10';
  return 'text-slate-200 border-white/10 bg-white/5';
}

export default function GoalsPage() {
  const searchParams = useSearchParams();
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [checkInGoal, setCheckInGoal] = useState<any | null>(null);
  const [checkIn, setCheckIn] = useState(emptyCheckIn);
  const [newGoal, setNewGoal] = useState(newGoalState());

  const loadGoals = useCallback(async () => {
    setLoading(true); setError('');
    try { setGoals(await fetcher('/api/goals')); }
    catch (e: any) { setError(e.message || 'Failed to load goals'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetcher('/api/preferences').then((prefs: any) => {
      const channels = prefs?.default_reminder_channels || ['push'];
      const reminderChannel = channels.includes('push') && channels.includes('telegram') ? 'both' : channels.includes('telegram') ? 'telegram' : 'push';
      setNewGoal((current: any) => ({ ...current, reminderChannel }));
    }).catch(() => null);
  }, []);

  useEffect(() => { void loadGoals(); }, [loadGoals]);
  useEffect(() => { if (searchParams.get('create') === 'goal') setShowCreate(true); }, [searchParams]);

  const toggleCheckinDay = (day: number) => setNewGoal((current) => ({
    ...current,
    checkinDays: current.checkinFrequency === 'weekly'
      ? [day]
      : current.checkinDays.includes(day)
        ? current.checkinDays.filter((value) => value !== day)
        : [...current.checkinDays, day],
  }));

  const setCheckinFrequency = (frequency: string) => setNewGoal((current) => ({
    ...current,
    checkinFrequency: frequency,
    checkinDays: frequency === 'daily'
      ? []
      : frequency === 'weekly'
        ? [current.checkinDays[0] ?? new Date().getDay()]
        : current.checkinDays.length ? current.checkinDays : [new Date().getDay()],
  }));

  const handleCreate = async () => {
    if (!newGoal.title.trim()) throw new Error('Title is required');
    if (newGoal.progressMode === 'percentage' && !newGoal.targetValue) throw new Error('Numeric goals need a target value');
    if (newGoal.checkinFrequency !== 'daily' && newGoal.checkinDays.length === 0) throw new Error('Choose at least one check-in day');

    const deadline = newGoal.deadline ? new Date(`${newGoal.deadline}T23:59:59`) : null;
    await post('/api/goals', {
      title: newGoal.title,
      description: newGoal.description,
      deadline: deadline?.toISOString() || null,
      category: newGoal.category,
      progressMode: newGoal.progressMode,
      startingValue: newGoal.progressMode === 'percentage' ? newGoal.startingValue : null,
      targetValue: newGoal.progressMode === 'percentage' ? newGoal.targetValue : null,
      progressUnit: newGoal.progressMode === 'percentage' ? newGoal.progressUnit : null,
      aiCoaching: newGoal.progressMode === 'ai' ? true : newGoal.aiCoaching,
      checkinConfig: {
        frequency: newGoal.checkinFrequency,
        days: newGoal.checkinFrequency === 'daily' ? [] : newGoal.checkinDays,
        time: newGoal.checkinTime,
        channels: newGoal.reminderChannel === 'both' ? ['push', 'telegram'] : [newGoal.reminderChannel],
      },
      deadlineReminderConfig: {
        enabled: Boolean(newGoal.deadline && newGoal.deadlineReminders),
        offsetMinutes: [10080, 4320, 1440],
        channels: newGoal.reminderChannel === 'both' ? ['push', 'telegram'] : [newGoal.reminderChannel],
      },
    });
    await loadGoals();
    window.dispatchEvent(new Event('crystrack-activity-updated'));
    setNewGoal((current) => ({ ...newGoalState(), reminderChannel: current.reminderChannel }));
  };

  const submitCheckIn = async () => {
    if (!checkInGoal) throw new Error('No goal selected');
    if (goalIsOverdue(checkInGoal)) throw new Error('This goal deadline has passed. Check-ins are closed.');
    if (checkInGoal.progress_mode === 'ai' && !checkIn.responseText.trim() && !checkIn.learnedText.trim() && !checkIn.blockers.trim()) {
      throw new Error('AI-assisted check-ins need a short description of what changed or what you did');
    }
    const result = await post(`/api/goals/${checkInGoal.id}/checkins`, checkIn);
    await loadGoals();
    window.dispatchEvent(new Event('crystrack-activity-updated'));
    if ((checkInGoal.progress_mode === 'ai' || checkInGoal.ai_coaching) && result?.aiConfigured === false) {
      setError('Check-in saved. Goal AI is ready in the code but will remain inactive until a free Groq API key is added to the server environment.');
    } else if (result?.analysis?.status === 'unavailable') {
      setError(`Check-in saved. AI analysis could not run: ${result.analysis.summary}`);
    }
    setCheckInGoal(null);
    setCheckIn(emptyCheckIn);
  };

  const handleDeleteGoal = async (goal: any) => {
    if (!window.confirm(`Delete "${goal.title}" permanently? This removes its check-ins, insights and reminders.`)) return;
    setError('');
    try {
      await del(`/api/goals/${goal.id}`);
      if (checkInGoal?.id === goal.id) {
        setCheckInGoal(null);
        setCheckIn(emptyCheckIn);
      }
      await loadGoals();
      window.dispatchEvent(new Event('crystrack-activity-updated'));
    } catch (e: any) {
      setError(e.message || 'Failed to delete goal');
    }
  };

  const checkInsDue = useMemo(
    () => goals.filter((goal) => !goalIsOverdue(goal) && checkInState(goal).due),
    [goals],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-primary)]">Plan · Direction</p><h1 className="text-2xl font-bold text-white mt-1">Goals</h1><p className="text-sm text-[var(--theme-text-muted)] mt-1">Measure outcomes directly or let AI evaluate real evidence from your check-ins.</p></div>
        <Button variant="primary" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1.5" />New goal</Button>
      </div>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
      <DomainInsightCard domain="goals" />

      {checkInsDue.length > 0 && <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 flex items-center justify-between gap-4"><div className="flex items-center gap-3"><AlertCircle className="w-5 h-5 text-amber-300" /><p className="text-sm text-amber-100">{checkInsDue.length} scheduled goal check-in{checkInsDue.length === 1 ? '' : 's'} due today.</p></div><button onClick={() => setCheckInGoal(checkInsDue[0])} className="text-xs font-semibold text-amber-200">Review now</button></div>}

      {loading && <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-[var(--theme-primary)] animate-spin" /></div>}
      {!loading && goals.length === 0 && <GlassCard padding="lg" className="text-center py-12"><p className="text-[var(--theme-text-muted)]">No goals yet. Create an outcome you want CrysTrack to help you pursue.</p></GlassCard>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {goals.map((goal: any, index: number) => {
          const percent = goalPercent(goal);
          const state = checkInState(goal);
          const overdue = goalIsOverdue(goal);
          const due = !overdue && state.due;
          const analysis = latestAnalysis(goal);
          const start = goal.starting_value == null ? 0 : Number(goal.starting_value);
          const current = Number(goal.progress_value ?? start);
          const unit = goal.progress_unit || '';
          return (
            <GlassCard key={goal.id} padding="md" hover={!overdue} className={cn('animate-enter', overdue && 'opacity-55 grayscale')} style={{ animationDelay: `${index * 60}ms` }}>
              <div className="flex items-start justify-between gap-3 mb-3"><div className="flex items-center gap-2"><Target className={cn('w-5 h-5', overdue ? 'text-slate-500' : 'text-[var(--theme-primary)]')} /><StatusBadge status={overdue ? 'overdue' : goal.status} /></div><span className="text-[10px] uppercase tracking-wide text-[var(--theme-text-muted)]">{goal.progress_mode === 'ai' ? 'AI assisted' : 'Numeric'}</span></div>
              <h3 className="text-lg font-semibold text-white">{goal.title}</h3>
              {goal.description && <p className="text-sm text-[var(--theme-text-muted)] mt-1 line-clamp-2">{goal.description}</p>}

              {percent != null ? <div className="mt-4"><div className="flex justify-between text-xs mb-1.5"><span className="text-[var(--theme-text-muted)]">Progress</span><span className="font-semibold text-[var(--theme-primary)]">{percent}%</span></div><Progress value={percent} className="h-2 bg-white/10" /><p className="text-[11px] text-[var(--theme-text-muted)] mt-1">{current}{unit ? ` ${unit}` : ''} of {goal.target_value}{unit ? ` ${unit}` : ''}</p></div> : <div className="mt-4 flex items-center gap-2 text-sm text-[var(--theme-text-muted)]"><BrainCircuit className="w-4 h-4 text-violet-300" /><span>Progress judged from check-in evidence</span></div>}

              {analysis && <div className={cn('mt-4 rounded-xl border p-3', analysisTone(analysis.status))}><div className="flex items-center gap-2"><BrainCircuit className="w-4 h-4" /><span className="text-[10px] font-bold uppercase tracking-wide">{String(analysis.status).replaceAll('_', ' ')}</span></div><p className="text-xs leading-relaxed mt-2 text-white/90">{analysis.summary}</p>{analysis.next_action && <p className="text-[11px] mt-2 text-white/70"><strong>Next:</strong> {analysis.next_action}</p>}</div>}

              <div className="flex items-center justify-between gap-3 text-xs text-[var(--theme-text-muted)] mt-4 mb-4"><div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /><span>{goal.deadline ? getRelativeTime(goal.deadline) : 'No deadline'}</span></div>{overdue ? <span className="text-slate-400">Deadline passed</span> : due && <span className="text-amber-200">Check-in due</span>}</div>
              <div className="flex items-stretch gap-2">
                {overdue ? (
                  <div className="flex-1 inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2 text-xs font-medium text-slate-400">Deadline passed — check-ins closed</div>
                ) : (
                  <Button variant={due ? 'primary' : 'default'} size="sm" className="flex-1" disabled={!state.available} onClick={() => { setCheckInGoal(goal); setCheckIn({ ...emptyCheckIn, progressValue: percent != null ? String(current) : '' }); }}><MessageSquareText className="w-4 h-4 mr-1.5" />{state.completed ? 'Checked in' : state.available ? 'Check in' : 'Not scheduled today'}</Button>
                )}
                <button type="button" onClick={() => void handleDeleteGoal(goal)} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/20" title="Delete goal permanently"><Trash2 className="w-4 h-4" /><span className="hidden sm:inline">Delete</span></button>
              </div>
            </GlassCard>
          );
        })}
      </div>

      <CreateModal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create goal" onSubmit={handleCreate}>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Goal *</label><input value={newGoal.title} onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })} placeholder="e.g. Gain 10kg by December 13" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-500" /></div>
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Describe the outcome</label><textarea value={newGoal.description} onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })} placeholder="What would success look like?" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white resize-none h-20" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-slate-300 mb-1.5">Deadline</label><input type="date" value={newGoal.deadline} onChange={(e) => setNewGoal({ ...newGoal, deadline: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" /></div><div><label className="block text-sm font-medium text-slate-300 mb-1.5">Category</label><input value={newGoal.category} onChange={(e) => setNewGoal({ ...newGoal, category: e.target.value })} placeholder="Fitness, Learning, Project…" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" /></div></div>

          <div className="rounded-xl border border-white/10 bg-black/10 p-4 space-y-4">
            <div><p className="text-sm font-medium text-white">How should progress be tracked?</p><p className="text-xs text-slate-400 mt-1">Use numbers when the outcome has a real measurement; use AI when progress is better described through evidence.</p></div>
            <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setNewGoal({ ...newGoal, progressMode: 'percentage' })} className={cn('rounded-xl border p-3 text-left', newGoal.progressMode === 'percentage' ? 'border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_14%,transparent)]' : 'border-white/10 bg-white/[0.03]')}><p className="text-xs font-semibold text-white">Numeric / Percentage</p><p className="text-[11px] text-slate-400 mt-1">Weight, books, pages, %, projects…</p></button><button type="button" onClick={() => setNewGoal({ ...newGoal, progressMode: 'ai', aiCoaching: true })} className={cn('rounded-xl border p-3 text-left', newGoal.progressMode === 'ai' ? 'border-violet-400/50 bg-violet-500/10' : 'border-white/10 bg-white/[0.03]')}><p className="text-xs font-semibold text-white">AI-assisted</p><p className="text-[11px] text-slate-400 mt-1">Six-pack, learning mastery, project quality…</p></button></div>
            {newGoal.progressMode === 'percentage' && <><div className="grid grid-cols-3 gap-2"><div><label className="block text-xs text-slate-400 mb-1">Starting</label><input type="number" value={newGoal.startingValue} onChange={(e) => setNewGoal({ ...newGoal, startingValue: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" /></div><div><label className="block text-xs text-slate-400 mb-1">Target</label><input type="number" value={newGoal.targetValue} onChange={(e) => setNewGoal({ ...newGoal, targetValue: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" /></div><div><label className="block text-xs text-slate-400 mb-1">Unit</label><input value={newGoal.progressUnit} onChange={(e) => setNewGoal({ ...newGoal, progressUnit: e.target.value })} placeholder="kg, books, %" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" /></div></div><label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={newGoal.aiCoaching} onChange={(e) => setNewGoal({ ...newGoal, aiCoaching: e.target.checked })} /> Add AI coaching to my numeric check-ins</label></>}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/10 p-4 space-y-4">
            <div className="flex gap-2"><Bell className="w-4 h-4 text-[var(--theme-primary)] mt-0.5" /><div><p className="text-sm font-medium text-white">Check-in rhythm</p><p className="text-xs text-slate-400 mt-1">Each scheduled occurrence expires on its own boundary; a missed occurrence counts as no progress evidence recorded for that period.</p></div></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="block text-xs text-slate-400 mb-1">Frequency</label><select value={newGoal.checkinFrequency} onChange={(e) => setCheckinFrequency(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"><option value="daily" className="bg-slate-950">Daily</option><option value="weekly" className="bg-slate-950">Weekly</option><option value="specific" className="bg-slate-950">Specific days</option></select></div><div><label className="block text-xs text-slate-400 mb-1">Check-in time</label><input type="time" value={newGoal.checkinTime} onChange={(e) => setNewGoal({ ...newGoal, checkinTime: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" /></div></div>
            {newGoal.checkinFrequency !== 'daily' && <div className="flex flex-wrap gap-2">{weekdays.map((day, index) => <button type="button" key={day} onClick={() => toggleCheckinDay(index)} className={cn('px-2.5 py-1.5 rounded-lg border text-xs', newGoal.checkinDays.includes(index) ? 'border-[var(--theme-primary)] text-white bg-white/10' : 'border-white/10 text-slate-400')}>{day}</button>)}</div>}
            <div><label className="block text-xs text-slate-400 mb-1">Reminder channel</label><select value={newGoal.reminderChannel} onChange={(e) => setNewGoal({ ...newGoal, reminderChannel: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"><option value="push" className="bg-slate-950">Web Push</option><option value="telegram" className="bg-slate-950">Telegram</option><option value="both" className="bg-slate-950">Web Push + Telegram</option></select></div>
            {newGoal.deadline && <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={newGoal.deadlineReminders} onChange={(e) => setNewGoal({ ...newGoal, deadlineReminders: e.target.checked })} /> Warn me as the goal deadline approaches</label>}
          </div>
        </div>
      </CreateModal>

      <CreateModal isOpen={Boolean(checkInGoal)} onClose={() => { setCheckInGoal(null); setCheckIn(emptyCheckIn); }} title={checkInGoal ? `Check in · ${checkInGoal.title}` : 'Goal check-in'} onSubmit={submitCheckIn}>
        <div className="space-y-4">
          {checkInGoal?.progress_mode === 'percentage' && <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Current {checkInGoal.progress_unit || 'value'}</label><input type="number" value={checkIn.progressValue} onChange={(e) => setCheckIn({ ...checkIn, progressValue: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" /><p className="text-[11px] text-slate-500 mt-1">CrysTrack calculates the real percentage from your starting and target values.</p></div>}
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">What moved forward?</label><textarea value={checkIn.responseText} onChange={(e) => setCheckIn({ ...checkIn, responseText: e.target.value })} placeholder={checkInGoal?.progress_mode === 'ai' ? 'Describe what you did or what changed. The AI will compare it with the goal and previous check-ins.' : 'Optional evidence or context for this progress update.'} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white resize-none h-24" /></div>
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">What did you learn?</label><textarea value={checkIn.learnedText} onChange={(e) => setCheckIn({ ...checkIn, learnedText: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white resize-none h-16" /></div>
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Blockers</label><textarea value={checkIn.blockers} onChange={(e) => setCheckIn({ ...checkIn, blockers: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white resize-none h-16" /></div>
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Minutes spent</label><input type="number" min="0" value={checkIn.durationMinutes} onChange={(e) => setCheckIn({ ...checkIn, durationMinutes: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" /></div>
          {(checkInGoal?.progress_mode === 'ai' || checkInGoal?.ai_coaching) && <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-3 text-xs text-violet-100"><div className="flex gap-2"><BrainCircuit className="w-4 h-4 shrink-0" /><p>CrysTrack will analyze this evidence against the exact goal, deadline and prior check-ins. It will not invent measurements or fake percentages.</p></div></div>}
        </div>
      </CreateModal>
    </div>
  );
}
