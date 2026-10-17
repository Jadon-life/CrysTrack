import { readLedger } from '@/lib/finance/data';
import { periodTotals } from '@/lib/finance/logic';
import { formatMinor } from '@/lib/money';
import { savedTimezone } from '@/lib/goals/service';
import { dateKeyForInstant } from '@/lib/reminders';
import { financeError } from '@/lib/finance/server';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
 try {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const timezone=await savedTimezone(supabase,user.id);

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
      .neq('status', 'completed')
      .neq('status', 'dropped'),
    readLedger(supabase,user.id).then(data=>({data,error:null})),
  ]);

  const firstError = tasksResult.error || goalsResult.error || assignmentsResult.error || financeResult.error;
  if (firstError) return financeError(firstError);

  const taskIds = (tasksResult.data || []).map((task: any) => task.id);
  const taskResult = taskIds.length
    ? await supabase
        .from('task_occurrences')
        .select('id, status, completed_at')
        .in('task_id', taskIds)
        .eq('status', 'completed')
        .gte('completed_at', sevenDaysAgo)
    : { data: [], error: null };

  if (taskResult.error) return financeError(taskResult.error);

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

  const totals=periodTotals(entries,dateKeyForInstant(new Date(),timezone),timezone);

  const recommendations: string[] = [];
  if (overdue > 0) recommendations.push(`Ready to pick up ${overdue} earlier assignment${overdue === 1 ? '' : 's'}? Choose one small next step.`);
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
      summary: `Recorded income: ${formatMinor(totals.income)} · expenses: ${formatMinor(totals.expense)} · savings: ${formatMinor(totals.saving)}.`,
      riskLevel: totals.expense > totals.income && totals.income > 0 ? 'medium' : 'low',
      recommendations: totals.saving > 0
        ? ['Review whether recorded savings are linked to active targets so target progress stays accurate.']
        : ['Add savings entries when money is set aside so progress is reflected in CrysTrack.'],
      generatedAt: new Date().toISOString(),
    },
  ];

  return NextResponse.json(insights);
 }catch(error){return financeError(error);}
}
