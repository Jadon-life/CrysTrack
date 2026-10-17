import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync,
} from 'node:fs';
import {
  join,
} from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(
    join(root, path),
    'utf8',
  );
}

test('calendar uses the shared calendar-day grid and unified event model', () => {
 const calendar=read('src/app/calendar/page.tsx');
 assert.match(calendar,/monthCells/);assert.match(calendar,/Timeboxed Calendar/);assert.match(calendar,/onDrop/);assert.match(calendar,/Place selected task/);
});

test(
  'routine intelligence includes timezone-aligned current-day state',
  () => {
    const context = read(
      'src/lib/ai/context.ts',
    );

    assert.match(
      context,
      /dateStateInTimezone/,
    );

    assert.match(
      context,
      /current_day:/,
    );

    assert.match(
      context,
      /scheduled: scheduledToday/,
    );

    assert.match(
      context,
      /status: todayStatus/,
    );

    assert.match(
      context,
      /current_date:\s*current\.dateKey/,
    );

    assert.match(
      context,
      /as_of_date:\s*current\.dateKey/,
    );
  },
);

test(
  'task intelligence forces fresh analysis after task activity',
  () => {
    const route = read(
      'src/app/api/ai/domain/[domain]/route.ts',
    );

    const card = read(
      'src/components/ai/domain-insight-card.tsx',
    );

    const intelligence = read(
      'src/lib/ai/intelligence.ts',
    );

    assert.match(
      route,
      /searchParams\s*\.get\('force'\)\s*===\s*'1'/,
    );

    assert.match(
      route,
      /!forceRefresh/,
    );

    assert.match(
      route,
      /\.upsert\(/,
    );

    assert.match(
      route,
      /generated_at:\s*generatedAt/,
    );

    assert.match(
      route,
      /currentSnapshot/,
    );

    assert.match(
      card,
      /refresh\(\s*false,\s*true,\s*\)/,
    );

    assert.match(
      card,
      /refresh\(\s*true,\s*true,\s*\)/,
    );

    assert.match(
      card,
      /requestSequence/,
    );

    assert.match(
      intelligence,
      /tasks\.today and each routine's current_day are the authoritative current state/,
    );
  },
);

test('September 2026 uses five rows and stops at October 3',async()=>{
 const {loadTs}=await import('./load-ts.mjs');const {monthCells}=loadTs('src/lib/rhythm/logic.ts');const days=monthCells('2026-09-01');assert.equal(days.length,35);assert.equal(days.at(-1),'2026-10-03');assert.ok(days.includes('2026-09-30'));
});
