import { z } from 'zod';

const WealthInsightSchema = z.object({
  headline: z.string().min(1).max(160),
  summary: z.string().min(1).max(700),
  observation: z.string().min(1).max(500),
  next_action: z.string().min(1).max(500),
  confidence: z.enum(['low', 'medium', 'high']),
});

export type WealthInsight = z.infer<typeof WealthInsightSchema>;

const schema = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    summary: { type: 'string' },
    observation: { type: 'string' },
    next_action: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['headline', 'summary', 'observation', 'next_action', 'confidence'],
  additionalProperties: false,
};

export async function analyzeWealthMetricsWithGroq(metrics: unknown): Promise<WealthInsight | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const system = `You are CrysTrack's private personal money-pattern analyst.

You receive ONLY sanitized aggregate metrics calculated by CrysTrack. You do not receive names, merchant descriptions, exact balances, exact salaries, exact transaction amounts, debt counterparties, notes or email addresses.

Rules:
- Never invent currency amounts or transaction details.
- Do not claim to know information that is not present in the metrics.
- Focus on spending pattern, cashflow direction, savings consistency and unusual category movement.
- If data_months is below 2, say there is insufficient history for strong pattern claims.
- Do not give regulated investment, tax, lending or legal advice.
- Keep the tone practical and concise, not generic or motivational.
- next_action should be a simple behaviour or review action derived from the supplied pattern.
- Numeric metrics supplied by CrysTrack are authoritative.`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(metrics) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'crystrack_wealth_insight',
          strict: true,
          schema,
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Wealth AI request failed (${response.status})${body ? `: ${body.slice(0, 180)}` : ''}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Wealth AI returned no analysis');
  return WealthInsightSchema.parse(JSON.parse(content));
}
