import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function harness(fetcher = async () => { throw Error('offline'); }) {
  const events = {};
  const added = [];
  const deleted = [];
  const notifications = [];
  const navigations = [];
  const opens = [];
  let claims = 0;
  let skipped = 0;
  let fetches = 0;
  const stored = new Map();
  const cache = {
    add: async path => { added.push(path); stored.set(path, new Response('GENERIC OFFLINE DOCUMENT', { headers: { 'Content-Type': 'text/html' } })); },
    match: async path => stored.get(path),
  };
  const sandbox = {
    URL, Response, Date, Promise,
    caches: {
      open: async key => { assert.equal(key, 'crystrack-public-offline-v1'); return cache; },
      keys: async () => ['crystrack-public-offline-v0', 'crystrack-public-offline-v1', 'third-party-cache'],
      delete: async key => { deleted.push(key); return true; },
    },
    fetch: request => { fetches += 1; return fetcher(request); },
    self: {
      location: { origin: 'https://crystrack.invalid' },
      addEventListener: (name, callback) => { events[name] = callback; },
      skipWaiting: () => { skipped += 1; return Promise.resolve(); },
      clients: {
        claim: () => { claims += 1; return Promise.resolve(); },
        matchAll: async () => [{ navigate: async path => { navigations.push(path); }, focus: async () => undefined }],
        openWindow: async path => { opens.push(path); },
      },
      registration: {
        showNotification: async (title, options) => { notifications.push({ title, options }); },
      },
    },
  };
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), sandbox, { timeout: 1000 });
  const run = async (name, event) => {
    let work;
    let responded = false;
    events[name]({
      ...event,
      waitUntil: value => { work = value; },
      respondWith: value => { responded = true; work = value; },
    });
    return { result: work ? await work : undefined, responded };
  };
  return { events, sandbox, run, added, deleted, notifications, navigations, opens, stored,
    metrics: () => ({ claims, skipped, fetches }) };
}

test('public-only install caches one generic page and activates without deleting unrelated caches', async () => {
  const h = harness();
  await h.run('install', {});
  assert.deepEqual(h.added, ['/offline.html']);
  assert.equal(h.metrics().skipped, 1);
  await h.run('activate', {});
  assert.deepEqual(h.deleted, ['crystrack-public-offline-v0']);
  assert.equal(h.metrics().claims, 1);
});

test('only genuine same-origin navigation failures use public offline document; private responses never cached', async () => {
  const offline = harness();
  await offline.run('install', {});
  const nav = await offline.run('fetch', { request: { method: 'GET', mode: 'navigate', url: 'https://crystrack.invalid/finance' } });
  assert.equal(nav.responded, true);
  assert.equal(await nav.result.text(), 'GENERIC OFFLINE DOCUMENT');
  assert.equal(offline.metrics().fetches, 1);
  assert.deepEqual([...offline.stored.keys()], ['/offline.html']);
  for (const req of [
    { method: 'POST', mode: 'navigate', url: 'https://crystrack.invalid/finance' },
    { method: 'GET', mode: 'cors', url: 'https://crystrack.invalid/api/finance' },
    { method: 'GET', mode: 'navigate', url: 'https://crystrack.invalid/api/finance' },
    { method: 'GET', mode: 'navigate', url: 'https://external.invalid/' },
    { method: 'GET', mode: 'navigate', url: 'https://crystrack.invalid/offline.html' },
    { method: 'GET', mode: 'navigate', url: 'https://crystrack.invalid/_next/app.js' },
  ]) assert.equal((await offline.run('fetch', { request: req })).responded, false);
  assert.equal(offline.metrics().fetches, 1);
});

test('successful private navigations are returned from network without being persisted', async () => {
  const online = harness(async () => new Response('PRIVATE OWNER DATA'));
  await online.run('install', {});
  const result = await online.run('fetch', { request: { method: 'GET', mode: 'navigate', url: 'https://crystrack.invalid/tasks' } });
  assert.equal(result.responded, true);
  assert.equal(await result.result.text(), 'PRIVATE OWNER DATA');
  assert.deepEqual([...online.stored.keys()], ['/offline.html']);
});

test('push and click refuse absolute, scheme-relative, API and backslash destinations', async () => {
  const h = harness();
  const safe = h.sandbox.safeAppPath;
  assert.equal(safe('/plan?tab=goals'), '/plan?tab=goals');
  for (const value of [null, '', 'https://external.invalid/', '//external.invalid/', 'javascript:alert(1)', '/api/tasks', '/_next/image', '/offline.html', '/\\evil.invalid', '/sw.js']) {
    assert.equal(safe(value), '/', String(value));
  }
  await h.run('push', { data: { json: () => ({ title: 'Test', body: 'No secret', url: 'https://external.invalid/attack', icon: 'https://external.invalid/tracker.png' }) } });
  assert.equal(h.notifications.length, 1);
  assert.equal(h.notifications[0].options.data.url, '/');
  assert.equal(h.notifications[0].options.icon, '/icons/icon-192.png');
  assert.equal(h.notifications[0].options.badge, '/icons/icon-192.png');
  let closed = false;
  await h.run('notificationclick', { notification: { data: { url: '//external.invalid/' }, close: () => { closed = true; } } });
  assert.equal(closed, true);
  assert.deepEqual(h.navigations, ['https://crystrack.invalid/']);
  await h.run('notificationclick', { notification: { data: { url: '/tasks' }, close: () => undefined } });
  assert.deepEqual(h.navigations, ['https://crystrack.invalid/', 'https://crystrack.invalid/tasks']);
});

test('public offline HTML contains no owner data, scripts or requests; Preview SW block stays ahead', () => {
  const html = fs.readFileSync('public/offline.html', 'utf8');
  assert.match(html, /You're offline/);
  assert.match(html, /Reconnect to load your workspace/);
  assert.doesNotMatch(html, /<script|<iframe|<form|fetch\(|navigator|localStorage|accounts?\/|token=/i);
  const middleware = fs.readFileSync('src/lib/supabase/middleware.ts', 'utf8');
  assert.match(middleware, /'\/offline.html'/);
  const preview = fs.readFileSync('src/lib/preview/request.ts', 'utf8');
  assert.match(preview, /pathname === '\/sw.js'/);
  assert.match(preview, /this\.registration\.unregister\(\)/);
  const manifest = fs.readFileSync('src/app/manifest.ts', 'utf8');
  assert.match(manifest, /shortcuts/);
  assert.match(manifest, /url: '\/finance'/);
  assert.doesNotMatch(manifest, /purpose: 'maskable'/);
});
