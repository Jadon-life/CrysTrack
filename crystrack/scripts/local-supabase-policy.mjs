/** No caller-controlled CLI passthrough, remote credentials, workdirs or Docker endpoints. */
export const PROJECT = 'crystrack-local-free';
export const NETWORK = 'crystrack-local-free-network';
export const DOCKER_SOCKET = 'unix:///var/run/docker.sock';
export const ACTIONS = ['start', 'stop', 'reset', 'test', 'dev'];

export function localAction(args) {
  if (args.length !== 1 || !ACTIONS.includes(args[0])) {
    throw new Error('Use exactly one local action: start, stop, reset, test, dev. No flags or remote targets allowed.');
  }
  return args[0];
}

export function localEnvironment(parent) {
  const env = {};
  // Credentials and remote Docker/Supabase configuration are never inherited.
  for (const key of ['PATH', 'TMPDIR', 'LANG', 'SYSTEMROOT', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY']) {
    if (parent[key]) env[key] = parent[key];
  }
  env.DOCKER_HOST = DOCKER_SOCKET;
  // Official Docker Hub mirror; avoids the cloud workspace's blocked public ECR.
  env.SUPABASE_INTERNAL_IMAGE_REGISTRY = 'docker.io';
  return env;
}

export function assertLoopback(value, port) {
  const url = new URL(value);
  if (url.hostname !== '127.0.0.1' || Number(url.port) !== port || url.protocol !== 'http:' ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Only the fixed local Supabase HTTP endpoint is allowed');
  }
}

export function assertLocalContainer(container) {
  if (container.Name !== '/supabase_db_' + PROJECT ||
      container.Config.Labels?.['com.supabase.cli.project'] !== PROJECT) {
    throw new Error('Refusing a container outside the dedicated local project');
  }
  if (container.HostConfig.NetworkMode === 'host') throw new Error('Host networking is forbidden');
}

export function assertLoopbackPorts(containers) {
  for (const container of containers) {
    for (const bindings of Object.values(container.NetworkSettings.Ports || {})) {
      for (const binding of bindings || []) {
        if (binding.HostIp !== '127.0.0.1' && binding.HostIp !== '::1') {
          throw new Error('Local services must bind only to loopback');
        }
      }
    }
  }
}
