import { z } from 'zod';

export const AI_PRIVACY_POLICY = '2026-10-24-openai-direct-v2';
export const aiDomainSchema = z.enum(['tasks', 'goals', 'assignments', 'wealth', 'overview']);
export const aiRequestDomainSchema = z.enum([
  'chat',
  'conversation',
  'tasks',
  'goals',
  'assignments',
  'wealth',
  'overview',
  'goal',
  'wealth_legacy',
]);
export type AiRequestDomain = z.infer<typeof aiRequestDomainSchema>;
export const aiPrivacySchema = z
  .object({
    enabled: z.boolean(),
    wealthEnabled: z.boolean(),
    revision: z.number().int().nonnegative(),
    policy: z.literal(AI_PRIVACY_POLICY),
    acceptedPolicy: z.string().nullable(),
    acceptedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .refine(
    (p) =>
      (!p.wealthEnabled || p.enabled) &&
      (!p.enabled || (p.acceptedPolicy === AI_PRIVACY_POLICY && !!p.acceptedAt)),
  );
export type AiPrivacy = z.infer<typeof aiPrivacySchema>;
export const privacyChangeSchema = z
  .object({
    enabled: z.boolean(),
    wealthEnabled: z.boolean(),
    expectedRevision: z.number().int().nonnegative(),
    requestId: z.string().uuid(),
    policy: z.literal(AI_PRIVACY_POLICY),
  })
  .strict()
  .refine((p) => !p.wealthEnabled || p.enabled);
export const privacyClearSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    requestId: z.string().uuid(),
    confirm: z.literal('DELETE_LOCAL_AI'),
  })
  .strict();
export const chatRequestSchema = z
  .object({
    message: z.string().trim().min(1).max(4000),
    conversationId: z.string().uuid().nullable().optional(),
  })
  .strict();
export const aiLeaseSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    wealthEnabled: z.boolean(),
    domain: aiRequestDomainSchema,
  })
  .strict();

/** Automatic context is separately allowlisted. This is only an extra guard for explicitly typed chat. */
export function safeChatText(text: string) {
  if (
    /[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|\b(?:sk-[\w-]{12,}|gh[pousr]_[\w]+|github_pat_[\w]+|eyJ[\w-]{15,}\.)|\bBearer\s+\S+|\b\d[\d ()+.-]{8,}\d\b|-----BEGIN.*PRIVATE KEY|\b(?:latitude|longitude|password|api[_ -]?key)\s*[:=]/i.test(
      text,
    )
  ) {
    throw new Error('AI_SENSITIVE_MESSAGE');
  }
  return text;
}
