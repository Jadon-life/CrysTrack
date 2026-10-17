import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,readdirSync } from 'node:fs';
test('manual SQL installer preserves the canonical migration and keeps guard creation before triggers',()=>{
 const root='docs/sql/wealth-0009/',files=readdirSync(root).filter(f=>/^0[1-8]-.*\.sql$/.test(f)).sort();
 assert.equal(files.length,8);
 const parts=files.map(f=>readFileSync(root+f,'utf8'));
 const combined=parts.map(text=>text.split('-- BEGIN MIGRATION SECTION\n')[1].split('-- END MIGRATION SECTION\n')[0]).join('');
 const original=readFileSync('src/db/migrations/0009_wealth_suite.sql','utf8').replace('BEGIN;\n','').split('COMMIT;')[0];
 assert.equal(combined,original,'installer must not alter financial/security migration statements');
 const guard=parts[1];assert.ok(guard.indexOf('CREATE OR REPLACE FUNCTION wealth_guard()')<guard.indexOf('CREATE TRIGGER wealth_ledger_guard'));
 for(const part of parts){assert.ok(part.includes('SET LOCAL search_path = public;'));assert.equal((part.match(/\$\$/g)||[]).length%2,0,'every installer file has complete dollar-quoted bodies');}
});
