'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { GlassCard } from '@/components/shared/glass-card';
import { fetcher } from '@/lib/api';
import { CheckSquare, Target, ClipboardList, ArrowRight, Loader2 } from 'lucide-react';

export default function PlanPage() {
  const [data, setData] = useState({ tasksToday: 0, tasksDone: 0, goals: 0, checkinsDue: 0, assignments: 0, urgent: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetcher('/api/tasks'), fetcher('/api/goals'), fetcher('/api/assignments')])
      .then(([tasks, goals, assignments]) => {
        const todayTasks = tasks.filter((task: any) => task.scheduled_today);
        const checkinsDue = goals.filter((goal: any) => !(goal.goal_checkins || []).some((checkin: any) => new Date(checkin.created_at).toDateString() === new Date().toDateString())).length;
        const urgent = assignments.filter((assignment: any) => ['overdue', 'due_today'].includes(assignment.computed_status)).length;
        setData({
          tasksToday: todayTasks.length,
          tasksDone: todayTasks.filter((task: any) => task.today_status === 'completed').length,
          goals: goals.length,
          checkinsDue,
          assignments: assignments.length,
          urgent,
        });
      })
      .catch((e) => setError(e.message || 'Could not load your plan'))
      .finally(() => setLoading(false));
  }, []);

  const modules = [
    { href: '/tasks', title: 'Tasks', description: 'Recurring routines and daily execution.', icon: <CheckSquare className="w-5 h-5" />, metric: `${data.tasksDone}/${data.tasksToday} today`, attention: data.tasksToday - data.tasksDone },
    { href: '/goals', title: 'Goals', description: 'Long-term outcomes and progress check-ins.', icon: <Target className="w-5 h-5" />, metric: `${data.goals} active`, attention: data.checkinsDue },
    { href: '/assignments', title: 'Assignments', description: 'Deadline-driven obligations and priorities.', icon: <ClipboardList className="w-5 h-5" />, metric: `${data.assignments} open`, attention: data.urgent },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">Plan</p>
        <h1 className="text-2xl font-bold text-white mt-1">What you&apos;re working on</h1>
        <p className="text-sm text-slate-400 mt-1">Tasks, goals, and assignments live together here instead of competing for top-level navigation.</p>
      </div>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {loading && <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 text-blue-400 animate-spin" /></div>}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {modules.map((module) => (
            <Link key={module.href} href={module.href} className="group">
              <GlassCard padding="lg" className="h-full group-hover:border-blue-500/25 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-5">{module.icon}</div>
                <h2 className="text-lg font-semibold text-white">{module.title}</h2>
                <p className="text-sm text-slate-400 mt-1 min-h-10">{module.description}</p>
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
                  <div>
                    <p className="text-sm font-semibold text-white">{module.metric}</p>
                    <p className={`text-xs mt-0.5 ${module.attention > 0 ? 'text-amber-400' : 'text-slate-500'}`}>{module.attention > 0 ? `${module.attention} need attention` : 'Up to date'}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
