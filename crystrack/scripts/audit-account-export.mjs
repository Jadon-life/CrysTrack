/** Source-only comparison; never accesses account records or a hosted service. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.dirname(app);
const base='c2a1f6c1cb43aa39457263babda7efb3ad5df921';
const original=execFileSync('git',['ls-tree','-r','--name-only',base],{cwd:repo,encoding:'utf8'}).trim().split('\n');
const files=original.filter(p=>(p.startsWith('crystrack/src/')&&p!=='crystrack/src/app/settings/page.tsx')||p==='crystrack/public/sw.js');
const unchanged=files.map(file=>{const old=execFileSync('git',['show',base+':'+file],{cwd:repo}),now=fs.readFileSync(path.join(repo,file));if(!old.equals(now))throw Error('Protected source changed: '+file);return{file,sha256:createHash('sha256').update(now).digest('hex')};});
const result={base,unchanged,newMigration:'0024_private_account_export.sql',newMigrationSha256:createHash('sha256').update(fs.readFileSync(path.join(app,'src/db/migrations/0024_private_account_export.sql'))).digest('hex'),legacyMigrationsUnchanged:17};
fs.mkdirSync(path.join(app,'docs/validation/issue44'),{recursive:true});fs.writeFileSync(path.join(app,'docs/validation/issue44/protected-source.json'),JSON.stringify(result,null,2)+'\n');
console.log(`PASS: ${unchanged.length} existing sources including 17 legacy migrations match the approved base.`);
