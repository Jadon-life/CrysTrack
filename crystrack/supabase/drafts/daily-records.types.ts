/** LOCAL draft DTOs only; public Drizzle schema and app interfaces are unchanged. */
export interface DraftDailyRecord {
  user_id: string;
  day_key: string;
  timezone: string;
  policy_version: 1;
  evidence: 'verified' | 'incomplete';
  expected_count: number;
  close_status: 'open' | 'closed';
  closes_at: string;
  closed_at: string | null;
  revision: string; // bigint stays exact across JSON boundaries
}
export interface DraftDailyRoutine {
  user_id: string;
  day_key: string;
  routine_key: string;
  schedule_version: string;
  status: 'pending' | 'completed' | 'skipped' | 'missed';
  completed_at: string | null;
  revision: string;
}
export interface DraftDailyNote {
  user_id: string;
  day_key: string;
  body: string;
  revision: string;
  updated_at: string;
}
