export interface RhythmTask {
  id: string;
  title: string;
  category: string | null;
  preferred_time: string | null;
  task_schedules: {
    weekday: number;
    start_date?: string | null;
    end_date?: string | null;
  }[];
  scheduled_today: boolean;
  today_status: string;
  focus_minutes: number;
}
export interface RitualRef {
  type: 'task' | 'assignment' | 'goal';
  id: string;
}
export interface DailyRitual {
  day: string;
  top_three: RitualRef[];
  deferred: RitualRef[];
  deferred_to: string | null;
  capacity_minutes: number;
  wins: string;
  reflection: string;
  weekly_reflection: string;
  next_focus: string[];
  morning_at: string | null;
  evening_at: string | null;
  review_at: string | null;
  revision: number;
}
export interface Timebox {
  id: string;
  task_id: string;
  occurrence_day: string;
  starts_at: string;
  ends_at: string;
  task_title?: string;
}
export interface FocusSession {
  id: string;
  task_id: string;
  planned_minutes: number;
  elapsed_seconds: number;
  status: 'running' | 'paused' | 'completed' | 'cancelled';
  started_at: string;
  resumed_at: string | null;
  completed_at: string | null;
  as_of?: string;
}
export interface CalendarEvent {
  id: string;
  type: 'task' | 'assignment' | 'milestone' | 'bill' | 'reminder';
  title: string;
  day: string;
  starts_at: string | null;
  ends_at: string | null;
  href: string;
  completed: boolean;
  task_id?: string;
  box_id?: string;
}
export interface TodayData {
  timezone: string;
  day: string;
  asOf: string;
  tasks: RhythmTask[];
  goals: any[];
  assignments: any[];
  wealth: any;
  history: any[];
  reminders: any[];
  boxes: Timebox[];
  ritual: DailyRitual | null;
  weekRitual: DailyRitual | null;
  focus: FocusSession | null;
  focusMinutes: number;
  workload: import('./assignments').AcademicWorkload;
  weekly: {
    completed: number;
    focusedMinutes: number;
    areas: { label: string; count: number }[];
  };
  priorities?: {
    type: string;
    id: string;
    title: string;
    completed: boolean;
  }[];
  capacity: { planned: number; available: number; overloaded: boolean };
}
