/** Read-only source comparison against the approved September development base. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.dirname(app),base='9be18c0c7815d589cb46199bfd87aee430a27cbf';
const intended=new Set(['crystrack/src/app/layout.tsx','crystrack/src/app/page.tsx','crystrack/src/app/tasks/page.tsx','crystrack/src/components/layout/auth-provider.tsx','crystrack/src/components/layout/app-layout.tsx','crystrack/src/components/tasks/task-week-grid.tsx']);
const files=execFileSync('git',['ls-tree','-r','--name-only','--full-tree',base],{cwd:repo,encoding:'utf8'}).trim().split('\n');
const protectedFiles=files.filter(p=>(p.startsWith('crystrack/src/')&&!intended.has(p))||p==='crystrack/public/sw.js');
const unchanged=protectedFiles.map(file=>{
  const original=execFileSync('git',['show',base+':'+file],{cwd:repo});
  const current=fs.readFileSync(path.join(repo,file));
  if(!original.equals(current))throw new Error('Protected source changed: '+file);
  return{file,sha256:createHash('sha256').update(current).digest('hex')};
});
const migrations=fs.readdirSync(path.join(app,'src/db/migrations')).filter(p=>p.endsWith('.sql')).sort().map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(path.join(app,'src/db/migrations',file))).digest('hex')}));
const destination=path.join(app,'docs/validation/issue43p2/protected-source.json');
fs.mkdirSync(path.dirname(destination),{recursive:true});
fs.writeFileSync(destination,JSON.stringify({base,unchanged,migrations,newMigrations:[]},null,2)+'\n');
console.log(`${unchanged.length} existing source files and ${migrations.length} migrations unchanged; no new migration.`);
