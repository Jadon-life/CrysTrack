import { NextResponse } from 'next/server';
import { z } from 'zod';
export const csvHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};
export function csvFailure(e: unknown) {
  const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : 'unknown';
  const status =
    e instanceof z.ZodError || e instanceof SyntaxError || code.startsWith('22')
      ? 400
      : code === 'PT409' || code === '23505'
        ? 409
        : code === '42501'
          ? 403
          : 503;
  console.error('Statement operation not confirmed', { code, status });
  return NextResponse.json(
    {
      error:
        status === 409
          ? 'Statement or duplicate evidence changed. Review again; no additional import is confirmed.'
          : status === 400
            ? 'Review valid NGN rows, mapping and dates. No import is confirmed.'
            : 'Statement operation is unavailable or exceeds its limit. Narrow the export interval or refresh; no additional import is confirmed.',
    },
    { status, headers: csvHeaders },
  );
}
export async function boundedJson(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new z.ZodError([]);
  const origin = request.headers.get('origin');
  // Next's internal Request URL may use localhost behind its server/proxy.
  // Host is the browser's actual authority; never trust an arbitrary forwarded-host.
  const internal = new URL(request.url);
  const forwardedProtocol = request.headers.get('x-forwarded-proto');
  const protocol =
    forwardedProtocol === 'https' || forwardedProtocol === 'http'
      ? forwardedProtocol + ':'
      : internal.protocol;
  const expected = new URL(protocol + '//' + (request.headers.get('host') || internal.host)).origin;
  if (origin && origin !== expected) throw new z.ZodError([]);
  if (Number(request.headers.get('content-length') || 0) > 1048576) throw new z.ZodError([]);
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError('Missing body');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1048576) {
        await reader.cancel();
        throw new z.ZodError([]);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
  } catch {
    throw new SyntaxError('Invalid JSON encoding');
  }
}
