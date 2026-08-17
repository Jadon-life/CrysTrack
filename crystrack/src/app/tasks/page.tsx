'use client';

import React, { useState, useEffect } from 'react';
import { GlassCard } from '@/components/shared/glass-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { CreateModal } from '@/components/shared/create-modal';
import { fetcher, post } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Plus, Flame, Calendar, Clock, Filter, Loader2 } from 'lucide-react';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDay, setFilterDay] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', preferredTime: '', category: '', schedules: [] as number[] });
  const today = new Date().getDay();

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await fetcher('/api/tasks');
      setTasks(data);
    } catch (e) {
      console.error('Failed to load tasks', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newTask.title.trim()) throw new Error('Title is required');
    if (newTask.schedules.length === 0) throw new Error('Select at least one day');
    await post('/api/tasks', newTask);
    await loadTasks();
    setNewTask({ title: '', description: '', preferredTime: '', category: '', schedules: [] });
  };

  const toggleDay = (day: number) => {
    setNewTask(prev => ({
      ...prev,
      schedules: prev.schedules.includes(day)
        ? prev.schedules.filter(d => d !== day)
        : [...prev.schedules, day]
    }));
  };

  const toggleTaskCompletion = async (taskId: string, date: string) => {
    try {
      await post(`/api/tasks/${taskId}/occurrences/${date}/toggle`, {});
      await loadTasks();
    } catch (e) {
      console.error('Failed to toggle task', e);
    }
  };

  const filteredTasks = filterDay !== null 
    ? tasks.filter((t: any) => t.task_schedules?.some((s: any) => s.weekday === filterDay))
    : tasks;

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Regular Tasks</h1>
          <p className="text-sm text-slate-400 mt-1">Recurring routines and habits</p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          New Task
        </Button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
        <button onClick={() => setFilterDay(null)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all', filterDay === null ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10')}>
          <Filter className="w-3.5 h-3.5" /> All
        </button>
        {weekdays.map((day, i) => (
          <button key={day} onClick={() => setFilterDay(i)} className={cn('px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all', filterDay === i ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : i === today ? 'bg-white/10 text-white border border-white/20' : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10')}>
            {day}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
      )}

      {!loading && filteredTasks.length === 0 && (
        <GlassCard padding="lg" className="text-center py-12">
          <p className="text-slate-400">No tasks yet. Create your first recurring task!</p>
        </GlassCard>
      )}

      <div className="space-y-3">
        {filteredTasks.map((task: any, index: number) => {
          const schedules = task.task_schedules?.map((s: any) => s.weekday) || [];
          const isScheduledToday = schedules.includes(today);
          return (
            <GlassCard key={task.id} hover padding="md" className="animate-enter" style={{ animationDelay: `${index * 75}ms` }}>
              <div className="flex items-start gap-4">
                <Checkbox 
                  checked={false}
                  onCheckedChange={() => toggleTaskCompletion(task.id, todayStr)}
                  className="mt-1 border-white/30 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-white">{task.title}</h3>
                    <StatusBadge status={isScheduledToday ? 'pending' : 'not_scheduled'} />
                  </div>
                  <p className="text-sm text-slate-400 mt-0.5">{task.description}</p>
                  <div className="flex items-center gap-4 mt-3 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{schedules.map((d: number) => weekdays[d]).join(', ')}</span>
                    </div>
                    {task.preferred_time && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{task.preferred_time}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-amber-400">
                      <Flame className="w-3.5 h-3.5" />
                      <span>0 day streak</span>
                    </div>
                  </div>
                </div>
                {task.category && (
                  <span className="text-xs px-2 py-1 rounded-full bg-white/5 text-slate-400 border border-white/10">
                    {task.category}
                  </span>
                )}
              </div>
            </GlassCard>
          );
        })}
      </div>

      <CreateModal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create New Task" onSubmit={handleCreate}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Task Name *</label>
            <input value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} placeholder="e.g. Morning Workout" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
            <textarea value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})} placeholder="What does this task involve?" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 resize-none h-20" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Days of Week *</label>
            <div className="flex gap-2 flex-wrap">
              {weekdays.map((day, i) => (
                <button key={day} type="button" onClick={() => toggleDay(i)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all', newTask.schedules.includes(i) ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10')}>
                  {day}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Preferred Time</label>
              <input type="time" value={newTask.preferredTime} onChange={e => setNewTask({...newTask, preferredTime: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Category</label>
              <input value={newTask.category} onChange={e => setNewTask({...newTask, category: e.target.value})} placeholder="e.g. Health" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" />
            </div>
          </div>
        </div>
      </CreateModal>
    </div>
  );
}
