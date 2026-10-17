export interface GoalMilestone {
  id: string;
  title: string;
  dueDate: string | null;
  completedAt: string | null;
}
export type GoalLifecycle = 'active' | 'achieved' | 'paused' | 'let_go';
export type GoalProgressSource = 'manual' | 'milestones' | 'tasks';
export interface GoalPlan {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: GoalLifecycle | 'completed' | 'abandoned';
  deadline: string | null;
  created_at: string;
  why_matters: string | null;
  badge: string;
  reflection: string | null;
  milestones: GoalMilestone[];
  task_ids: string[];
  linked_at: string;
  routine_target: number;
  finance_target_id: string | null;
  revision: number;
  progress_source: GoalProgressSource;
  starting_value: string | null;
  target_value: string | null;
  progress_value: string | null;
  progress_unit: string | null;
  progress_mode: string;
  measurable: boolean;
  ai_coaching: boolean;
  checkin_config: {
    frequency: string;
    days: number[];
    time: string;
    channels: string[];
  };
  deadline_reminder_config: {
    enabled: boolean;
    offsetMinutes: number[];
    channels: string[];
  };
  goal_checkins: {
    created_at: string;
    progress_percent: number | null;
    occurrence_key: string;
    ai_analysis?: { summary: string };
  }[];
  checkin_state: { due: boolean; available: boolean; completed: boolean };
  effort_percent: number | null;
  completed_tasks: number;
  pacing: string;
  timezone: string;
  finance_target: {
    id: string;
    title: string;
    current_amount: string;
    target_amount: string;
  } | null;
}
