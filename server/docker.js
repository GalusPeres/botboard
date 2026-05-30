// Container restart via the Docker socket. The botboard container needs
// /var/run/docker.sock mounted read/write — see docker-compose.yml.

import Docker from 'dockerode';
import { config } from './config.js';
import { botConfigs, botContainer } from './botRegistry.js';

let docker = null;
function client() {
  if (!docker) docker = new Docker({ socketPath: config.dockerSocket });
  return docker;
}

export async function restartContainer(bot) {
  if (!config.dockerRestartEnabled) {
    const error = new Error('container restart is disabled; set DOCKER_RESTART_ENABLED=true in Docker');
    error.status = 503;
    throw error;
  }
  const name = botContainer(bot);
  if (!name) throw new Error(`no container configured for bot: ${bot}`);
  const container = client().getContainer(name);
  await container.restart({ t: 5 });
  return { container: name, restarted: true };
}

export async function listMatchingContainers() {
  try {
    const all = await client().listContainers({ all: true });
    const names = new Set(Object.values(botConfigs()).map((bot) => bot.container).filter(Boolean));
    return all
      .filter((c) => c.Names.some((n) => names.has(n.replace(/^\//, ''))))
      .map((c) => ({ name: c.Names[0].replace(/^\//, ''), state: c.State, status: c.Status }));
  } catch (err) {
    return { error: err.message };
  }
}
