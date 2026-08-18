'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { GlassCard } from '@/components/shared/glass-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CreateModal } from '@/components/shared/create-modal';
import { fetcher, post } from '@/lib/api';
import { getRelativeTime } from '@/lib/utils';
import { Plus, Target, Calendar, CheckCircle2, AlertCircle, Loader2, MessageSquareText } from 'lucide-react';

const emptyCheckIn = { durationMinutes: '', responseText: '', learnedText: '', blockers: '', progressValue: '' };

export default function GoalsPage() {
  const searchParams = useSearchParams();
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [checkInGoal, setCheckInGoal] = useState<any | null>(null);
  const [checkIn, setCheckIn] = useState(emptyCheckIn);
  const [newGoal, setNewGoal] = useState({ title: '', description: '', deadline: '', measurable: false, targetValue: '', category: '' });

  const loadGoals = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setGoals(await fetcher('/api/goals'));
    } catch (e: any) {
      setError(e.message || 'Failed to load goals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGoals(); }, [loadGoals]);
  useEffect(() => { if (searchParams.get('create') === 'goal') setShowCreate(true); }, [searchParams]);

  const handleCreate = async () => {
    if (!newGoal.title.trim()) throw new Error('Title is required');
    await post('/api/goals', {
      title: newGoal.title,
      description: newGoal.description,
      deadline: newGoal.deadline || null,
      measurable: newGoal.measurable,
      target_value: newGoal.measurable ? Number(newGoal.targetValue) || 0 : null,
      progress_value: 0,
      category: newGoal.category,
    });
    await loadGoals();
    setNewGoal({ title: '', description: '', deadline: '', measurable: false, targetValue: '', category: '' });
  };

  const submitCheckIn = async () => {
    if (!checkInGoal) throw new Error('No goal selected');
    await post(`/api/goals/${checkInGoal.id}/checkins`, checkIn);
    await loadGoals();
    setCheckInGoal(null);
    setCheckIn(emptyCheckIn);
  };

  const needsCheckIn = (goal: any) => !(goal.goal_checkins || []).some((checkinItem: any) => new Date(checkinItem.created_at).toDateString() === new Date().toDateString());
  const checkInsDue = goals.filter(needsCheckIn);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">Plan · Direction</p>
          <h1 className="text-2xl font-bold text-white mt-1">Goals</h1>
          <p className="text-sm text-slate-400 mt-1">Long-term outcomes with a real check-in loop.</p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1.5" />New goal</Button>
      </div>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      {checkInsDue.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
            <p className="text-sm text-amber-100">{checkInsDue.length} goal{checkInsDue.length === 1 ? '' : 's'} need a check-in today.</p>
          </div>
          <button onClick={() => setCheckInGoal(checkInsDue[0])} className="text-xs font-semibold text-amber-300 hover:text-amber-200 shrink-0">Review now</button>
        </div>
      )}

      {loading && <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>}
      {!loading && goals.length === 0 && <GlassCard padding="lg" className="text-center py-12"><p className="text-slate-400">No goals yet. Create your first outcome.</p></GlassCard>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {goals.map((goal: any, index: number) => {
          const target = Number(goal.target_value || 0);
          const current = Number(goal.progress_value || 0);
          const percent = goal.measurable && target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
          const due = needsCheckIn(goal);
          return (
            <GlassCard key={goal.id} padding="md" className="animate-enter" style={{ animationDelay: `${index * 60}ms` }}>
              <div className="flex items-start justify-between mb-3 gap-3">
                <div className="flex items-center gap-2"><Target className="w-5 h-5 text-blue-400" /><StatusBadge status={goal.status} /></div>
                {due && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">Check-in due</span>}
              </div>
              <h3 className="text-lg font-semibold text-white mb-1">{goal.title}</h3>
              {goal.description && <p className="text-sm text-slate-400 mb-4 line-clamp-2">{goal.description}</p>}
              {goal.measurable ? (
                <div className="mb-4">
                  <div className="flex justify-between text-xs mb-1.5"><span className="text-slate-400">Progress</span><span className="text-blue-400 font-medium">{percent}%</span></div>
                  <Progress value={percent} className="h-2 bg-white/10" />
                  <p className="text-[11px] text-slate-600 mt-1">{current} of {target}</p>
                </div>
              ) : (
                <div className="mb-4 flex items-center gap-2 text-sm text-slate-400"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>Tracked through check-ins</span></div>
              )}
              <div className="flex items-center justify-between gap-3 text-xs text-slate-500 mb-4">
                <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /><span>{goal.deadline ? getRelativeTime(goal.deadline) : 'No deadline'}</span></div>
                {goal.category && <span className="px-2 py-0.5 rounded-full bg-white/[0.035] border border-white/10">{goal.category}</span>}
              </div>
              <Button variant={due ? 'primary' : 'default'} size="sm" className="w-full" onClick={() => { setCheckInGoal(goal); setCheckIn({ ...emptyCheckIn, progressValue: goal.measurable ? String(current) : '' }); }}>
                <MessageSquareText className="w-4 h-4 mr-1.5" /> Check in
              </Button>
            </GlassCard>
          );
        })}
      </div>

      <CreateModal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create goal" onSubmit={handleCreate}>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Goal title *</label><input value={newGoal.title} onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })} placeholder="e.g. Complete a professional certification" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" required /></div>
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label><textarea value={newGoal.description} onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })} placeholder="What outcome are you working toward?" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 resize-none h-20" /></div>
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Deadline</label><input type="date" value={newGoal.deadline} onChange={(e) => setNewGoal({ ...newGoal, deadline: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" /></div>
          <label className="flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" checked={newGoal.measurable} onChange={(e) => setNewGoal({ ...newGoal, measurable: e.target.checked })} className="w-4 h-4 rounded border-white/30 bg-white/5" />This goal has a numeric target</label>
          {newGoal.measurable && <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Target value</label><input type="number" min="0" value={newGoal.targetValue} onChange={(e) => setNewGoal({ ...newGoal, targetValue: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" /></div>}
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Category</label><input value={newGoal.category} onChange={(e) => setNewGoal({ ...newGoal, category: e.target.value })} placeholder="e.g. Career" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" /></div>
        </div>
      </CreateModal>

      <CreateModal isOpen={Boolean(checkInGoal)} onClose={() => { setCheckInGoal(null); setCheckIn(emptyCheckIn); }} title={checkInGoal ? `Check in · ${checkInGoal.title}` : 'Goal check-in'} onSubmit={submitCheckIn}>
        <div className="space-y-4">
          {checkInGoal?.measurable && <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Current progress</label><input type="number" min="0" max={Number(checkInGoal.target_value || undefined)} value={checkIn.progressValue} onChange={(e) => setCheckIn({ ...checkIn, progressValue: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" /></div>}
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">What did you do?</label><textarea value={checkIn.responseText} onChange={(e) => setCheckIn({ ...checkIn, responseText: e.target.value })} placeholder="Record the concrete action or progress." className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 resize-none h-20" /></div>
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">What did you learn?</label><textarea value={checkIn.learnedText} onChange={(e) => setCheckIn({ ...checkIn, learnedText: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 resize-none h-16" /></div>
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Blockers</label><textarea value={checkIn.blockers} onChange={(e) => setCheckIn({ ...checkIn, blockers: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 resize-none h-16" /></div>
          <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Minutes spent</label><input type="number" min="0" value={checkIn.durationMinutes} onChange={(e) => setCheckIn({ ...checkIn, durationMinutes: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" /></div>
        </div>
      </CreateModal>
    </div>
  );
}
