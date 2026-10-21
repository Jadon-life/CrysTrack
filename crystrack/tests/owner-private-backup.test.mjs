import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Owner backup helper is local, owner-confirmed, source-project bound and capture-only', () => {
  const s = fs.readFileSync('scripts/owner-private-backup.ps1', 'utf8');
  assert.match(s, /ValidateSet\('yfzglhwjtpirbwhqatdx'\)/);
  assert.match(s, /Read-Host '.*DATABASE connection URL.*' -AsSecureString/);
  assert.match(s, /BACKUP-CRYSTRACK/);
  assert.match(s, /expectedPoolerUser = 'postgres\.' \+ \$ProjectRef/);
  assert.match(s, /pooler\\\.supabase\\\.com/);
  assert.match(s, /DestinationRoot/);
  assert.match(s, /onedrive\|dropbox\|google\.drive\|repos\?/i);
  assert.match(s, /& docker info/);
  assert.match(s, /db dump --db-url \$databaseUrl -f \$roles --role-only/);
  assert.match(s, /db dump --db-url \$databaseUrl -f \$schema/);
  assert.match(s, /db dump --db-url \$databaseUrl -f \$data --use-copy --data-only/);
  assert.match(s, /Get-FileHash.*-Algorithm SHA256/);
  assert.match(s, /restoreVerified = \$false/);
  assert.match(s, /storageObjectBytesBackedUp = \$false/);
  assert.doesNotMatch(s, /supabase db (?:reset|push|migrate)|--confirm-cost|DROP DATABASE|DROP TABLE|ALTER TABLE|RESTORE DATABASE|github\.com\/.*upload/i);
});
test('Backup runbook keeps authentication and restore proof separate', () => {
  const docs = fs.readFileSync('docs/owner-private-backup-checklist.md', 'utf8');
  assert.match(docs, /Status: NOT PERFORMED/);
  assert.match(docs, /roles\.sql.*schema\.sql.*data\.sql/s);
  assert.match(docs, /Storage object bytes/i);
  assert.match(docs, /isolated/i);
  assert.match(docs, /ON_ERROR_STOP=1/);
  assert.match(docs, /3 Auth users.*16 recurring tasks.*81 task schedules.*408 task occurrences/);
  assert.match(docs, /main/);
  assert.doesNotMatch(docs, /your-password-here|postgres:\/\/postgres:\w{5,}@/i);
});
