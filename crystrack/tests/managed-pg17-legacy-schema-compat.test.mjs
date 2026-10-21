import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql = (n) => fs.readFileSync('src/db/migrations/'+n+'.sql','utf8');
test('hosted PG17 uses existing positive assignment versions without dropping user rows', () => {
  const s=sql('0016_assignment_lifecycle');
  assert.match(s,/ADD COLUMN IF NOT EXISTS revision/);
  assert.match(s,/UPDATE public\.assignments SET revision=1 WHERE revision=0/);
  assert.match(s,/ALTER COLUMN revision SET DEFAULT 1/);
  assert.match(s,/sep28_assignment_positive_revision CHECK\(revision>0\)/);
  assert.match(s,/ADD COLUMN reminder_version integer NOT NULL DEFAULT 1/);
  assert.doesNotMatch(s,/DROP COLUMN|TRUNCATE/i);
  // The existing owner-scoped 'delete assignment' RPC is intentional and is not migration-time cleanup.
});
test('Sep28 bill payment uses new FK without replacing legacy money_entries bill_id', () => {
  const s=sql('0019_wealth_recurring_bills');
  assert.match(s,/ADD COLUMN sep28_bill_id uuid REFERENCES public\.wealth_recurring_bills\(id\)/);
  assert.match(s,/bill_origin_pair CHECK\(\(sep28_bill_id IS NULL\)=\(bill_occurrence_id IS NULL\)\)/);
  assert.match(s,/NEW\.sep28_bill_id/);
  assert.match(s,/OLD\.sep28_bill_id/);
  assert.match(s,/e\.sep28_bill_id=o\.bill_id/);
  assert.match(s,/e\.sep28_bill_id=p\.bill_id/);
  assert.match(s,/note,sep28_bill_id,bill_occurrence_id/);
  assert.doesNotMatch(s,/ADD COLUMN bill_id uuid REFERENCES public\.wealth_recurring_bills/);
  assert.doesNotMatch(s,/DROP COLUMN bill_id|DROP CONSTRAINT money_entries_bill_id_fkey/);
});
test('CSV, Crystal Shards and overview cannot launder cross-bill provenance', () => {
  const crystal=sql('0015_sep28_crystal_shards'),csv=sql('0020_wealth_csv_statements'),over=sql('0021_wealth_overview_read');
  assert.match(crystal,/rowdata->>'bill_id' IS NULL AND rowdata->>'sep28_bill_id' IS NULL/);
  assert.match(csv,/NEW\.bill_id IS NOT NULL OR NEW\.sep28_bill_id IS NOT NULL/);
  assert.match(csv,/e\.bill_id IS NOT NULL OR e\.sep28_bill_id IS NOT NULL/);
  assert.match(csv,/rowdata->>'bill_id' IS NULL AND rowdata->>'sep28_bill_id' IS NULL/);
  assert.match(over,/e\.sep28_bill_id=o\.bill_id/);
  assert.match(over,/e\.sep28_bill_id IS NOT NULL/);
  assert.doesNotMatch(over,/e\.bill_id/);
});
test('Private export identifies the separate old/new bill relationships', () => {
  const s=sql('0024_private_account_export');
  assert.match(s,/"bill_id","sep28_bill_id","bill_occurrence_id"/);
  assert.match(s,/"bill_id":"wealth_bills","sep28_bill_id":"wealth_recurring_bills"/);
});
