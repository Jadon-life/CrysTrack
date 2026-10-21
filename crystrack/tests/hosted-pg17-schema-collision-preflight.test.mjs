import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('hosted preflight is read-only with explicit stop conditions for divergent legacy columns', () => {
  const sql = fs.readFileSync('scripts/hosted-pg17-schema-collision-preflight.sql', 'utf8');
  // Strip comments before ruling out mutations (COMMENT text describes unsafe DDL).
  const body = sql.split('\n').filter(x => !x.trim().startsWith('--')).join('\n');
  assert.match(body, /current_setting\('server_version_num'\)/);
  assert.match(body, /pg_constraint/);
  assert.match(body, /nonpositive_versions/);
  assert.match(body, /REFERENCES wealth_bills\(id\)/);
  assert.match(body, /cron\.job/);
  assert.match(body, /pg_catalog\.pg_event_trigger/);
  assert.match(body, /NOT installed_daily AND NOT revision_exists AND NOT legacy_bill_column AND active_dispatchers = 0/);
  assert.doesNotMatch(body, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE|SECURITY\s+DEFINER|COPY|pg_sleep)\s+/i);
});
test('compatible Sep28 SQL preserves legacy bill reference and normalizes legacy assignment versions', () => {
  const assignment = fs.readFileSync('src/db/migrations/0016_assignment_lifecycle.sql','utf8');
  const bills = fs.readFileSync('src/db/migrations/0019_wealth_recurring_bills.sql','utf8');
  assert.match(assignment,/ADD COLUMN IF NOT EXISTS revision/);
  assert.match(assignment,/UPDATE public\.assignments SET revision=1 WHERE revision=0/);
  assert.match(bills,/ADD COLUMN sep28_bill_id uuid REFERENCES public\.wealth_recurring_bills/);
  assert.doesNotMatch(bills,/ADD COLUMN bill_id uuid REFERENCES public\.wealth_recurring_bills/);
  const preflight = fs.readFileSync('scripts/hosted-pg17-schema-collision-preflight.sql','utf8');
  assert.match(preflight,/conflicting_assignment_revision_column/);
  assert.match(preflight,/conflicting_legacy_bill_id_column/);
});
