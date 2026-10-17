export type RewardKind =
  | "task"
  | "goal"
  | "expense"
  | "morning"
  | "evening"
  | "weekly"
  | "assignment";
export interface RewardEvent {
  id: string;
  user_id: string;
  action_key: string;
  kind: RewardKind;
  source_id: string;
  day: string;
  area: string | null;
  active: boolean;
  created_at: string;
  on_time: boolean;
}
export interface StreakState {
  streak: number;
  longest: number;
  activeRun: number;
  longestActiveRun: number;
  freezes: number;
  earned: number;
  consumed: number;
  graceDays: number;
  lastActive: string | null;
  state: "new" | "active" | "gentle" | "protected" | "rest";
  message: string;
}
export interface Badge {
  id: string;
  name: string;
  description: string;
  group: "Life Areas" | "Wealth Milestones" | "Academic Consistency";
  icon: "spark" | "heart" | "book" | "coin" | "trophy" | "shield";
  current: number;
  target: number;
  unlocked: boolean;
}
export interface GamificationSnapshot {
  ready: boolean;
  hidden: boolean;
  xp: number;
  level: number;
  levelStart: number;
  nextLevel: number;
  progress: number;
  streak: StreakState;
  badges: Badge[];
  counts: Partial<Record<RewardKind, number>>;
  today: string;
}
