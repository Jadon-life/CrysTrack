'use client';

import React, { useState, useEffect } from 'react';
import { GlassCard } from '@/components/shared/glass-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CreateModal } from '@/components/shared/create-modal';
import { fetcher, post, patch } from '@/lib/api';
import { cn, formatDateTime, getRelativeTime } from '@/lib/utils';
import { Plus, ClipboardList, Clock, AlertTriangle, Loader2 } from 'lucide-react';

const priorityColors = {
  low: 'border-l-slate-500',
  medium: 'border-l-amber-500',
  high: 'border-l-orange-500',
  urgent: 'border-l-red-500',
};

const statusOrder = ['overdue', 'due_today', 'due_soon', 'upcoming'];

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newAssignment, setNewAssignment] = useState({ title: '', description: '', deadline: '', priority: 'medium', category: '' });

  useEffect(() => {
    loadAssignments();
  }, []);

  const loadAssignments = async () => {
    setLoading(true);
    try {
      const data = await fetcher('/api/assignments');
      setAssignments(data);
    } catch (e) {
      console.error('Failed to load assignments', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newAssignment.title.trim()) throw new Error('Title is required');
    if (!newAssignment.deadline) throw new Error('Deadline is required');
    await post('/api/assignments', newAssignment);
    await loadAssignments();
    setNewAssignment({ title: '', description: '', deadline: '', priority: 'medium', category: '' });
  };

  const handleComplete = async (id: string) => {
    try {
      await patch(`/api/assignments/${id}/complete`, {});
      await loadAssignments();
    } catch (e) {
      console.error('Failed to complete assignment', e);
    }
  };

  const sortedAssignments = [...assignments].sort(
    (a, b) => statusOrder.indexOf(a.computed_status) - statusOrder.indexOf(b.computed_status)
  );

  const statusCounts = {
    overdue: assignments.filter((a: any) => a.computed_status === 'overdue').length,
    due_today: assignments.filter((a: any) => a.computed_status === 'due_today').length,
    due_soon: assignments.filter((a: any) => a.computed_status === 'due_soon').length,
    upcoming: assignments.filter((a: any) => a.computed_status === 'upcoming').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Assignments</h1>
          <p className="text-sm text-slate-400 mt-1">Deadline-driven obligations</p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          New Assignment
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Overdue', count: statusCounts.overdue, color: 'text-red-400', bg: 'bg-red-500/10' },
          { label: 'Due Today', count: statusCounts.due_today, color: 'text-orange-400', bg: 'bg-orange-500/10' },
          { label: 'Due Soon', count: statusCounts.due_soon, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          { label: 'Upcoming', count: statusCounts.upcoming, color: 'text-blue-400', bg: 'bg-blue-500/10' },
        ].map(stat => (
          <GlassCard key={stat.label} padding="sm" className="text-center">
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.count}</div>
            <div className="text-xs text-slate-400">{stat.label}</div>
          </GlassCard>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
        </div>
      )}

      {!loading && assignments.length === 0 && (
        <GlassCard padding="lg" className="text-center py-12">
          <p className="text-slate-400">No assignments yet. Create your first one!</p>
        </GlassCard>
      )}

      <div className="space-y-3">
        {sortedAssignments.map((assignment: any, index: number) => (
          <GlassCard key={assignment.id} hover padding="md" className={cn('animate-enter border-l-4', priorityColors[assignment.priority as keyof typeof priorityColors])} style={{ animationDelay: `${index * 75}ms` }}>
            <div className="flex items-start gap-4">
              <Checkbox 
                onCheckedChange={() => handleComplete(assignment.id)}
                className="mt-1 border-white/30 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-semibold text-white">{assignment.title}</h3>
                  <StatusBadge status={assignment.computed_status} />
                  <StatusBadge status={assignment.priority} />
                </div>
                <p className="text-sm text-slate-400 mt-1">{assignment.description}</p>
                <div className="flex items-center gap-4 mt-3 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatDateTime(assignment.deadline)}</span>
                  </div>
                  <div className={cn('flex items-center gap-1.5 text-xs font-medium', assignment.computed_status === 'overdue' ? 'text-red-400' : assignment.computed_status === 'due_today' ? 'text-orange-400' : 'text-slate-500')}>
                    {assignment.computed_status === 'overdue' && <AlertTriangle className="w-3.5 h-3.5" />}
                    <span>{getRelativeTime(assignment.deadline)}</span>
                  </div>
                </div>
              </div>
              {assignment.category && <span className="text-xs px-2 py-1 rounded-full bg-white/5 text-slate-400 border border-white/10 shrink-0">{assignment.category}</span>}
            </div>
          </GlassCard>
        ))}
      </div>

      <CreateModal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create New Assignment" onSubmit={handleCreate}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Title *</label>
            <input value={newAssignment.title} onChange={e => setNewAssignment({...newAssignment, title: e.target.value})} placeholder="e.g. Submit Project Proposal" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
            <textarea value={newAssignment.description} onChange={e => setNewAssignment({...newAssignment, description: e.target.value})} placeholder="Details about this assignment..." className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 resize-none h-20" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Deadline *</label>
              <input type="datetime-local" value={newAssignment.deadline} onChange={e => setNewAssignment({...newAssignment, deadline: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Priority</label>
              <select value={newAssignment.priority} onChange={e => setNewAssignment({...newAssignment, priority: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50">
                <option value="low" className="bg-slate-900">Low</option>
                <option value="medium" className="bg-slate-900">Medium</option>
                <option value="high" className="bg-slate-900">High</option>
                <option value="urgent" className="bg-slate-900">Urgent</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Category</label>
            <input value={newAssignment.category} onChange={e => setNewAssignment({...newAssignment, category: e.target.value})} placeholder="e.g. Work" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" />
          </div>
        </div>
      </CreateModal>
    </div>
  );
}
