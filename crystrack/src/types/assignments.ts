export type AssignmentPriority = 'low' | 'medium' | 'high' | 'urgent';
export type AssignmentStatus =
  'upcoming' | 'due_soon' | 'due_today' | 'overdue' | 'completed' | 'dropped';
export type AcademicKind = 'Assignment' | 'Test' | 'Lab' | 'Project';
export interface AssignmentSubtask {
  id: string;
  title: string;
  completed: boolean;
}
export interface AcademicAssignment {
  id: string;
  title: string;
  description: string | null;
  deadline: string;
  priority: AssignmentPriority;
  status: AssignmentStatus;
  category: string | null;
  course_code: string | null;
  academic_kind: AcademicKind;
  point_weight: string | null;
  estimated_minutes: number | null;
  work_start_at: string | null;
  subtasks: AssignmentSubtask[];
  revision: number;
  finished_late: boolean;
  completed_at: string | null;
  created_at: string;
  reminder_config: {
    enabled: boolean;
    channels: ('push' | 'telegram')[];
    offsetMinutes: number[];
  } | null;
  computed_status: AssignmentStatus;
  completion_label: string | null;
  days_until: number;
  timezone: string;
}
export interface AcademicWorkload {
  days: { day: string; minutes: number; count: number; unestimated: number }[];
  count: number;
  minutes: number;
  unestimated: number;
  overdueCount: number;
  warning: boolean;
  weeklyLimitMinutes: number;
  dailyLimitMinutes: number;
}
