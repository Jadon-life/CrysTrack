export type DecimalMoney = string;
export interface WealthAccount {
  id: string;
  user_id: string;
  name: string;
  kind: "cash" | "bank" | "savings" | "usd_wallet";
  opening_balance: DecimalMoney;
  created_at: string;
}
export interface LedgerEntry {
  id: string;
  user_id: string;
  type: string;
  flow_kind: string;
  amount: DecimalMoney;
  date: string;
  source: string | null;
  category: string | null;
  note: string | null;
  target_id: string | null;
  account_id: string | null;
  destination_account_id: string | null;
  parent_entry_id: string | null;
  import_key: string | null;
  deleted_at: string | null;
  revision: number;
  savings_bps?: number;
  bill_id?: string | null;
  bill_due_on?: string | null;
  debt_id?: string | null;
  expected_flow_id?: string | null;
  created_at: string;
}
export interface BudgetCap {
  id: string;
  user_id: string;
  month: string;
  category: string;
  cap: DecimalMoney;
}
export interface RecurringBill {
  id: string;
  user_id: string;
  title: string;
  amount: DecimalMoney;
  next_due: string;
  frequency: "weekly" | "monthly" | "quarterly" | "yearly";
  category: string;
  active: boolean;
  last_paid_on: string | null;
  created_at: string;
}
export interface SavingsCircle {
  id: string;
  user_id: string;
  title: string;
  contribution: DecimalMoney;
  starts_on: string;
  interval_days: number;
  members: string[];
  created_at: string;
}
export interface CircleContribution {
  id: string;
  user_id: string;
  circle_id: string;
  member_index: number;
  round: number;
  amount: DecimalMoney;
  paid_on: string;
}
export interface WealthSettings {
  user_id: string;
  spend_save_bps: number;
  target_id: string | null;
  low_balance: DecimalMoney;
}
export interface FinanceTarget {
  id: string;
  title: string;
  target_amount: DecimalMoney;
  current_amount: DecimalMoney;
  deadline: string | null;
  description: string | null;
  locked_until: string | null;
  status: string;
}
export interface ForecastPoint {
  day: string;
  low: DecimalMoney;
  high: DecimalMoney;
  charges: string[];
}
export interface WealthSuite {
  accounts: WealthAccount[];
  caps: BudgetCap[];
  bills: RecurringBill[];
  circles: SavingsCircle[];
  contributions: CircleContribution[];
  settings: WealthSettings | null;
  timezone: string;
}
