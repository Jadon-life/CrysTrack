import { NextResponse } from 'next/server';
import { z } from 'zod';
import { aiPrivacySchema, aiLeaseSchema, type AiRequestDomain } from './privacy';

export const aiHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};
export class AiPrivacyError extends Error {
  constructor(
    public code:
      | 'OFF'
      | 'WEALTH_OFF'
      | 'CHANGED'
      | 'UNAVAILABLE'
      | 'UNCONFIGURED'
      | 'RATE'
      | 'INPUT'
      | 'AUTH',
    public status = 503,
  ) {
    super(code);
  }
}
export function aiFailure(e: unknown) {
  const err =
    e instanceof AiPrivacyError
      ? e
      : e instanceof z.ZodError || e instanceof SyntaxError
        ? new AiPrivacyError('INPUT', 400)
        : new AiPrivacyError('UNAVAILABLE');
  const messages = {
    OFF: 'AI is off. Review AI & Privacy in Settings before enabling it.',
    WEALTH_OFF: 'Wealth sharing is off. Your Wealth data was not sent.',
    CHANGED: 'AI permission changed or the request expired. No new AI result was saved.',
    UNAVAILABLE: 'AI is temporarily unavailable. No new AI result is confirmed.',
    UNCONFIGURED: 'AI is not configured on this server. No external request was made.',
    RATE: 'CrysTrack AI is temporarily busy. Please try again later.',
    INPUT:
      'Review the request. Remove credentials, contact/account details and links before sending.',
    AUTH: 'Unauthorized',
  };
  // Never log prompts, upstream bodies, database details, URLs, or exception objects.
  console.error('AI operation not confirmed', { code: err.code });
  return NextResponse.json(
    { error: messages[err.code], code: err.code },
    { status: err.status, headers: aiHeaders },
  );
}
function rpcError(error: any): never {
  throw new AiPrivacyError(
    error?.code === 'PT409'
      ? 'CHANGED'
      : error?.code === 'PT429'
        ? 'RATE'
        : error?.code === '42501'
          ? 'OFF'
          : error?.code === '22023'
            ? 'INPUT'
            : 'UNAVAILABLE',
    error?.code === 'PT409'
      ? 409
      : error?.code === 'PT429'
        ? 429
        : error?.code === '42501'
          ? 403
          : error?.code === '22023'
            ? 400
            : 503,
  );
}
export async function aiRpc(client: any, name: string, args?: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error) rpcError(error);
  return data;
}
export async function readAiPrivacy(client: any) {
  const parsed = aiPrivacySchema.safeParse(await aiRpc(client, 'ai_privacy_state'));
  if (!parsed.success) throw new AiPrivacyError('UNAVAILABLE');
  return parsed.data;
}
export async function requireAiPrivacy(client: any, wealth = false) {
  const p = await readAiPrivacy(client);
  if (!p.enabled) throw new AiPrivacyError('OFF', 403);
  if (wealth && !p.wealthEnabled) throw new AiPrivacyError('WEALTH_OFF', 403);
  return p;
}
export type AiLease = z.infer<typeof aiLeaseSchema> & { client: any; signal?: AbortSignal };
export async function beginAi(
  client: any,
  domain: AiRequestDomain,
  signal?: AbortSignal,
): Promise<AiLease> {
  const p = await requireAiPrivacy(client, domain === 'wealth' || domain === 'wealth_legacy');
  if (domain !== 'conversation' && !process.env.OPENROUTER_API_KEY)
    throw new AiPrivacyError('UNCONFIGURED');
  const result = aiLeaseSchema.safeParse(
    await aiRpc(client, 'ai_request_begin', { p_revision: p.revision, p_domain: domain }),
  );
  if (!result.success) throw new AiPrivacyError('UNAVAILABLE');
  return { ...result.data, client, signal };
}
export async function checkAiLease(lease: AiLease) {
  const r = aiLeaseSchema.safeParse(
    await aiRpc(lease.client, 'ai_request_check', { p_request: lease.id }),
  );
  if (
    !r.success ||
    r.data.revision !== lease.revision ||
    r.data.wealthEnabled !== lease.wealthEnabled ||
    r.data.domain !== lease.domain
  )
    throw new AiPrivacyError('CHANGED', 409);
  if (lease.signal?.aborted) throw new AiPrivacyError('CHANGED', 409);
}
export async function finishAi(lease: AiLease, data: Record<string, unknown>) {
  await checkAiLease(lease);
  return aiRpc(lease.client, 'ai_request_finish', { p_request: lease.id, p_data: data });
}
export function assertAiOrigin(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 32768)
    throw new AiPrivacyError('INPUT', 413);
  const url = new URL(request.url),
    proto = request.headers.get('x-forwarded-proto');
  const expected =
    (proto === 'https' || proto === 'http' ? proto + ':' : url.protocol) +
    '//' +
    (request.headers.get('host') || url.host);
  if (
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    (request.headers.get('origin') && request.headers.get('origin') !== new URL(expected).origin)
  )
    throw new AiPrivacyError('INPUT', 403);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new AiPrivacyError('INPUT', 400);
}
export async function aiJson(request: Request) {
  assertAiOrigin(request);
  const reader = request.body?.getReader();
  if (!reader) throw new AiPrivacyError('INPUT', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        throw new AiPrivacyError('INPUT', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes));
}
