import { analyzeWithGroq, type GoalAnalysis } from '@/lib/ai/groq';

function daysBetween(from: Date, to: Date) {
  return Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function numericProgress(goal: any) {
  const current = Number(goal.progress_value);
  const target = Number(goal.target_value);
  const start = goal.starting_value == null ? 0 : Number(goal.starting_value);
  if (!Number.isFinite(current) || !Number.isFinite(target) || target === start) return null;
  const progress = ((current - start) / (target - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(progress * 10) / 10));
}

export function deterministicGoalContext(goal: any, checkins: any[]) {
  const now = new Date();
  const deadline = goal.deadline ? new Date(goal.deadline) : null;
  const numericPercent = goal.progress_mode === 'percentage' || goal.measurable ? numericProgress(goal) : null;
  const ageDays = Math.max(0, daysBetween(new Date(goal.created_at || now), now));
  const remainingDays = deadline && !Number.isNaN(deadline.getTime()) ? daysBetween(now, deadline) : null;
  const totalDays = deadline && !Number.isNaN(deadline.getTime()) ? Math.max(1, daysBetween(new Date(goal.created_at || now), deadline)) : null;
  const timeElapsedPercent = totalDays ? Math.max(0, Math.min(100, Math.round((ageDays / totalDays) * 1000) / 10)) : null;

  return {
    progress_mode: goal.progress_mode || (goal.measurable ? 'percentage' : 'ai'),
    numeric: numericPercent == null ? null : {
      starting_value: goal.starting_value == null ? 0 : Number(goal.starting_value),
      current_value: Number(goal.progress_value || 0),
      target_value: Number(goal.target_value || 0),
      unit: goal.progress_unit || null,
      progress_percent: numericPercent,
    },
    timeline: {
      created_at: goal.created_at || null,
      deadline: goal.deadline || null,
      days_elapsed: ageDays,
      days_remaining: remainingDays,
      time_elapsed_percent: timeElapsedPercent,
    },
    checkin_count: checkins.length,
  };
}

export async function analyzeGoal(goal: any, checkins: any[]): Promise<GoalAnalysis | null> {
  const recent = [...checkins]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 12)
    .map((checkin) => ({
      created_at: checkin.created_at,
      response_text: checkin.response_text,
      learned_text: checkin.learned_text,
      blockers: checkin.blockers,
      duration_minutes: checkin.duration_minutes,
      progress_percent: checkin.progress_percent,
      progress_value: checkin.progress_value,
    }));

  return analyzeWithGroq({
    goal: {
      title: goal.title,
      description: goal.description,
      category: goal.category,
      deadline: goal.deadline,
      progress_mode: goal.progress_mode,
      ai_coaching: goal.ai_coaching,
    },
    deterministic_context: deterministicGoalContext(goal, recent),
    recent_checkins: recent,
  });
}
