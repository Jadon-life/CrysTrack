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
    observations: {
      type: 'array',
      items: { type: 'string' },
    },
    actions: {
      type: 'array',
      items: { type: 'string' },
    },
    risk_level: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
    },
    confidence: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
    },
  },
  required: [
    'headline',
    'summary',
    'observations',
    'actions',
    'risk_level',
    'confidence',
  ],
  additionalProperties: false,
};

const OPENROUTER_ENDPOINT =
  'https://openrouter.ai/api/v1/chat/completions';

const DEFAULT_CHAT_MODEL =
  'google/gemma-4-26b-a4b-it:free';

const DEFAULT_ANALYSIS_MODEL =
  'nvidia/nemotron-3-super-120b-a12b:free';

const CHAT_FALLBACKS = [
  'openai/gpt-oss-20b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
];

const ANALYSIS_FALLBACKS = [
  'openai/gpt-oss-20b:free',
];

type OpenRouterResponse = {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function timeoutSignal(milliseconds: number) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    milliseconds,
  );

  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

function uniqueModels(
  primary: string,
  fallbacks: string[],
) {
  return Array.from(
    new Set([primary, ...fallbacks]),
  );
}

export function intelligenceChatModel() {
  return (
    process.env.OPENROUTER_CHAT_MODEL ||
    DEFAULT_CHAT_MODEL
  );
}

export function intelligenceAnalysisModel() {
  return (
    process.env.OPENROUTER_ANALYSIS_MODEL ||
    DEFAULT_ANALYSIS_MODEL
  );
}

function chatModels() {
  return uniqueModels(
    intelligenceChatModel(),
    CHAT_FALLBACKS,
  );
}

function analysisModels() {
  return uniqueModels(
    intelligenceAnalysisModel(),
    ANALYSIS_FALLBACKS,
  );
}

async function openRouterRequest(
  body: Record<string, unknown>,
  timeoutMs = 18000,
): Promise<OpenRouterResponse | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return null;
  }

  const timeout = timeoutSignal(timeoutMs);

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'CrysTrack',
    };

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.trim();

    if (appUrl) {
      headers['HTTP-Referer'] = appUrl;
    }

    const response = await fetch(
      OPENROUTER_ENDPOINT,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: timeout.signal,
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      const text = await response
        .text()
        .catch(() => '');

      const error = Object.assign(
        new Error(
          `OpenRouter request failed (${response.status})${
            text
              ? `: ${text.slice(0, 180)}`
              : ''
          }`,
        ),
        {
          status: response.status,
        },
      );

      throw error;
    }

    return (await response.json()) as OpenRouterResponse;
  } finally {
    timeout.cancel();
  }
}

function assistantContent(
  data: OpenRouterResponse | null,
) {
  return String(
    data?.choices?.[0]?.message?.content || '',
  ).trim();
}

function parseDomainInsight(
  content: string,
): DomainInsight {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return DomainInsightSchema.parse(
      JSON.parse(cleaned),
    );
  } catch (firstError) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');

    if (
      start === -1 ||
      end === -1 ||
      end <= start
    ) {
      throw firstError;
    }

    return DomainInsightSchema.parse(
      JSON.parse(
        cleaned.slice(start, end + 1),
      ),
    );
  }
}

export async function analyzeDomainWithOpenRouter(
  domain: string,
  context: unknown,
): Promise<DomainInsight | null> {
  if (!process.env.OPENROUTER_API_KEY) {
    return null;
  }

  const system = `You are CrysTrack Intelligence, a private productivity and personal-finance analysis layer.

Analyze the supplied ${domain} data and surface only meaningful observations that can improve the user's decisions.

Rules:
- Use only supplied CrysTrack facts. Never invent activity, amounts, dates, progress, missed work or causes.
- Deterministic calculations supplied by CrysTrack are authoritative.
- A missed scheduled goal check-in means no progress evidence was recorded for that CrysTrack occurrence; do not claim the user literally did nothing outside the app.
- Be specific when evidence supports specificity; otherwise say evidence is insufficient.
- Prefer patterns, changes, trade-offs and concrete next actions over generic encouragement.
- For Wealth, distinguish actual confirmed cash movements from forecasts and respect the supplied accounting definitions.
- Do not diagnose health conditions or prescribe unsafe medical, dietary, exercise, drug or supplement actions.
- Do not expose or infer identity. The context intentionally excludes credentials and direct identity fields.
- Keep observations concise.
- Return exactly one JSON object matching the required response schema.
- Do not wrap the JSON in Markdown or code fences.`;

  const data = await openRouterRequest(
    {
      models: analysisModels(),
      temperature: 0.2,
      max_tokens: 750,
      messages: [
        {
          role: 'system',
          content: system,
        },
        {
          role: 'user',
          content: JSON.stringify(context),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'crystrack_domain_insight',
          strict: true,
          schema: domainResponseSchema,
        },
      },
    },
    22000,
  );

  if (!data) {
    return null;
  }

  const content = assistantContent(data);

  if (!content) {
    throw new Error(
      'OpenRouter returned no domain insight',
    );
  }

  return parseDomainInsight(content);
}

export async function chatWithOpenRouter(input: {
  context: unknown;
  history: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  message: string;
}) {
  if (!process.env.OPENROUTER_API_KEY) {
    return null;
  }

  const system = `You are CrysTrack AI, the user's read-only intelligence assistant for their CrysTrack activity.

You can analyze Tasks, Goals, Assignments, Wealth and cross-domain patterns using only the supplied CrysTrack context.

Hard rules:
- READ ONLY. Never claim you created, edited, deleted, completed, paid, transferred, scheduled or otherwise changed anything in CrysTrack.
- If the user asks you to change data, explain that this AI chat is read-only and give concise steps they can take in the relevant CrysTrack area.
- Never invent data. If the supplied context cannot answer something, say what is missing.
- CrysTrack deterministic figures and accounting calculations are authoritative.
- A missed scheduled goal check-in counts as no recorded evidence for that occurrence, not proof of what happened outside CrysTrack.
- Treat Wealth as personal decision support, not professional financial, legal or tax advice.
- Do not expose or infer identity, credentials, account numbers, API keys or secrets.
- Do not diagnose medical conditions or prescribe unsafe health actions.
- Prefer concise, evidence-led answers with dates and numbers when those facts are present.

Formatting rules:
- Never use Markdown headings.
- Never use #, ## or ###.
- Never use **bold formatting**.
- Never output HTML tags such as <br>.
- Never output Markdown links.
- Never use Markdown tables.
- Never use pipe symbols for formatting.
- Use simple section titles.
- Use bullet points with • when a list helps.
- Use short readable paragraphs.
- Keep the response clean and suitable for a premium productivity application.`;

  const history = input.history
    .slice(-12)
    .map((item) => ({
      role: item.role,
      content: item.content.slice(
        0,
        4000,
      ),
    }));

  const contextMessage =
    `Current CrysTrack context:\n${JSON.stringify(
      input.context,
    )}`;

  const data = await openRouterRequest(
    {
      models: chatModels(),
      temperature: 0.4,
      max_tokens: 1100,
      messages: [
        {
          role: 'system',
          content: system,
        },
        {
          role: 'system',
          content: contextMessage,
        },
        ...history,
        {
          role: 'user',
          content: input.message,
        },
      ],
    },
    24000,
  );

  if (!data) {
    return null;
  }

  const content = assistantContent(data);

  if (!content) {
    throw new Error(
      'OpenRouter returned no chat response',
    );
  }

  return content.slice(0, 12000);
}
