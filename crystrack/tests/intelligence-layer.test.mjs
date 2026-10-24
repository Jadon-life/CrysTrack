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

test('AI provider uses direct OpenAI routing, omits storage and keeps server-only credentials', () => {
  const ai = read('src/lib/ai/intelligence.ts');
  const transport = read('src/lib/ai/provider.ts');
  assert.match(transport, /https:\/\/api\.openai\.com\/v1\/chat\/completions/);
  assert.match(transport, /process\.env\.OPENAI_API_KEY/);
  assert.match(ai, /gpt-5\.4-mini/);
  assert.match(transport, /store: false/);
  assert.match(ai, /reasoning_effort: 'none'/);
  assert.match(ai, /model: intelligenceChatModel\(\)/);
  assert.match(ai, /model: intelligenceAnalysisModel\(\)/);
  assert.doesNotMatch(transport, /OPENROUTER_API_KEY|openrouter\.ai|provider:\s*\{/);
  assert.doesNotMatch(ai, /openrouter\/free|:free/);
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
test('paid AI rate-limit messaging does not describe the model as free', () => {
  const chat = read('src/app/api/ai/chat/route.ts');
  assert.doesNotMatch(chat, /free AI quota/i);
  assert.match(read('src/lib/ai/privacy-server.ts'), /CrysTrack AI is temporarily busy/);
});

test('domain insights require observations and cached insights are revalidated', () => {
  const ai = read('src/lib/ai/intelligence.ts');
  const route = read('src/app/api/ai/domain/[domain]/route.ts');

  assert.match(
    ai,
    /observations:\s*z\.array\([^;]+\.min\(1\)\.max\(5\)/,
  );

  assert.match(
    ai,
    /minItems:\s*1/,
  );

  assert.match(
    ai,
    /maxItems:\s*5/,
  );

  assert.match(
    ai,
    /Never return an empty observations array/,
  );

  assert.match(
    ai,
    /at least one observation must directly interpret today's deterministic routine state/,
  );

  assert.match(
    route,
    /DomainInsightSchema/,
  );

  assert.match(
    route,
    /function validatedInsight/,
  );

  assert.match(
    route,
    /DomainInsightSchema\.safeParse/,
  );

  assert.match(
    route,
    /sameFingerprintInsight/,
  );

  assert.match(
    route,
    /latestInsight/,
  );
});

test('routine guidance is optional and never presented as a best move', () => {
  const ai = read('src/lib/ai/intelligence.ts');
  const component = read(
    'src/components/ai/domain-insight-card.tsx',
  );
  const route = read(
    'src/app/api/ai/domain/[domain]/route.ts',
  );

  assert.match(
    ai,
    /Actions are optional/,
  );

  assert.match(
    ai,
    /empty actions array/,
  );

  assert.match(
    ai,
    /never restate an obvious current-state fact as an action/,
  );

  assert.match(
    ai,
    /never generate advice merely to fill the actions array/,
  );

  assert.match(
    component,
    /Suggested focus/,
  );

  assert.doesNotMatch(
    component,
    /Best next/,
  );

  assert.match(
    route,
    /DOMAIN_INSIGHT_POLICY_VERSION/,
  );

  assert.match(
    route,
    /policy_version/,
  );
});

test('CI uses supported Node, with no API key leaked into workflows', () => {
  const ci = read('../.github/workflows/ci.yml');
  const pkg = JSON.parse(read('package.json'));
  assert.match(ci, /node-version:\s*22/);
  assert.doesNotMatch(ci, /OPENAI_API_KEY:/);
  assert.equal(pkg.engines?.node, '>=22.0.0');
});
