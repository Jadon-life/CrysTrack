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
test('existing migration files have genuinely incompatible column declarations; never mark green by skipping', () => {
  const assignment = fs.readFileSync('src/db/migrations/0016_assignment_lifecycle.sql','utf8');
  const bills = fs.readFileSync('src/db/migrations/0019_wealth_recurring_bills.sql','utf8');
  assert.match(assignment,/ALTER TABLE public\.assignments ADD COLUMN revision/);
  assert.match(bills,/ALTER TABLE public\.money_entries ADD COLUMN bill_id uuid REFERENCES public\.wealth_recurring_bills/);
  const sql = fs.readFileSync('scripts/hosted-pg17-schema-collision-preflight.sql','utf8');
  assert.match(sql,/conflicting_assignment_revision_column/);
  assert.match(sql,/conflicting_legacy_bill_id_column/);
});
