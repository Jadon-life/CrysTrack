import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('All routines management is a collapsed-by-default, keyboard-accessible disclosure', () => {
  const source = fs.readFileSync('src/app/tasks/page.tsx', 'utf8');
  assert.match(source, /<details className="group overflow-hidden/);
  assert.match(source, /<summary className="flex min-h-16/);
  assert.match(source, /All routines/);
  assert.match(source, /group-open:rotate-180/);
  assert.doesNotMatch(source, /<details[^>]+open(?:\s|>|=)/);
});

test('archive, delete, and day filters remain in the expanded management area', () => {
  const source = fs.readFileSync('src/app/tasks/page.tsx', 'utf8');
  const start = source.indexOf('<summary className="flex min-h-16');
  const end = source.indexOf('</details>', start);
  assert.ok(start >= 0 && end > start, 'Routines disclosure exists');
  const contents = source.slice(start, end);
  assert.match(contents, /setFilterDay/);
  assert.match(contents, /filteredTasks\.map/);
  assert.match(contents, /setArchiveTarget\(task\)/);
  assert.match(contents, /void deleteTask\(task\)/);
  assert.match(source, /<Button variant="primary" onClick=\{\(\) => setShowCreate\(true\)\}/);
});
