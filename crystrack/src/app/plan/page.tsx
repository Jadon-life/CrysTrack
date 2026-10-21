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
    {
      href: '/tasks', title: 'Tasks', description: 'Recurring routines and daily execution.',
      icon: <CheckSquare className="w-5 h-5" />, metric: `${data.tasksDone}/${data.tasksToday} today`,
      attention: data.tasksToday - data.tasksDone,
      status: data.tasksToday === 0 ? 'Nothing planned for today' : data.tasksToday > data.tasksDone ? `${data.tasksToday - data.tasksDone} remaining today` : 'Up to date',
    },
    {
      href: '/goals', title: 'Goals', description: 'Long-term outcomes and progress check-ins.',
      icon: <Target className="w-5 h-5" />, metric: `${data.goals} active`,
      attention: data.checkinsDue,
      status: data.goals === 0 ? 'Start with your first goal' : data.checkinsDue > 0 ? `${data.checkinsDue} need attention` : 'Up to date',
    },
    {
      href: '/assignments', title: 'Assignments', description: 'Deadline-driven obligations and priorities.',
      icon: <ClipboardList className="w-5 h-5" />, metric: `${data.assignments} open`,
      attention: data.urgent,
      status: data.assignments === 0 ? 'No active assignments' : data.urgent > 0 ? `${data.urgent} need attention` : 'Up to date',
    },
  ];

  return (
    <div className="space-y-6">
      <header className="scenic-readable-strip max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-primary)]">Plan</p>
        <h1 className="text-2xl font-bold text-white mt-1">What you&apos;re working on</h1>
        <p className="text-sm text-white/85 mt-1">Tasks, goals, and assignments live together here instead of competing for top-level navigation.</p>
      </header>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {loading && <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 text-blue-400 animate-spin" /></div>}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {modules.map((module) => (
            <Link key={module.href} href={module.href} className="group block rounded-[22px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">
              <GlassCard padding="lg" hover className="h-full group-hover:border-blue-500/25 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-5">{module.icon}</div>
                <h2 className="text-lg font-semibold text-white">{module.title}</h2>
                <p className="text-sm leading-relaxed text-[var(--theme-text-muted)] mt-1 min-h-10">{module.description}</p>
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
                  <div>
                    <p className="text-sm font-semibold text-white">{module.metric}</p>
                    <p className={`text-xs leading-relaxed mt-1 ${module.attention > 0 ? 'text-amber-300' : 'text-[var(--theme-text-muted)]'}`}>{module.status}</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--theme-primary)]">
                    Open {module.title} <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
