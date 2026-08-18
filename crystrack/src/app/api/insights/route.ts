import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [tasksResult, goalsResult, assignmentsResult, financeResult] = await Promise.all([
    supabase.from('recurring_tasks').select('id').eq('user_id', user.id).is('archived_at', null),
    supabase
      .from('goals')
      .select('id, title, measurable, target_value, progress_value, goal_checkins(created_at)')
      .eq('user_id', user.id)
      .eq('status', 'active'),
    supabase
      .from('assignments')
      .select('id, title, deadline, status')
      .eq('user_id', user.id)
      .neq('status', 'completed'),
    supabase
      .from('money_entries')
      .select('type, amount, date')
      .eq('user_id', user.id)
      .gte('date', thirtyDaysAgo),
  ]);

  const firstError = tasksResult.error || goalsResult.error || assignmentsResult.error || financeResult.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  const taskIds = (tasksResult.data || []).map((task: any) => task.id);
  const taskResult = taskIds.length
    ? await supabase
        .from('task_occurrences')
        .select('id, status, completed_at')
        .in('task_id', taskIds)
        .eq('status', 'completed')
        .gte('completed_at', sevenDaysAgo)
    : { data: [], error: null };

  if (taskResult.error) return NextResponse.json({ error: taskResult.error.message }, { status: 500 });

  const taskCompletions = taskResult.data?.length || 0;
  const goals = goalsResult.data || [];
  const assignments = assignmentsResult.data || [];
  const entries = financeResult.data || [];
  const now = Date.now();

  const overdue = assignments.filter((assignment: any) => new Date(assignment.deadline).getTime() < now).length;
  const dueSoon = assignments.filter((assignment: any) => {
    const diff = new Date(assignment.deadline).getTime() - now;
    return diff >= 0 && diff <= 3 * 24 * 60 * 60 * 1000;
  }).length;
  const goalCheckinsThisWeek = goals.reduce((count: number, goal: any) => (
    count + (goal.goal_checkins || []).filter((checkin: any) => checkin.created_at >= sevenDaysAgo).length
  ), 0);

  const totals = entries.reduce(
    (acc: { income: number; expense: number; saving: number }, entry: any) => {
      const amount = Number(entry.amount) || 0;
      if (entry.type === 'income') acc.income += amount;
      if (entry.type === 'expense') acc.expense += amount;
      if (entry.type === 'saving') acc.saving += amount;
      return acc;
    },
    { income: 0, expense: 0, saving: 0 },
  );

  const recommendations: string[] = [];
  if (overdue > 0) recommendations.push(`Resolve ${overdue} overdue assignment${overdue === 1 ? '' : 's'} before taking on new deadlines.`);
  if (dueSoon > 0) recommendations.push(`Protect time for ${dueSoon} assignment${dueSoon === 1 ? '' : 's'} due within three days.`);
  if (goals.length > 0 && goalCheckinsThisWeek < goals.length) recommendations.push('Check in on active goals that have not been reviewed this week.');
  if (taskCompletions === 0) recommendations.push('Complete one scheduled routine today to establish a measurable baseline.');
  if (totals.expense > totals.income && totals.income > 0) recommendations.push('Thirty-day expenses are above recorded income; review recent spending entries.');
  if (recommendations.length === 0) recommendations.push('Keep the current rhythm and review this page weekly for changes in workload and progress.');

  const riskLevel = overdue > 0 ? 'high' : dueSoon >= 3 ? 'medium' : 'low';
  const insights = [
    {
      id: 'weekly-summary',
      type: 'summary',
      title: 'Weekly Progress',
      summary: `${taskCompletions} routine completion${taskCompletions === 1 ? '' : 's'} and ${goalCheckinsThisWeek} goal check-in${goalCheckinsThisWeek === 1 ? '' : 's'} recorded in the last 7 days. ${assignments.length} active assignment${assignments.length === 1 ? '' : 's'} remain.`,
      riskLevel,
      recommendations,
      generatedAt: new Date().toISOString(),
    },
    {
      id: 'money-summary',
      type: 'finance',
      title: '30-Day Money Snapshot',
      summary: `Recorded income: $${totals.income.toFixed(2)} · expenses: $${totals.expense.toFixed(2)} · savings: $${totals.saving.toFixed(2)}.`,
      riskLevel: totals.expense > totals.income && totals.income > 0 ? 'medium' : 'low',
      recommendations: totals.saving > 0
        ? ['Review whether recorded savings are linked to active targets so target progress stays accurate.']
        : ['Add savings entries when money is set aside so progress is reflected in CrysTrack.'],
      generatedAt: new Date().toISOString(),
    },
  ];

  return NextResponse.json(insights);
}
