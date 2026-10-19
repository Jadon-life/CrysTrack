import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  PROJECT, NETWORK, DOCKER_SOCKET, localAction, localEnvironment,
  assertLocalContainer, assertLoopbackPorts, assertLoopback,
} from './local-supabase-policy.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE = path.join(ROOT, '.local-supabase');
const CLI = path.join(STATE, 'bin/supabase');
const env = localEnvironment(process.env);
const DB = 'supabase_db_' + PROJECT;

function run(command, args, input, allowFailure = false) {
  const result = spawnSync(command, args, { cwd: ROOT, env, input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error || (result.status !== 0 && !allowFailure)) {
    // CLI status/error output may include LOCAL keys; keep it private, never print it.
    fs.mkdirSync(STATE, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(STATE, 'last-command.log'), (result.stdout || '') + (result.stderr || ''), { mode: 0o600 });
    throw new Error(`${path.basename(command)} failed (exit ${result.status}); inspect .local-supabase/last-command.log locally; do not publish it.`);
  }
  return result;
}

export const docker = (args, input, allowFailure = false) => run('docker', ['--host', DOCKER_SOCKET, ...args], input, allowFailure);
const cli = (args) => run(CLI, [...args, '--workdir', ROOT, '--network-id', NETWORK]);

export function assertTarget() {
  if (fs.existsSync(path.join(ROOT, 'supabase/.temp/project-ref'))) throw new Error('Linked project state is forbidden; no action performed');
  const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8');
  if (!config.includes(`project_id = "${PROJECT}"`) || /env\(/.test(config)) throw new Error('Unexpected local configuration');
  const info = JSON.parse(docker(['inspect', DB]).stdout)[0];
  assertLocalContainer(info);
  const ids = docker(['ps', '-aq', '--filter', `label=com.supabase.cli.project=${PROJECT}`]).stdout.trim().split(/\s+/).filter(Boolean);
  assertLoopbackPorts(JSON.parse(docker(['inspect', ...ids]).stdout));
}

/** SQL can only reach the checked local container, never DATABASE_URL or a CLI URL flag. */
export function localSql(sql) {
  assertTarget();
  return docker(['exec', '-i', DB, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], sql).stdout.trim();
}

function bootstrap() {
  // A separate local-only hash ledger; neither Drizzle nor Supabase migration history is fabricated.
  localSql(`CREATE SCHEMA IF NOT EXISTS crystrack_local_control;
    REVOKE ALL ON SCHEMA crystrack_local_control FROM PUBLIC;
    CREATE TABLE IF NOT EXISTS crystrack_local_control.applied(name text PRIMARY KEY, hash text NOT NULL);
    CREATE TABLE IF NOT EXISTS crystrack_local_control.pending(name text PRIMARY KEY);`);
  if (localSql('SELECT name FROM crystrack_local_control.pending LIMIT 1;')) {
    throw new Error('Interrupted local bootstrap; inspect logs and use local:reset explicitly');
  }
  const folder = path.join(ROOT, 'src/db/migrations');
  const names = ['0000_initial.sql', '0001_product_integrity.sql', '0002_adaptive_experience.sql',
    '0003_wealth_intelligence.sql', '0004_profile_avatar_storage.sql', '0005_intelligence_layer.sql', '0013_daily_records.sql', '0014_daily_http_conflicts.sql', '0015_sep28_crystal_shards.sql', '0016_assignment_lifecycle.sql', '0017_task_week_grid.sql'];
  for (const name of names) {
    const sql = fs.readFileSync(path.join(folder, name), 'utf8');
    const hash = createHash('sha256').update(sql).digest('hex');
    const old = localSql(`SELECT hash FROM crystrack_local_control.applied WHERE name='${name}';`);
    if (old && old !== hash) throw new Error('Historical migration changed; inspect and reset LOCAL data explicitly');
    if (!old) {
      localSql(`INSERT INTO crystrack_local_control.pending VALUES('${name}');`);
      // uuid-ossp is installed in extensions by Supabase; legacy SQL calls it unqualified.
      localSql('SET search_path=public,extensions;\n' + sql);
      localSql(`BEGIN; INSERT INTO crystrack_local_control.applied VALUES('${name}','${hash}');
        DELETE FROM crystrack_local_control.pending WHERE name='${name}'; COMMIT;`);
    }
  }
  localSql(fs.readFileSync(path.join(ROOT, 'supabase/local/seed.sql'), 'utf8'));
  // Reviewed only as a local contract experiment, deliberately outside both migration runners.
  localSql(fs.readFileSync(path.join(ROOT, 'supabase/drafts/daily-records.sql'), 'utf8'));
}

function saveLocalKeys() {
  const status = JSON.parse(cli(['status', '--output', 'json']).stdout);
  assertLoopback(status.API_URL, 54321);
  const values = {
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_SECRET_KEY: '',
  };
  if (!values.NEXT_PUBLIC_SUPABASE_ANON_KEY || !values.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing local CLI keys');
  fs.writeFileSync(path.join(STATE, 'app-env.json'), JSON.stringify(values), { mode: 0o600 });
}

export function readLocalKeys() {
  assertTarget();
  const values = JSON.parse(fs.readFileSync(path.join(STATE, 'app-env.json'), 'utf8'));
  assertLoopback(values.NEXT_PUBLIC_SUPABASE_URL, 54321);
  return values;
}

function main(args) {
  const action = localAction(args); // Reject every caller flag BEFORE any subprocess.
  if (!fs.existsSync(CLI)) throw new Error('Run npm run local:install first');
  if (fs.existsSync(path.join(ROOT, 'supabase/.temp/project-ref'))) throw new Error('Linked project state is forbidden');
  fs.mkdirSync(STATE, { recursive: true, mode: 0o700 });
  fs.chmodSync(STATE, 0o700);
  if (action === 'start') {
    const driver = docker(['info', '--format', '{{.Driver}}']).stdout.trim();
    if (driver === 'vfs' && docker(['image', 'inspect', 'supabase/postgres:15.8.1.085'], undefined, true).status !== 0) {
      throw new Error('Docker vfs needs the lower-disk image cache first: npm run local:prepare-vfs');
    }
    const found = docker(['network', 'inspect', NETWORK], undefined, true);
    if (found.status !== 0) {
      docker(['network', 'create', '--label', `com.crystrack.local=${PROJECT}`,
        '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', NETWORK]);
    }
    const network = JSON.parse(docker(['network', 'inspect', NETWORK]).stdout)[0];
    if (network.Internal || network.Options?.['com.docker.network.bridge.host_binding_ipv4'] !== '127.0.0.1' ||
        network.Labels?.['com.crystrack.local'] !== PROJECT) throw new Error('Unexpected Docker network');
    cli(['start', '--exclude', 'realtime,imgproxy,studio,postgres-meta,edge-runtime,logflare,vector,supavisor']);
    try { assertTarget(); }
    catch (error) { cli(['stop']); throw error; }
    bootstrap();
    saveLocalKeys();
    console.log('Local Supabase ready on loopback. Synthetic data only; keys saved privately, never printed.');
  } else if (action === 'stop') {
    assertTarget();
    cli(['stop']);
    console.log('Stopped the dedicated local stack; local volumes retained.');
  } else if (action === 'reset') {
    assertTarget();
    cli(['db', 'reset', '--local', '--no-seed']);
    bootstrap();
    saveLocalKeys();
    console.log('Reset and reseeded only the dedicated local Docker database.');
  } else if (action === 'test') {
    assertTarget();
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', 'tests/local-supabase.integration.mjs', 'tests/daily-records.integration.mjs', 'tests/crystals.integration.mjs', 'tests/assignments.integration.mjs', 'tests/week-grid.integration.mjs'], { cwd: ROOT, env, stdio: 'inherit' });
    if (result.status !== 0) process.exitCode = 1;
  } else if (action === 'dev') {
    const values = readLocalKeys();
    // Defined empty values outrank .env.local; no hosted integration binding can leak in.
    const names = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8').split('\n')
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line)).map((line) => line.split('=')[0]);
    const blank = Object.fromEntries(names.map((name) => [name, '']));
    const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3000'], {
      cwd: ROOT, env: { ...env, ...blank, ...values, NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3000' }, stdio: 'inherit',
    });
    const stop = (signal) => child.kill(signal);
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    child.on('error', () => { console.error('Local Next server could not start'); process.exitCode = 1; });
    child.on('exit', (code, signal) => {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
      process.exitCode = signal ? 1 : code || 0;
    });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
