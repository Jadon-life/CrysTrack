import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { apiWriterInventory } from '../scripts/preview-write-audit.mjs';

test('writer inventory accounts for every current mutation route and auth callback', () => {
  const expected = JSON.parse(fs.readFileSync('docs/preview-write-inventory.json', 'utf8'));
  assert.deepEqual(apiWriterInventory(), expected, 'New writers need a documented preview-risk review');
});

test('existing profile API permits an authenticated Preview write (synthetic mock only)', async () => {
  let writes = 0;
  const row = { user_id: 'synthetic-user', avatar_url: null };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'synthetic-user', user_metadata: {} } } }), updateUser: async () => ({}) },
    from: () => ({ upsert: () => { writes += 1; return { select: () => ({ single: async () => ({ data: row }) }) }; } }),
  };
  const key = '__crystrack_preview_audit_client';
  globalThis[key] = client;
  const old = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';
  try {
    const source = fs.readFileSync('src/app/api/profile/route.ts', 'utf8')
      .replace("import { NextResponse } from 'next/server';", 'const NextResponse = { json: (body, init) => Response.json(body, init) };')
      .replace("import { createClient } from '@/lib/supabase/server';", `const createClient = async () => globalThis.${key};`)
      .replace("import { AVATAR_BUCKET } from '@/lib/profile-avatar';", "const AVATAR_BUCKET = 'profile-avatars';");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
    const { PUT } = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(compiled.outputText));
    const response = await PUT(new Request('http://preview.example.invalid/api/profile', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timezone: 'Africa/Lagos' }),
    }));
    assert.equal(response.status, 200);
    assert.equal(writes, 1, 'An API guard is not currently enforcing Preview read-only');
  } finally {
    delete globalThis[key];
    if (old === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = old;
  }
});
