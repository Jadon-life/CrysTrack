import { assertRealServicesAllowed } from '@/lib/preview/mode';
import { AiPrivacyError, checkAiLease, type AiLease } from './privacy-server';

export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
/** The sole external model transport. No caller-controlled URL or HTTP Referer. */
export async function requestAiProvider(
  lease: AiLease,
  body: Record<string, unknown>,
  timeoutMs = 24000,
): Promise<any> {
  assertRealServicesAllowed();
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new AiPrivacyError('UNCONFIGURED');
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 64000) throw new AiPrivacyError('INPUT', 413);
  const controller = new AbortController();
  let revoked = false,
    polling = false;
  const stop = () => controller.abort();
  lease.signal?.addEventListener('abort', stop, { once: true });
  const timeout = setTimeout(stop, timeoutMs);
  const timer = setInterval(async () => {
    if (polling) return;
    polling = true;
    try {
      await checkAiLease(lease);
    } catch {
      revoked = true;
      controller.abort();
    } finally {
      polling = false;
    }
  }, 1000);
  try {
    // Authorization linearizes here, immediately before transmission, never from UI/cache.
    await checkAiLease(lease);
    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'X-Title': 'CrysTrack',
      },
      body: JSON.stringify({
        ...body,
        provider: {
          zdr: true,
          data_collection: 'deny',
          require_parameters: true,
          allow_fallbacks: true,
        },
      }),
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'error',
    });
    if (!response.ok)
      throw new AiPrivacyError(
        response.status === 429 ? 'RATE' : 'UNAVAILABLE',
        response.status === 429 ? 429 : 503,
      );
    const reader = response.body?.getReader();
    if (!reader) throw new AiPrivacyError('UNAVAILABLE');
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) {
          await reader.cancel();
          throw new AiPrivacyError('UNAVAILABLE');
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
    await checkAiLease(lease);
    return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (revoked) throw new AiPrivacyError('CHANGED', 409);
    if (error instanceof AiPrivacyError) throw error;
    throw new AiPrivacyError('UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
    clearInterval(timer);
    lease.signal?.removeEventListener('abort', stop);
  }
}
