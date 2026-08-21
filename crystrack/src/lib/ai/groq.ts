import { z } from 'zod';

const GoalAnalysisSchema = z.object({
  goal_domain: z.enum(['learning', 'fitness', 'habit', 'project', 'career', 'creative', 'personal', 'other']),
  status: z.enum(['strong_progress', 'on_track', 'needs_attention', 'at_risk', 'stalled', 'insufficient_evidence']),
  summary: z.string().min(1).max(1200),
  evidence: z.array(z.string().max(500)).max(8),
  risks: z.array(z.string().max(500)).max(8),
  next_action: z.string().min(1).max(800),
  confidence: z.enum(['low', 'medium', 'high']),
  safety_note: z.string().max(800),
});

export type GoalAnalysis = z.infer<typeof GoalAnalysisSchema>;

const responseSchema = {
  type: 'object',
  properties: {
    goal_domain: { type: 'string', enum: ['learning', 'fitness', 'habit', 'project', 'career', 'creative', 'personal', 'other'] },
    status: { type: 'string', enum: ['strong_progress', 'on_track', 'needs_attention', 'at_risk', 'stalled', 'insufficient_evidence'] },
    summary: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    next_action: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    safety_note: { type: 'string' },
  },
  required: ['goal_domain', 'status', 'summary', 'evidence', 'risks', 'next_action', 'confidence', 'safety_note'],
  additionalProperties: false,
};

export async function analyzeWithGroq(input: unknown): Promise<GoalAnalysis | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const system = `You are CrysTrack's goal-progress analyst. Evaluate the user's evidence against the exact stated goal, deadline, prior check-ins and deterministic metrics supplied by CrysTrack.

Rules:
- Never invent measurements, activities, percentages or progress that are not present in the evidence.
- Numeric facts supplied by CrysTrack are authoritative; do not override them.
- AI-mode goals must not receive fake numerical precision. Use qualitative status instead.
- If evidence is too vague, choose insufficient_evidence and explain what useful evidence would look like.
- For fitness/body/weight/health-related goals, evaluate recorded progress conservatively. Do not diagnose medical conditions, prescribe extreme diets, unsafe exercise, drugs or supplements, or guarantee physical outcomes. If the target or pace may warrant professional guidance, state that gently in safety_note.
- Make next_action concrete but concise and proportional to the user's goal.
- Do not use generic encouragement when the evidence points to risk or stagnation.
- Treat check-in consistency as supporting evidence, not proof of outcome progress.`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      reasoning_effort: 'medium',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(input) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'crystrack_goal_analysis',
          strict: true,
          schema: responseSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Goal AI request failed (${response.status})${body ? `: ${body.slice(0, 220)}` : ''}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Goal AI returned no analysis');
  return GoalAnalysisSchema.parse(JSON.parse(content));
}
