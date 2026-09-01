import { z } from 'zod';

export const DomainInsightSchema = z.object({
  headline: z.string().min(1).max(180),
  summary: z.string().min(1).max(1500),
  observations: z.array(z.string().min(1).max(420)).max(5),
  actions: z.array(z.string().min(1).max(420)).max(4),
  risk_level: z.enum(['low', 'medium', 'high']),
  confidence: z.enum(['low', 'medium', 'high']),
});

export type DomainInsight = z.infer<typeof DomainInsightSchema>;

const domainResponseSchema = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    summary: { type: 'string' },
    observations: { type: 'array', items: { type: 'string' } },
    actions: { type: 'array', items: { type: 'string' } },
    risk_level: { type: 'string', enum: ['low', 'medium', 'high'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['headline', 'summary', 'observations', 'actions', 'risk_level', 'confidence'],
  additionalProperties: false,
};

function timeoutSignal(milliseconds: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

async function groqRequest(body: Record<string, unknown>, timeoutMs = 18000) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const timeout = timeoutSignal(timeoutMs);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: timeout.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const error: any = new Error(`Groq request failed (${response.status})${text ? `: ${text.slice(0, 180)}` : ''}`);
      error.status = response.status;
      throw error;
    }

    return response.json();
  } finally {
    timeout.cancel();
  }
}

export function intelligenceModel() {
  return process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
}

export async function analyzeDomainWithGroq(domain: string, context: unknown): Promise<DomainInsight | null> {
  if (!process.env.GROQ_API_KEY) return null;

  const system = `You are CrysTrack Intelligence, a private productivity and personal-finance analysis layer.
Analyze the supplied ${domain} data and surface only meaningful observations that can improve the user's decisions.

Rules:
- Use only supplied CrysTrack facts. Never invent activity, amounts, dates, progress, missed work or causes.
- Deterministic calculations supplied by CrysTrack are authoritative.
- A missed scheduled goal check-in means no progress evidence was recorded for that CrysTrack occurrence; do not claim the user literally did nothing outside the app.
- Be specific when evidence supports specificity, otherwise say evidence is insufficient.
- Prefer patterns, changes, trade-offs and concrete next actions over generic encouragement.
- For Wealth, distinguish actual confirmed cash movements from forecasts and respect the supplied accounting definitions.
- Do not diagnose health conditions or prescribe unsafe medical, dietary, exercise, drug or supplement actions.
- Do not expose or infer identity. The context intentionally excludes credentials and direct identity fields.
- Keep observations concise. The user wants useful remarks, not noise.

Formatting rules:

Never use Markdown headings.
Never use #, ##, or ###.
Never use **bold formatting**.
Never output HTML tags like <br>.
Never output markdown links.
Never use markdown tables.
Never use pipe symbols for formatting.
Use bullet lists instead of tables.

Write responses like a premium productivity assistant.

Use simple section titles.
Use bullet points using •.
Use short readable paragraphs.`;

  const data = await groqRequest({
    model: intelligenceModel(),
    reasoning_effort: 'low',
    max_completion_tokens: 750,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(context) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'crystrack_domain_insight',
        strict: true,
        schema: domainResponseSchema,
      },
    },
  });

  if (!data) return null;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq returned no domain insight');
  return DomainInsightSchema.parse(JSON.parse(content));
}

export async function chatWithGroq(input: {
  context: unknown;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  message: string;
}) {
  if (!process.env.GROQ_API_KEY) return null;

  const system = `You are CrysTrack AI, the user's read-only intelligence assistant for their CrysTrack activity.
You can analyze Tasks, Goals, Assignments, Wealth and cross-domain patterns using only the supplied CrysTrack context.

Hard rules:
- READ ONLY. Never claim you created, edited, deleted, completed, paid, transferred, scheduled or otherwise changed anything in CrysTrack.
- If the user asks you to change data, explain that this AI chat is read-only and give concise steps they can take in the relevant CrysTrack area.
- Never invent data. If the supplied context cannot answer something, say what is missing.
- CrysTrack deterministic figures and accounting calculations are authoritative.
- A missed scheduled goal check-in counts as no recorded evidence for that occurrence, not proof of what happened outside CrysTrack.
- Treat Wealth as personal decision support, not professional financial, legal or tax advice. Be concrete but proportionate.
- Do not expose or infer identity, credentials, account numbers, API keys or secrets. Those are intentionally absent from the context.
- Do not diagnose medical conditions or prescribe unsafe health actions.
- Prefer concise, evidence-led answers with dates/numbers when those facts are present.`;

  const history = input.history.slice(-12).map((item) => ({ role: item.role, content: item.content.slice(0, 4000) }));
  const contextMessage = `Current CrysTrack context:\n${JSON.stringify(input.context)}`;

  const data = await groqRequest({
    model: intelligenceModel(),
    reasoning_effort: 'medium',
    max_completion_tokens: 1100,
    messages: [
      { role: 'system', content: system },
      { role: 'system', content: contextMessage },
      ...history,
      { role: 'user', content: input.message },
    ],
  }, 22000);

  if (!data) return null;
  const content = String(data.choices?.[0]?.message?.content || '').trim();
  if (!content) throw new Error('Groq returned no chat response');
  return content.slice(0, 12000);
}
