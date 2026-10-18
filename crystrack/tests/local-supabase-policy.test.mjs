import test from 'node:test';
import assert from 'node:assert/strict';
import { localAction, localEnvironment, assertLocalContainer, assertLoopbackPorts, assertLoopback, PROJECT } from '../scripts/local-supabase-policy.mjs';

test('local scripts reject all remote flags, arbitrary actions and argument passthrough', () => {
  for (const args of [[], ['link'], ['reset', '--linked'], ['reset', '--db-url', 'postgres://example.invalid'],
    ['start', '--workdir', '/tmp'], ['stop', '--project-id', 'hosted'], ['reset', '--local'], ['--help']]) {
    assert.throws(() => localAction(args));
  }
  for (const action of ['start', 'stop', 'reset', 'test', 'dev']) assert.equal(localAction([action]), action);
});

test('remote credentials, URLs, Docker contexts and tokens are not inherited', () => {
  const env = localEnvironment({ PATH: '/bin', DATABASE_URL: 'not-used', SUPABASE_ACCESS_TOKEN: 'not-used',
    SUPABASE_SERVICE_ROLE_KEY: 'not-used', NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid',
    DOCKER_HOST: 'tcp://example.invalid', DOCKER_CONTEXT: 'remote', VERCEL_TOKEN: 'not-used', PGHOST: 'example.invalid' });
  assert.deepEqual(env, { PATH: '/bin', DOCKER_HOST: 'unix:///var/run/docker.sock', SUPABASE_INTERNAL_IMAGE_REGISTRY: 'docker.io' });
});

test('only the dedicated CLI container and loopback ports are accepted', () => {
  const container = { Name: '/supabase_db_' + PROJECT, Config: { Labels: { 'com.supabase.cli.project': PROJECT } }, HostConfig: { NetworkMode: 'local' } };
  assert.doesNotThrow(() => assertLocalContainer(container));
  assert.throws(() => assertLocalContainer({ ...container, Name: '/other-db' }));
  assert.throws(() => assertLocalContainer({ ...container, Config: { Labels: {} } }));
  assert.throws(() => assertLocalContainer({ ...container, HostConfig: { NetworkMode: 'host' } }));
  const ports = (ip) => [{ NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: ip }] } } }];
  assert.doesNotThrow(() => assertLoopbackPorts(ports('127.0.0.1')));
  assert.throws(() => assertLoopbackPorts(ports('0.0.0.0')));
  assert.throws(() => assertLoopbackPorts(ports('::')));
});

test('local HTTP clients cannot target hosted services or other local ports', () => {
  assert.doesNotThrow(() => assertLoopback('http://127.0.0.1:54321', 54321));
  for (const url of ['https://example.invalid', 'http://localhost:54321', 'http://127.0.0.1:54322', 'https://127.0.0.1:54321', 'http://127.0.0.1:54321/other']) {
    assert.throws(() => assertLoopback(url, 54321));
  }
});
