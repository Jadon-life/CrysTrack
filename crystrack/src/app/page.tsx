'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TodayView } from '@/components/dashboard/today-view';
import { QuickStats } from '@/components/dashboard/quick-stats';
import { RightRail } from '@/components/dashboard/right-rail';
import { GlassCard } from '@/components/shared/glass-card';
import { Button } from '@/components/ui/button';
import { CreateModal } from '@/components/shared/create-modal';
import { fetcher, post } from '@/lib/api';
import { Plus, CheckSquare, Target, ClipboardList, Wallet } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [showTypeChooser, setShowTypeChooser] = useState(false);
  const [stats, setStats] = useState({ tasksDue: 0, tasksCompleted: 0, activeGoals: 0, assignmentsDue: 0, assignmentsOverdue: 0, savingsProgress: 0 });
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [tasksData, goalsData, assignmentsData, financeData, historyData] = await Promise.all([
          fetcher('/api/tasks').catch(() => []),
          fetcher('/api/goals').catch(() => []),
          fetcher('/api/assignments').catch(() => []),
          fetcher('/api/finance').catch(() => ({ targets: [], entries: [] })),
          fetcher('/api/history').catch(() => []),
        ]);

        const today = new Date().toISOString().split('T')[0];
        const tasksDueToday = tasksData.filter((t: any) => t.schedules?.some((s: any) => s.weekday === new Date().getDay()));
        const completedToday = tasksDueToday.filter((t: any) => t.todayStatus === 'completed').length;
        const overdueAssignments = assignmentsData.filter((a: any) => a.computed_status === 'overdue').length;
        const dueSoon = assignmentsData.filter((a: any) => a.computed_status === 'due_today' || a.computed_status === 'due_soon').length;
        const totalSaved = financeData.targets?.reduce((sum: number, t: any) => sum + parseFloat(t.current_amount || 0), 0) || 0;
        const totalTarget = financeData.targets?.reduce((sum: number, t: any) => sum + parseFloat(t.target_amount || 0), 0) || 0;

        setStats({
          tasksDue: tasksDueToday.length,
          tasksCompleted: completedToday,
          activeGoals: goalsData.length,
          assignmentsDue: dueSoon,
          assignmentsOverdue: overdueAssignments,
          savingsProgress: totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0,
        });

        setActivities(historyData.slice(0, 5));
      } catch (e) {
        console.error('Failed to load dashboard data', e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const typeOptions = [
    { label: 'Regular Task', icon: <CheckSquare className="w-5 h-5" />, href: '/tasks?create=task', color: 'text-blue-400' },
    { label: 'Goal', icon: <Target className="w-5 h-5" />, href: '/goals?create=goal', color: 'text-violet-400' },
    { label: 'Assignment', icon: <ClipboardList className="w-5 h-5" />, href: '/assignments?create=assignment', color: 'text-amber-400' },
    { label: 'Financial Target', icon: <Wallet className="w-5 h-5" />, href: '/finance?create=target', color: 'text-emerald-400' },
  ];

  return (
    <div className="space-y-6">
      <QuickStats stats={stats} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Today</h2>
            <Button variant="primary" size="sm" onClick={() => setShowTypeChooser(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              New
            </Button>
          </div>
          <GlassCard padding="lg">
            <TodayView />
          </GlassCard>

          <div className="mt-6">
            <h2 className="text-lg font-semibold text-white mb-3">Recent Activity</h2>
            <div className="space-y-2">
              {activities.length === 0 && !loading && (
                <p className="text-sm text-slate-500">No activity yet. Start by creating your first task!</p>
              )}
              {activities.map((activity: any, i: number) => (
                <GlassCard key={activity.id || i} padding="sm" hover className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      activity.entity_type === 'task' ? 'bg-blue-400' : 
                      activity.entity_type === 'goal' ? 'bg-violet-400' : 
                      activity.entity_type === 'assignment' ? 'bg-amber-400' : 'bg-emerald-400'
                    }`} />
                    <div>
                      <span className="text-sm text-white capitalize">{activity.type?.replace('_', ' ')} </span>
                      <span className="text-sm text-slate-300">{activity.metadata_json?.title || 'Activity'}</span>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">
                    {new Date(activity.created_at).toLocaleDateString()}
                  </span>
                </GlassCard>
              ))}
            </div>
          </div>
        </div>

        <div className="xl:col-span-1">
          <div className="sticky top-6">
            <RightRail />
          </div>
        </div>
      </div>

      {/* Type Chooser Modal */}
      {showTypeChooser && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowTypeChooser(false)} />
          <GlassCard padding="lg" className="relative w-full max-w-sm">
            <h2 className="text-lg font-semibold text-white mb-4">What would you like to create?</h2>
            <div className="space-y-2">
              {typeOptions.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => { setShowTypeChooser(false); router.push(opt.href); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all text-left"
                >
                  <span className={opt.color}>{opt.icon}</span>
                  <span className="text-sm font-medium text-white">{opt.label}</span>
                </button>
              ))}
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
