'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TodayView, type TodayViewItem } from '@/components/dashboard/today-view';
import { QuickStats } from '@/components/dashboard/quick-stats';
import { RightRail } from '@/components/dashboard/right-rail';
import { GlassCard } from '@/components/shared/glass-card';
import { Button } from '@/components/ui/button';
import { fetcher, post } from '@/lib/api';
import { getLocalDateKey } from '@/lib/utils';
import { Plus, CheckSquare, Target, ClipboardList, Wallet } from 'lucide-react';

const emptyStats = {
  tasksDue: 0,
  tasksCompleted: 0,
  activeGoals: 0,
  assignmentsDue: 0,
  assignmentsOverdue: 0,
  savingsProgress: 0,
};

export default function DashboardPage() {
  const router = useRouter();
  const [showTypeChooser, setShowTypeChooser] = useState(false);
  const [stats, setStats] = useState(emptyStats);
  const [activities, setActivities] = useState<any[]>([]);
  const [todayItems, setTodayItems] = useState<TodayViewItem[]>([]);
  const [railData, setRailData] = useState<{ goals: any[]; targets: any[]; insight?: any }>({ goals: [], targets: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [tasksData, goalsData, assignmentsData, financeData, historyData, insightsData] = await Promise.all([
        fetcher('/api/tasks'),
        fetcher('/api/goals'),
        fetcher('/api/assignments'),
        fetcher('/api/finance'),
        fetcher('/api/history'),
        fetcher('/api/insights'),
      ]);

      const scheduledTasks = tasksData.filter((task: any) => task.scheduled_today);
      const completedToday = scheduledTasks.filter((task: any) => task.today_status === 'completed').length;
      const overdueAssignments = assignmentsData.filter((assignment: any) => assignment.computed_status === 'overdue');
      const dueSoonAssignments = assignmentsData.filter((assignment: any) => ['due_today', 'due_soon'].includes(assignment.computed_status));
      const totalSaved = financeData.targets?.reduce((sum: number, target: any) => sum + Number(target.current_amount || 0), 0) || 0;
      const totalTarget = financeData.targets?.reduce((sum: number, target: any) => sum + Number(target.target_amount || 0), 0) || 0;

      setStats({
        tasksDue: scheduledTasks.length,
        tasksCompleted: completedToday,
        activeGoals: goalsData.length,
        assignmentsDue: dueSoonAssignments.length,
        assignmentsOverdue: overdueAssignments.length,
        savingsProgress: totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0,
      });

      const taskItems: TodayViewItem[] = scheduledTasks.map((task: any) => ({
        id: `task-${task.id}`,
        entityId: task.id,
        type: 'task',
        title: task.title,
        subtitle: task.description || task.category || 'Recurring task',
        status: task.today_status,
        time: task.preferred_time || undefined,
        completed: task.today_status === 'completed',
      }));

      const goalItems: TodayViewItem[] = goalsData
        .filter((goal: any) => !(goal.goal_checkins || []).some((checkin: any) => new Date(checkin.created_at).toDateString() === new Date().toDateString()))
        .slice(0, 3)
        .map((goal: any) => ({
          id: `goal-${goal.id}`,
          entityId: goal.id,
          type: 'goal',
          title: goal.title,
          subtitle: 'Goal check-in due',
          status: 'active',
          href: '/goals',
        }));

      const assignmentItems: TodayViewItem[] = assignmentsData
        .filter((assignment: any) => ['overdue', 'due_today', 'due_soon'].includes(assignment.computed_status))
        .slice(0, 4)
        .map((assignment: any) => ({
          id: `assignment-${assignment.id}`,
          entityId: assignment.id,
          type: 'assignment',
          title: assignment.title,
          subtitle: assignment.description || 'Deadline-driven assignment',
          status: assignment.computed_status,
          href: '/assignments',
        }));

      const statusWeight: Record<string, number> = { overdue: 0, due_today: 1, pending: 2, due_soon: 3, active: 4, completed: 5 };
      setTodayItems([...assignmentItems, ...taskItems, ...goalItems].sort((a, b) => (statusWeight[a.status] ?? 9) - (statusWeight[b.status] ?? 9)));
      setActivities((historyData || []).slice(0, 5));
      setRailData({ goals: goalsData || [], targets: financeData.targets || [], insight: insightsData?.[0] });
    } catch (e: any) {
      setError(e.message || 'Could not load your dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleTask = async (taskId: string) => {
    setError('');
    try {
      await post(`/api/tasks/${taskId}/occurrences/${getLocalDateKey()}/toggle`, {});
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Could not update the task');
    }
  };

  const typeOptions = [
    { label: 'Regular Task', icon: <CheckSquare className="w-5 h-5" />, href: '/tasks' },
    { label: 'Goal', icon: <Target className="w-5 h-5" />, href: '/goals' },
    { label: 'Assignment', icon: <ClipboardList className="w-5 h-5" />, href: '/assignments' },
    { label: 'Financial Target', icon: <Wallet className="w-5 h-5" />, href: '/finance' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">Today</p>
          <h1 className="text-2xl font-bold text-white mt-1">Your command centre</h1>
          <p className="text-sm text-slate-400 mt-1">See what needs attention, act on it, and keep moving.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowTypeChooser(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          New
        </Button>
      </div>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      <QuickStats stats={stats} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <GlassCard padding="lg">
            <TodayView items={todayItems} loading={loading} onToggleTask={toggleTask} />
          </GlassCard>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-white">Recent activity</h2>
              <button onClick={() => router.push('/history')} className="text-xs font-medium text-blue-400 hover:text-blue-300">View history</button>
            </div>
            <div className="space-y-2">
              {activities.length === 0 && !loading && (
                <GlassCard padding="md"><p className="text-sm text-slate-500">Activity appears here as you complete routines, check in on goals, finish assignments, and add money entries.</p></GlassCard>
              )}
              {activities.map((activity: any, i: number) => (
                <GlassCard key={activity.id || i} padding="sm" className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{activity.metadata_json?.title || activity.type?.replaceAll('_', ' ') || 'Activity'}</p>
                    <p className="text-xs text-slate-500 capitalize">{activity.entity_type}</p>
                  </div>
                  <span className="text-xs text-slate-500 shrink-0">{new Date(activity.created_at).toLocaleDateString()}</span>
                </GlassCard>
              ))}
            </div>
          </div>
        </div>

        <div className="xl:col-span-1">
          <div className="sticky top-6"><RightRail goals={railData.goals} targets={railData.targets} insight={railData.insight} /></div>
        </div>
      </div>

      {showTypeChooser && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowTypeChooser(false)} />
          <GlassCard padding="lg" className="relative w-full max-w-sm">
            <h2 className="text-lg font-semibold text-white mb-1">Create something</h2>
            <p className="text-xs text-slate-500 mb-4">Choose the kind of item you want to add.</p>
            <div className="space-y-2">
              {typeOptions.map((option) => (
                <button
                  key={option.label}
                  onClick={() => { setShowTypeChooser(false); router.push(option.href); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.035] hover:bg-white/[0.07] border border-white/10 hover:border-white/20 transition-all text-left"
                >
                  <span className="text-blue-400">{option.icon}</span>
                  <span className="text-sm font-medium text-white">{option.label}</span>
                </button>
              ))}
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
