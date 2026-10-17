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
  'calendar grid stays aligned and uses only required month weeks',
  () => {
    const calendar = read(
      'src/app/calendar/page.tsx',
    );

    assert.match(
      calendar,
      /const cellCount/,
    );

    assert.match(
      calendar,
      /first\.getDay\(\) \+\s*last\.getDate\(\)/,
    );

    assert.match(
      calendar,
      /\{ length: cellCount \}/,
    );

    assert.doesNotMatch(
      calendar,
      /\{ length: 42 \}/,
    );
  },
);

test(
  'calendar keeps month cells compact with coloured category dots',
  () => {
    const calendar = read(
      'src/app/calendar/page.tsx',
    );

    assert.match(
      calendar,
      /const groups =/,
    );

    assert.match(
      calendar,
      /events\.some/,
    );

    assert.match(
      calendar,
      /groups\.map/,
    );

    assert.doesNotMatch(
      calendar,
      /events\.slice\(0, 3\)/,
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

test(
  'September 2026 uses five rows and stops at October 3',
  () => {
    function grid(
      year,
      month,
    ) {
      const first =
        new Date(
          year,
          month,
          1,
        );

      const last =
        new Date(
          year,
          month + 1,
          0,
        );

      const start =
        new Date(first);

      start.setDate(
        first.getDate() -
          first.getDay(),
      );

      const cellCount =
        Math.ceil(
          (
            first.getDay() +
            last.getDate()
          ) / 7,
        ) * 7;

      return Array.from(
        {
          length:
            cellCount,
        },
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

    assert.equal(
      september.length,
      35,
    );

    const last =
      september[
        september.length - 1
      ];

    assert.equal(
      last.getFullYear(),
      2026,
    );

    assert.equal(
      last.getMonth(),
      9,
    );

    assert.equal(
      last.getDate(),
      3,
    );

    const sep30 =
      september.find(
        (date) =>
          date.getFullYear() ===
            2026 &&
          date.getMonth() === 8 &&
          date.getDate() === 30,
      );

    assert.ok(sep30);

    assert.equal(
      sep30.getDay(),
      3,
    );
  },
);
