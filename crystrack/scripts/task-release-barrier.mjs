/** Issue #19 LOCAL ONLY. No URL, database, Docker endpoint or SQL CLI passthrough. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget,docker,ROOT} from './local-supabase.mjs';
import {PROJECT,NETWORK} from './local-supabase-policy.mjs';
export const DATABASE='crystrack_release_rehearsal';
export const CONFIRM='--synthetic-local-only=ISSUE19-NO-HOSTED';
export const REST='crystrack-issue19-rest';
export const PORT=54329;
const DB='supabase_db_'+PROJECT;
export const taskTables=['recurring_tasks','task_schedules','task_occurrences'];
export const dailyTables=['daily_tracking_states','daily_timezone_transitions','routine_schedule_versions','daily_records','daily_routine_records','daily_mutation_requests','daily_notes'];
export const optionalTables=['task_timeboxes','task_focus_sessions','daily_rituals'];
export const sharedTables=['activity_events','reminders','gamification_events'];
const allTables=[...taskTables,...dailyTables,...optionalTables,'reminder_deliveries',...sharedTables];
const folder=path.join(ROOT,'release/task-write-barrier');
export function parseAction(args) {
 if(args.length!==2||args[1]!==CONFIRM||!['prepare','preflight','enable','check','disable','abort','destroy'].includes(args[0]))throw Error('Inert by default. Supply an allowed action and '+CONFIRM+'; no target overrides.');
 return args[0];
}
export function raw(sql,{database=DATABASE,allowFailure=false}={}) {
 if(![DATABASE,'postgres'].includes(database))throw Error('Wrong database: refused before any command');
 assertTarget();
 const result=docker(['exec','-i',DB,'psql','-h','127.0.0.1','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-Atq'],sql,true);
 if(result.status&&!allowFailure)throw Error('Local rehearsal SQL failed; stopped without printing SQL, tokens or rows.');
 return result;
}
export const sql=query=>raw(query).stdout.trim();
export function identity() {
 if(sql("SELECT value FROM crystrack_sandbox_identity.marker")!=='ISSUE19-SYNTHETIC-ONLY')throw Error('Synthetic database marker mismatch');
 if(sql('SELECT current_database()')!==DATABASE)throw Error('Wrong database');
}
function transaction(body) {
 return `BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='15s'; SELECT pg_advisory_xact_lock(190019);\n${body}\nCOMMIT;`;
}
const shape="SELECT md5(string_agg(concat_ws(':',c.relname,a.attname,a.atttypid,a.atttypmod,a.attnotnull),',' ORDER BY c.relname,a.attnum)) FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid WHERE c.oid IN ('public.recurring_tasks'::regclass,'public.task_schedules'::regclass,'public.task_occurrences'::regclass) AND a.attnum>0 AND NOT a.attisdropped";
export function preflightSql() {
 return `DO $$ DECLARE n integer; t text; BEGIN
 IF current_database()<>'${DATABASE}' OR session_user<>'postgres' OR (SELECT value FROM crystrack_sandbox_identity.marker)<>'ISSUE19-SYNTHETIC-ONLY' THEN RAISE EXCEPTION 'Local synthetic identity required'; END IF;
 IF (${shape}) IS DISTINCT FROM (SELECT legacy_shape FROM crystrack_sandbox_identity.marker) THEN RAISE EXCEPTION 'Legacy schema fingerprint drift'; END IF;
 FOREACH t IN ARRAY ARRAY['recurring_tasks','task_schedules','task_occurrences','reminder_deliveries','activity_events','reminders'] LOOP
  IF to_regclass('public.'||t) IS NULL OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.'||t)) THEN RAISE EXCEPTION 'Unexpected legacy table/RLS'; END IF;
 END LOOP;
 SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relname=ANY(ARRAY[${dailyTables.map(t=>"'"+t+"'").join(',')}]);
 IF n NOT IN (0,7) OR (n=0)<>(to_regnamespace('crystrack_daily') IS NULL) THEN RAISE EXCEPTION 'Partial or unexpected daily schema'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('authenticated','anon','service_role') AND (rolsuper OR rolcreaterole OR rolcreatedb)) OR
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid=ANY(ARRAY[${allTables.map(t=>"to_regclass('public."+t+"')").join(',')}]) AND EXISTS(SELECT 1 FROM pg_roles api WHERE api.rolname IN ('authenticated','anon','service_role') AND pg_has_role(api.oid,r.oid,'MEMBER'))) THEN RAISE EXCEPTION 'API role can bypass DDL ownership'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=ANY(ARRAY[${allTables.map(t=>"to_regclass('public."+t+"')").join(',')}]) AND NOT tgisinternal AND (tgtype & 3)=2 AND tgname NOT LIKE 'crys_release_%') THEN RAISE EXCEPTION 'Unexpected BEFORE statement trigger'; END IF;
 IF EXISTS(SELECT 1 FROM pg_event_trigger WHERE evtname<>'crys_release_new_table') THEN RAISE EXCEPTION 'Unexpected event trigger'; END IF;
 END $$;`;
}
export function checkSql(active) {
 const expected=allTables.map(t=>`('${t}',${sharedTables.includes(t)?'true':'false'})`).join(',');
 return `DO $$ DECLARE r record; rel oid; typ integer; BEGIN
 IF (SELECT active FROM crystrack_release_gate.state) IS DISTINCT FROM ${active} THEN RAISE EXCEPTION 'Barrier state mismatch'; END IF;
 IF ${active} THEN
  IF NOT EXISTS(SELECT 1 FROM pg_event_trigger WHERE evtname='crys_release_new_table' AND evtenabled='A' AND evtfoid='crystrack_release_gate.new_table()'::regprocedure AND evttags=ARRAY['CREATE TABLE']) THEN RAISE EXCEPTION 'Event hook missing or changed'; END IF;
  FOR r IN SELECT * FROM (VALUES ${expected}) AS v(name,shared) LOOP
   rel:=to_regclass('public.'||r.name); IF rel IS NULL THEN CONTINUE; END IF;
   typ:=CASE WHEN r.shared THEN 31 ELSE 62 END;
   IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=rel AND tgname='crys_release_freeze' AND tgenabled='A' AND tgtype=typ AND tgqual IS NULL AND tgfoid=(CASE WHEN r.shared THEN 'crystrack_release_gate.deny_task_event()' ELSE 'crystrack_release_gate.deny()' END)::regprocedure) THEN RAISE EXCEPTION 'Guard missing or changed'; END IF;
   IF r.shared AND NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=rel AND tgname='crys_release_truncate' AND tgenabled='A' AND tgtype=34 AND tgfoid='crystrack_release_gate.deny()'::regprocedure) THEN RAISE EXCEPTION 'Truncate guard missing'; END IF;
  END LOOP;
 ELSE
  IF EXISTS(SELECT 1 FROM pg_event_trigger WHERE evtname='crys_release_new_table') OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgname IN ('crys_release_freeze','crys_release_truncate')) THEN RAISE EXCEPTION 'Unexpected remaining guard'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles api_role WHERE api_role.rolname IN ('anon','authenticated','service_role') AND has_schema_privilege(api_role.oid,'crystrack_release_gate','USAGE')) THEN RAISE EXCEPTION 'Private gate grant drift'; END IF;
 END $$;`;
}
function functionsIntact() {
 const source=fs.readFileSync(path.join(folder,'install.sql'),'utf8');
 for(const name of ['deny','deny_task_event','attach','new_table']) {
  const body=source.match(new RegExp('CREATE FUNCTION crystrack_release_gate\\.'+name+'\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;'))?.[1];
  if(!body||sql(`SELECT prosrc FROM pg_proc WHERE oid='crystrack_release_gate.${name}()'::regprocedure`)!==body.trim())throw Error('Gate function body drift');
  const safe=sql(`SELECT prosecdef AND proowner='postgres'::regrole AND proconfig=ARRAY['search_path=""'] AND NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('authenticated',oid,'EXECUTE') AND NOT has_function_privilege('service_role',oid,'EXECUTE') FROM pg_proc WHERE oid='crystrack_release_gate.${name}()'::regprocedure`);
  if(safe!=='t')throw Error('Gate function ownership/security/grant drift');
 }
}
export function action(name) {
 identity();
 const exists=sql("SELECT to_regnamespace('crystrack_release_gate') IS NOT NULL")==='t';
 if(exists)functionsIntact();
 let body=preflightSql();
 if(!exists) {
  if(name!=='enable'&&name!=='preflight')throw Error('Barrier not installed; no state to change');
  if(name==='enable')body+='\n'+fs.readFileSync(path.join(folder,'install.sql'),'utf8');
 }
 if(name==='enable') {
  if(exists)body+=checkSql(sql('SELECT active FROM crystrack_release_gate.state')==='t');
  // Manual attach takes ACCESS EXCLUSIVE locks to drain prior readers/writers.
  body+='\n'+fs.readFileSync(path.join(folder,'enable.sql'),'utf8')+checkSql(true);
 } else if(name==='disable') {
  body+=checkSql(sql('SELECT active FROM crystrack_release_gate.state')==='t');
  body+='\n'+fs.readFileSync(path.join(folder,'disable.sql'),'utf8')+checkSql(false);
 } else if((name==='check'||name==='abort')&&exists) {
  body+=checkSql(sql('SELECT active FROM crystrack_release_gate.state')==='t');
 }
 sql(transaction(body));
 return exists||name==='enable'?sql('SELECT active FROM crystrack_release_gate.state')==='t':false;
}
export function prepare() {
 assertTarget();
 // Never drop/reset a pre-existing database, even one with the expected name.
 raw('CREATE DATABASE '+DATABASE+' TEMPLATE template0',{database:'postgres'});
 sql(`CREATE SCHEMA crystrack_sandbox_identity; REVOKE ALL ON SCHEMA crystrack_sandbox_identity FROM PUBLIC;
 CREATE TABLE crystrack_sandbox_identity.marker(value text,legacy_shape text); INSERT INTO crystrack_sandbox_identity.marker(value) VALUES('ISSUE19-SYNTHETIC-ONLY');
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid $$;
 CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array($1,'/') $$;
 GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;`);
 for(const file of ['0000_initial.sql','0001_product_integrity.sql','0002_adaptive_experience.sql','0003_wealth_intelligence.sql','0004_profile_avatar_storage.sql','0005_intelligence_layer.sql'])sql(fs.readFileSync(path.join(ROOT,'src/db/migrations',file),'utf8'));
 sql('UPDATE crystrack_sandbox_identity.marker SET legacy_shape=('+shape+')');
}
export function destroy() {
 identity();
 raw(`DROP DATABASE ${DATABASE} WITH (FORCE)`,{database:'postgres'});
}
export function localRestSource(info) {
 if(info.Name!=='/supabase_rest_'+PROJECT||info.Config.Labels?.['com.supabase.cli.project']!==PROJECT||!info.NetworkSettings.Networks[NETWORK]||!info.Image?.startsWith('sha256:'))throw Error('Wrong local REST identity');
 const env=Object.fromEntries(info.Config.Env.map(e=>{const i=e.indexOf('=');return [e.slice(0,i),e.slice(i+1)];}));
 const uri=new URL(env.PGRST_DB_URI);
 if(!['postgres:','postgresql:'].includes(uri.protocol)||uri.hostname!==DB||uri.port!=='5432'||uri.pathname!=='/postgres'||uri.username!=='authenticator'||uri.search||uri.hash)throw Error('Non-local or overridden REST database target');
 if(!env.PGRST_JWT_SECRET)throw Error('Missing local REST key');
 return {env,uri};
}
export function startRest() {
 identity();
 const info=JSON.parse(docker(['inspect','supabase_rest_'+PROJECT]).stdout)[0];
 const {env,uri}=localRestSource(info);uri.pathname='/'+DATABASE;
 const args=['run','-d','--name',REST,'--label','com.crystrack.release=issue19','--network',NETWORK,'-p',`127.0.0.1:${PORT}:3000`];
 for(const [key,value] of Object.entries({PGRST_DB_URI:uri.href,PGRST_JWT_SECRET:env.PGRST_JWT_SECRET,PGRST_DB_ANON_ROLE:'anon',PGRST_DB_SCHEMAS:'public',PGRST_DB_CHANNEL_ENABLED:'true'})){
  if(!value)throw Error('Missing local REST prerequisite');args.push('-e',key+'='+value);
 }
 docker([...args,info.Image]);
}
export function stopRest() {
 const found=docker(['inspect',REST],undefined,true);if(found.status!==0)return;
 if(JSON.parse(found.stdout)[0].Config.Labels?.['com.crystrack.release']!=='issue19')throw Error('Wrong REST target');
 docker(['rm','-f',REST]);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try {
  const mode=parseAction(process.argv.slice(2));
  let state='not installed';
  if(mode==='prepare')prepare();else if(mode==='destroy')destroy();else state=action(mode)?'ACTIVE':'INACTIVE';
  console.log('Local synthetic barrier action completed:',mode,'state:',state);
 }catch{console.error('Local synthetic barrier stopped. Verify target, schema, guard integrity and prerequisites; no remote fallback.');process.exitCode=1;}
}
