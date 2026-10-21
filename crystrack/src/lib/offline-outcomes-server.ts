import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { dailyFailure } from './daily-records-server';
import { offlineOutcomeResolutionSchema, readOfflineIntent } from './offline-outcomes';

/** POST receipt is deliberately read-only SQL; no sensitive query-string/HTTP cache payload. */
export async function offlineOutcome(request: Request, operation: 'replay' | 'receipt') {
  try {
    const url = new URL(request.url), proto = request.headers.get('x-forwarded-proto');
    const expectedOrigin = (proto === 'https' || proto === 'http' ? proto + ':' : url.protocol) + '//' + (request.headers.get('host') || url.host);
    if (request.headers.get('sec-fetch-site') === 'cross-site' ||
        (request.headers.get('origin') && request.headers.get('origin') !== new URL(expectedOrigin).origin))
      return NextResponse.json({ error: 'This request is not available.' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
    const intent = await readOfflineIntent(request);
    const { data, error, status } = await client.rpc(operation === 'replay' ? 'daily_replay_offline_outcome' : 'daily_resolve_offline_outcome', { p_intent: intent });
    if (error && status === 401) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
    if (error) throw error;
    const parsed = offlineOutcomeResolutionSchema.safeParse(data);
    if (!parsed.success) throw new Error('Invalid offline receipt');
    const result = parsed.data;
    if (result.state === 'confirmed' && (result.receipt.requestId !== intent.requestId || result.receipt.day !== intent.day ||
        result.receipt.routineId !== intent.routineId || result.receipt.status !== intent.desiredStatus ||
        ![intent.expectedRevision, intent.expectedRevision + 1].includes(result.receipt.revision))) throw new Error('Invalid offline receipt');
    if (operation === 'replay' && result.state !== 'confirmed') throw new Error('Missing offline receipt');
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const response = dailyFailure(error, 'offline-' + operation);
    if (response.status === 409) return NextResponse.json({
      error: 'This routine changed. Review the latest record before trying again.', reconciliation: 'manual-review',
    }, { status: 409, headers: { 'Cache-Control': 'private, no-store' } });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
}
