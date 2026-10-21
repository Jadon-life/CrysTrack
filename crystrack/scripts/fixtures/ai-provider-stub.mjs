/** TEST PRELOAD ONLY. Not imported by application code or configurable through an app endpoint. */
import fs from 'node:fs';
import path from 'node:path';
import { assertTarget, ROOT } from '../local-supabase.mjs';
if (process.env.CRYSTRACK_TEST_PROVIDER_STUB !== 'ISSUE41-SYNTHETIC-ONLY')
  throw new Error('Synthetic provider preload requires explicit test invocation');
if (process.env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:54321')
  throw new Error('Only the guarded loopback sandbox is allowed');
if (
  process.env.OPENROUTER_API_KEY &&
  process.env.OPENROUTER_API_KEY !== 'synthetic-issue41-not-a-provider-key'
)
  throw new Error('A real provider key is forbidden in the browser test');
assertTarget();
const folder = path.join(ROOT, '.preview-test/ai-privacy');
fs.mkdirSync(folder, { recursive: true });
const readControl = () => JSON.parse(fs.readFileSync(folder + '/control.json', 'utf8'));
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
  if (['127.0.0.1', 'localhost'].includes(url.hostname)) return realFetch(input, options);
  if (url.href !== 'https://openrouter.ai/api/v1/chat/completions')
    throw new Error('Non-loopback test transport blocked');
  const body = JSON.parse(options.body);
  fs.appendFileSync(
    folder + '/provider-events.ndjson',
    JSON.stringify({ body, at: new Date().toISOString() }) + '\n',
    { mode: 0o600 },
  );
  const control = readControl();
  if (control.mode === 'defer')
    await new Promise((resolve, reject) => {
      let timer;
      const abort = () => {
        clearInterval(timer);
        reject(new Error('Synthetic aborted transport'));
      };
      if (options.signal?.aborted) return abort();
      options.signal?.addEventListener('abort', abort, { once: true });
      timer = setInterval(() => {
        if (readControl().mode !== 'defer') {
          clearInterval(timer);
          options.signal?.removeEventListener('abort', abort);
          resolve();
        }
      }, 25);
    });
  if (control.mode === 'error')
    return new Response('SYNTHETIC_PRIVATE_UPSTREAM_ERROR user@example.invalid', { status: 500 });
  const schema = body.response_format?.json_schema?.name;
  const content =
    schema === 'crystrack_goal_analysis'
      ? {
          goal_domain: 'other',
          status: 'insufficient_evidence',
          summary:
            'Private qualitative evidence was not supplied. Only numeric patterns are available.',
          evidence: ['Only recorded numeric evidence'],
          risks: [],
          next_action: 'Review your recorded progress locally.',
          confidence: 'low',
          safety_note: '',
        }
      : schema === 'crystrack_wealth_insight'
        ? {
            headline: 'Synthetic aggregate observation',
            summary: 'Synthetic exact aggregate context was reviewed.',
            observation: 'Only approved aggregates were supplied.',
            next_action: 'Review recorded categories.',
            confidence: 'low',
          }
        : schema
          ? {
              headline: 'Synthetic numeric observation',
              summary: 'Only explicitly permitted numeric context was supplied.',
              observations: ['The supplied counts describe recorded activity only.'],
              actions: [],
              risk_level: 'low',
              confidence: 'low',
            }
          : 'Synthetic read-only reply from the local provider stub.';
  return new Response(
    JSON.stringify({
      choices: [
        { message: { content: typeof content === 'string' ? content : JSON.stringify(content) } },
      ],
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
