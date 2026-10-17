import type { CoachTool, CardState } from "@/lib/coach-preview/contracts";
export interface PreviewCoachAction {
  id: string;
  user_id: string;
  tool: CoachTool;
  status: "approved" | "dismissed";
  result: Record<string, unknown>;
  created_at: string;
}
export interface ProposalCard {
  token: string;
  tool: CoachTool;
  state: CardState;
  error?: string;
}
