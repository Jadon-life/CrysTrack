import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const compiled = { exports: {} };
new Function(
  'require', 'module', 'exports',
  ts.transpileModule(fs.readFileSync('src/lib/release-api-stop.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
)(require, compiled, compiled.exports);
const { NextRequest } = require('next/server');
const { releaseApiStop } = compiled.exports;

const apiPaths = [
  '/api', '/api/tasks', '/api/tasks/week', '/api/tasks/offline/replay',
  '/api/daily-records/context', '/api/daily-notes/2026-09-28',
  '/api/finance', '/api/finance/entries', '/api/finance/targets',
  '/api/wealth', '/api/wealth/budgets', '/api/wealth/bills',
  '/api/wealth/csv/imports', '/api/wealth/debts', '/api/wealth/expected',
  '/api/reminders/dispatch', '/api/ai/privacy', '/api/auth/callback',
  '/api/telegram/webhook', '/api/profile',
];
const methods = ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'];
const pagePaths = ['/', '/auth', '/plan', '/finance', '/settings', '/_next/static/chunk.js', '/favicon.ico', '/apiary', '/api-old'];
const request = (path, method) => new NextRequest('http://localhost' + path, { method });

test('release API stop is inert when absent, empty, or explicitly off', () => {
  const prior = process.env.CRYSTRACK_RELEASE_API_STOP;
  try {
    for (const flag of [undefined, '', 'off']) {
      if (flag === undefined) delete process.env.CRYSTRACK_RELEASE_API_STOP;
      else process.env.CRYSTRACK_RELEASE_API_STOP = flag;
      for (const path of [...apiPaths, ...pagePaths]) {
        for (const method of methods) assert.equal(releaseApiStop(request(path, method)), null, path + ' ' + method);
      }
    }
  } finally {
    if (prior === undefined) delete process.env.CRYSTRACK_RELEASE_API_STOP;
    else process.env.CRYSTRACK_RELEASE_API_STOP = prior;
  }
});

test('release API stop fails closed on nonempty values and denies all API verbs before Auth', async () => {
  const prior = process.env.CRYSTRACK_RELEASE_API_STOP;
  try {
    for (const flag of ['on', '1', 'true', 'OFF', 'typo', '0']) {
      process.env.CRYSTRACK_RELEASE_API_STOP = flag;
      for (const path of apiPaths) {
        for (const method of methods) {
          const res = releaseApiStop(request(path, method));
          assert.equal(res?.status, 503, flag + ' ' + method + ' ' + path);
          assert.equal(res.headers.get('Retry-After'), '60');
          assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
          assert.equal((await res.json()).error, 'CrysTrack is temporarily unavailable for updates. Please try again soon.');
        }
      }
    }
  } finally {
    if (prior === undefined) delete process.env.CRYSTRACK_RELEASE_API_STOP;
    else process.env.CRYSTRACK_RELEASE_API_STOP = prior;
  }
});

test('release stop permits page GET/HEAD but denies page server-action and form writes', () => {
  const prior = process.env.CRYSTRACK_RELEASE_API_STOP;
  try {
    process.env.CRYSTRACK_RELEASE_API_STOP = 'on';
    for (const path of pagePaths) {
      for (const method of ['GET', 'HEAD']) assert.equal(releaseApiStop(request(path, method)), null);
      for (const method of ['OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        assert.equal(releaseApiStop(request(path, method))?.status, 503, path + ' ' + method);
      }
    }
  } finally {
    if (prior === undefined) delete process.env.CRYSTRACK_RELEASE_API_STOP;
    else process.env.CRYSTRACK_RELEASE_API_STOP = prior;
  }
});

test('Preview remains first; new stop runs before task-only stop, auth/session and asset bypass', () => {
  const proxy = fs.readFileSync('src/proxy.ts', 'utf8');
  const preview = proxy.indexOf('previewRequest(request)');
  const release = proxy.indexOf('releaseApiStop(request)');
  const task = proxy.indexOf('taskMaintenance(request)');
  const session = proxy.indexOf('updateSession(request)');
  const assets = proxy.indexOf("path.startsWith('/_next/static')");
  assert.ok(preview >= 0 && release > preview && task > release && session > task && assets > release);
  assert.match(fs.readFileSync('.env.example', 'utf8'), /^CRYSTRACK_RELEASE_API_STOP=off$/m);
  const legacy = fs.readFileSync('src/lib/task-maintenance.ts', 'utf8');
  assert.match(legacy, /CRYSTRACK_TASK_WRITE_MAINTENANCE/);
  assert.doesNotMatch(fs.readFileSync('src/lib/release-api-stop.ts', 'utf8'), /supabase|DATABASE_URL|service_role/i);
});
