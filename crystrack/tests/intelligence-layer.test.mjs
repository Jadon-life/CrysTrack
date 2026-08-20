import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (relative) => readFileSync(join(root, relative), 'utf8');

test('AI navigation is between Insights and Calendar', () => {
  const nav = read('src/components/navigation/nav-items.tsx');
  const insights = nav.indexOf("href: '/insights'");
  const ai = nav.indexOf("href: '/ai'");
  const calendar = nav.indexOf("href: '/calendar'");
  assert.ok(insights >= 0 && ai > insights && calendar > ai);
});

test('goal check-ins use database-backed occurrence keys', () => {
  const route = read('src/app/api/goals/[id]/checkins/route.ts');
  const migration = read('src/db/migrations/0005_intelligence_layer.sql');
  assert.match(route, /goalCheckinWindow/);
  assert.match(route, /occurrence_key: window\.occurrenceKey/);
  assert.match(route, /error\?\.code === '23505'/);
  assert.match(migration, /goal_checkins_occurrence_unique/);
  assert.match(migration, /WHERE occurrence_key IS NOT NULL/);
});

test('daily specific and weekly occurrence logic is explicit', () => {
  const helper = read('src/lib/goals/checkin-occurrence.ts');
  assert.match(helper, /daily:\$\{dateKey\}/);
  assert.match(helper, /specific:\$\{dateKey\}/);
  assert.match(helper, /weekly:\$\{startDate\}/);
  assert.match(helper, /periodEnd >= today/);
});

test('Telegram success follows verified database persistence', () => {
  const webhook = read('src/app/api/telegram/webhook/route.ts');
  assert.match(webhook, /admin\.rpc\('link_telegram_connection'/);
  const persistIndex = webhook.indexOf("admin.rpc('link_telegram_connection'");
  const successIndex = webhook.indexOf('Telegram is now connected to CrysTrack reminders');
  assert.ok(persistIndex >= 0 && successIndex > persistIndex);
  const migration = read('src/db/migrations/0005_intelligence_layer.sql');
  assert.match(migration, /DELETE FROM telegram_connections[\s\S]*chat_id = p_chat_id/);
});

test('AI chat is read only and conversations are user scoped', () => {
  const chat = read('src/app/api/ai/chat/route.ts');
  const ai = read('src/lib/ai/intelligence.ts');
  assert.match(ai, /READ ONLY/);
  assert.match(chat, /\.eq\('user_id', user\.id\)/);
  assert.doesNotMatch(chat, /\.from\('(recurring_tasks|goals|assignments|money_entries)'\)\s*\.update/);
  assert.ok(existsSync(join(root, 'src/app/ai/page.tsx')));
});

test('AI provider remains Groq with no paid fallback', () => {
  const ai = read('src/lib/ai/intelligence.ts');
  assert.match(ai, /api\.groq\.com\/openai\/v1\/chat\/completions/);
  assert.match(ai, /openai\/gpt-oss-120b/);
  assert.doesNotMatch(ai, /api\.openai\.com|anthropic|gemini/i);
});

test('Wealth AI context excludes identity and sensitive private fields', () => {
  const context = read('src/lib/ai/context.ts');
  assert.match(context, /ledger_rows_processed/);
  assert.match(context, /recent_transactions/);
  assert.match(context, /transaction notes and debt counterparties are excluded/);
  assert.doesNotMatch(context, /select\([^)]*email/);
  assert.doesNotMatch(context, /select\([^)]*counterparty/);
});

test('domain AI is separate from main page loading', () => {
  const component = read('src/components/ai/domain-insight-card.tsx');
  assert.match(component, /useEffect/);
  assert.match(component, /\/api\/ai\/domain\/\$\{domain\}/);
  assert.match(component, /reuses unchanged analysis/);
});
