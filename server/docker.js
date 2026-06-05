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

function requireDocker(bot) {
  if (!config.dockerRestartEnabled) {
    const error = new Error('container restart is disabled; set DOCKER_RESTART_ENABLED=true in Docker');
    error.status = 503;
    throw error;
  }
  const name = botContainer(bot);
  if (!name) throw new Error(`no container configured for bot: ${bot}`);
  return { name, container: client().getContainer(name) };
}

export async function restartContainer(bot) {
  const { name, container } = requireDocker(bot);
  await container.restart({ t: 5 });
  return { container: name, restarted: true };
}

export async function stopContainer(bot) {
  const { name, container } = requireDocker(bot);
  await container.stop({ t: 5 });
  return { container: name, stopped: true };
}

export async function startContainer(bot) {
  const { name, container } = requireDocker(bot);
  await container.start();
  return { container: name, started: true };
}

// --- Read-only container introspection (used by container-type modules) ---
// Diese brauchen den Socket, aber NICHT das Restart-Flag (sie ändern nichts).

function containerHandle(bot) {
  const name = botContainer(bot);
  if (!name) throw new Error(`no container configured for module: ${bot}`);
  return { name, container: client().getContainer(name) };
}

const toMb = (bytes) => Math.round((bytes || 0) / (1024 * 1024));

function fmtUptime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  return h ? `${h}h ${m}m` : `${m}m`;
}

// Return the container's share of the host's total CPU capacity. Docker's CLI
// multiplies this value by the CPU count, which expresses usage in "one core =
// 100%" units and is not directly comparable to Unraid's overall CPU load.
function hostCpuPercentDelta(prev, cur) {
  const c = cur?.cpu_stats;
  const p = prev?.cpu_stats;
  if (!c?.cpu_usage || !p?.cpu_usage) return null;
  const cpuDelta = c.cpu_usage.total_usage - p.cpu_usage.total_usage;
  const sysDelta = c.system_cpu_usage - p.system_cpu_usage;
  if (sysDelta <= 0 || cpuDelta < 0) return 0;
  return (cpuDelta / sysDelta) * 100;
}

// Demux Docker's multiplexed log stream (8-byte frame headers) unless the
// container runs with a TTY (then the buffer is raw text).
function decodeLogs(buffer, tty) {
  if (tty) return buffer.toString('utf8');
  let offset = 0;
  const parts = [];
  while (offset + 8 <= buffer.length) {
    const type = buffer[offset];
    if (type !== 1 && type !== 2) return buffer.toString('utf8'); // not framed → raw
    const len = buffer.readUInt32BE(offset + 4);
    parts.push(buffer.toString('utf8', offset + 8, offset + 8 + len));
    offset += 8 + len;
  }
  return parts.join('');
}

export async function containerStatus(bot) {
  const { container } = containerHandle(bot);
  const info = await container.inspect();
  return {
    online: !!info.State?.Running,
    state: info.State?.Status || 'unknown',
    startedAt: info.State?.StartedAt || null,
  };
}

export async function containerStats(bot) {
  const { name, container } = containerHandle(bot);
  const info = await container.inspect();
  const running = !!info.State?.Running;
  let cpu = null;
  let memUsed = 0;
  let memLimit = 0;
  if (running) {
    // Two samples ~1s apart for an accurate CPU% (matches `docker stats`).
    const prev = await container.stats({ stream: false });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const cur = await container.stats({ stream: false });
    cpu = hostCpuPercentDelta(prev, cur);
    // Docker's reported memory excludes the page cache (inactive_file).
    const cache = cur?.memory_stats?.stats?.inactive_file ?? cur?.memory_stats?.stats?.cache ?? 0;
    memUsed = Math.max(0, (cur?.memory_stats?.usage || 0) - cache);
    memLimit = cur?.memory_stats?.limit || 0;
  }
  const up = info.State?.StartedAt ? Date.now() - new Date(info.State.StartedAt).getTime() : NaN;
  const display = (info.Name || name).replace(/^\//, '');
  return {
    cards: [
      { key: 'status', label: 'Status', value: info.State?.Status || 'unknown' },
      { key: 'cpu', label: 'Host CPU', value: cpu == null ? '-' : `${cpu.toFixed(1)} %` },
      { key: 'mem', label: 'Memory', value: memLimit ? `${toMb(memUsed)} / ${toMb(memLimit)} MB` : `${toMb(memUsed)} MB` },
      { key: 'uptime', label: 'Uptime', value: running ? fmtUptime(up) : '-' },
    ],
    health: [
      { key: 'container', label: display, status: running ? 'ok' : 'warn', detail: info.State?.Status || '' },
    ],
  };
}

export async function containerLogs(bot, tail = 300) {
  const { container } = containerHandle(bot);
  const info = await container.inspect();
  const raw = await container.logs({ stdout: true, stderr: true, tail, timestamps: false, follow: false });
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  return decodeLogs(buffer, info.Config?.Tty).split('\n');
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
