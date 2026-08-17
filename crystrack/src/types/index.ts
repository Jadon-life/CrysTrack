export interface User {
  id: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  timezone: string;
}

export interface ThemeState {
  timeOfDay: 'morning' | 'afternoon' | 'golden' | 'sunset' | 'dusk' | 'night';
  weather: 'clear' | 'rain' | 'cloudy' | 'sunny';
  isTransitioning: boolean;
}

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
}

export interface DashboardStats {
  tasksDue: number;
  tasksCompleted: number;
  activeGoals: number;
  assignmentsDue: number;
  assignmentsOverdue: number;
  savingsProgress: number;
}

export interface TodayItem {
  id: string;
  type: 'task' | 'goal' | 'assignment';
  title: string;
  subtitle?: string;
  status: string;
  priority?: string;
  time?: string;
  completed: boolean;
}

export interface TaskWithSchedule {
  id: string;
  title: string;
  description?: string;
  active: boolean;
  preferredTime?: string;
  category?: string;
  schedules: number[]; // weekdays
  streak: number;
  bestStreak: number;
  todayStatus: 'pending' | 'completed' | 'missed' | 'not_scheduled';
}

export interface GoalWithProgress {
  id: string;
  title: string;
  description?: string;
  deadline?: string;
  measurable: boolean;
  targetValue?: number;
  progressValue?: number;
  progressPercent?: number;
  status: string;
  category?: string;
  checkInDue: boolean;
  lastCheckIn?: string;
}

export interface AssignmentWithUrgency {
  id: string;
  title: string;
  description?: string;
  deadline: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'upcoming' | 'due_soon' | 'due_today' | 'overdue' | 'completed';
  category?: string;
  daysUntil: number;
}

export interface FinanceTargetWithProgress {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  remaining: number;
  percentComplete: number;
  deadline?: string;
  description?: string;
}

export interface MoneyEntry {
  id: string;
  type: 'income' | 'expense' | 'saving' | 'transfer';
  amount: number;
  date: string;
  source?: string;
  category?: string;
  note?: string;
}

export interface HistoryItem {
  id: string;
  type: 'task' | 'goal' | 'assignment' | 'finance';
  title: string;
  date: string;
  status: string;
  metadata?: Record<string, unknown>;
}

export interface AIInsight {
  id: string;
  type: 'goal' | 'task' | 'assignment' | 'finance';
  title: string;
  summary: string;
  riskLevel?: string;
  recommendations: string[];
  generatedAt: string;
}
