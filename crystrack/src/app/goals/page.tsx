'use client';

import React, { useState, useEffect } from 'react';
import { GlassCard } from '@/components/shared/glass-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CreateModal } from '@/components/shared/create-modal';
import { fetcher, post } from '@/lib/api';
import { cn, getRelativeTime } from '@/lib/utils';
import { Plus, Target, Calendar, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function GoalsPage() {
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: '', description: '', deadline: '', measurable: false, targetValue: '', category: '' });

  useEffect(() => {
    loadGoals();
  }, []);

  const loadGoals = async () => {
    setLoading(true);
    try {
      const data = await fetcher('/api/goals');
      setGoals(data);
    } catch (e) {
      console.error('Failed to load goals', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newGoal.title.trim()) throw new Error('Title is required');
    await post('/api/goals', {
      title: newGoal.title,
      description: newGoal.description,
      deadline: newGoal.deadline || null,
      measurable: newGoal.measurable,
      targetValue: newGoal.measurable ? parseFloat(newGoal.targetValue) || 0 : null,
      category: newGoal.category,
    });
    await loadGoals();
    setNewGoal({ title: '', description: '', deadline: '', measurable: false, targetValue: '', category: '' });
  };

  const checkInsDue = goals.filter((g: any) => {
    if (!g.goal_checkins || g.goal_checkins.length === 0) return true;
    const lastCheckIn = new Date(g.goal_checkins[0]?.created_at);
    const today = new Date();
    return lastCheckIn.toDateString() !== today.toDateString();
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Goals</h1>
          <p className="text-sm text-slate-400 mt-1">Long-term objectives and milestones</p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          New Goal
        </Button>
      </div>

      {checkInsDue.length > 0 && (
        <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-violet-400" />
            <div>
              <p className="text-sm font-medium text-violet-200">{checkInsDue.length} goal{checkInsDue.length > 1 ? 's' : ''} need{checkInsDue.length === 1 ? 's' : ''} a check-in today</p>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
        </div>
      )}

      {!loading && goals.length === 0 && (
        <GlassCard padding="lg" className="text-center py-12">
          <p className="text-slate-400">No goals yet. Create your first goal!</p>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {goals.map((goal: any, index: number) => {
          const percent = goal.measurable && goal.target_value > 0 
            ? Math.round((parseFloat(goal.progress_value || 0) / parseFloat(goal.target_value)) * 100)
            : 0;
          const needsCheckIn = !goal.goal_checkins?.some((c: any) => new Date(c.created_at).toDateString() === new Date().toDateString());
          return (
            <GlassCard key={goal.id} hover padding="md" className="animate-enter" style={{ animationDelay: `${index * 100}ms` }}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-violet-400" />
                  <StatusBadge status={goal.status} />
                </div>
                {needsCheckIn && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">Check-in due</span>
                )}
              </div>
              <h3 className="text-lg font-semibold text-white mb-1">{goal.title}</h3>
              <p className="text-sm text-slate-400 mb-4 line-clamp-2">{goal.description}</p>
              {goal.measurable && (
                <div className="mb-4">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-400">Progress</span>
                    <span className="text-violet-400 font-medium">{percent}%</span>
                  </div>
                  <Progress value={percent} className="h-2 bg-white/10" />
                </div>
              )}
              {!goal.measurable && (
                <div className="mb-4 flex items-center gap-2 text-sm text-slate-400">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Qualitative goal - track via check-ins</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{goal.deadline ? getRelativeTime(goal.deadline) : 'No deadline'}</span>
                </div>
                {goal.category && <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">{goal.category}</span>}
              </div>
            </GlassCard>
          );
        })}
      </div>

      <CreateModal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create New Goal" onSubmit={handleCreate}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Goal Title *</label>
            <input value={newGoal.title} onChange={e => setNewGoal({...newGoal, title: e.target.value})} placeholder="e.g. Learn JavaScript" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
            <textarea value={newGoal.description} onChange={e => setNewGoal({...newGoal, description: e.target.value})} placeholder="What do you want to achieve?" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 resize-none h-20" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Deadline</label>
            <input type="date" value={newGoal.deadline} onChange={e => setNewGoal({...newGoal, deadline: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" />
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="measurable" checked={newGoal.measurable} onChange={e => setNewGoal({...newGoal, measurable: e.target.checked})} className="w-4 h-4 rounded border-white/30 bg-white/5 text-blue-500" />
            <label htmlFor="measurable" className="text-sm text-slate-300">This goal is measurable (has a number target)</label>
          </div>
          {newGoal.measurable && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Target Value</label>
              <input type="number" value={newGoal.targetValue} onChange={e => setNewGoal({...newGoal, targetValue: e.target.value})} placeholder="e.g. 100" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Category</label>
            <input value={newGoal.category} onChange={e => setNewGoal({...newGoal, category: e.target.value})} placeholder="e.g. Career" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" />
          </div>
        </div>
      </CreateModal>
    </div>
  );
}
