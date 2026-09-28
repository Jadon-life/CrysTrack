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

test(
  'calendar grid stays chronologically aligned to real weekdays across month changes',
  () => {
    const calendar = read(
      'src/app/calendar/page.tsx',
    );

    assert.match(
      calendar,
      /const gridStart = new Date\(first\)/,
    );

    assert.match(
      calendar,
      /first\.getDate\(\) - first\.getDay\(\)/,
    );

    assert.match(
      calendar,
      /Array\.from\(\s*\{ length: 42 \}/,
    );

    assert.doesNotMatch(
      calendar,
      /output\.unshift/,
    );
  },
);

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

    assert.match(
      context,
      /as_of_weekday:\s*current\.weekday/,
    );

    assert.match(
      context,
      /tasksContext\(\s*supabase,\s*userId,\s*timezone,\s*now/,
    );
  },
);

test(
  'calendar weekday mathematics survives month boundaries',
  () => {
    function grid(year, month) {
      const first = new Date(
        year,
        month,
        1,
      );

      const start = new Date(first);

      start.setDate(
        first.getDate() -
          first.getDay(),
      );

      return Array.from(
        { length: 42 },
        (_, index) => {
          const date =
            new Date(start);

          date.setDate(
            start.getDate() +
              index,
          );

          return date;
        },
      );
    }

    const september =
      grid(2026, 8);

    const sep30 =
      september.find(
        (date) =>
          date.getFullYear() === 2026 &&
          date.getMonth() === 8 &&
          date.getDate() === 30,
      );

    assert.ok(sep30);
    assert.equal(
      sep30.getDay(),
      3,
      '30 September 2026 must remain Wednesday',
    );

    const october =
      grid(2026, 9);

    const oct1 =
      october.find(
        (date) =>
          date.getFullYear() === 2026 &&
          date.getMonth() === 9 &&
          date.getDate() === 1,
      );

    assert.ok(oct1);
    assert.equal(
      oct1.getDay(),
      4,
      '1 October 2026 must remain Thursday',
    );
  },
);