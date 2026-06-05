// Container restart via the Docker socket. The botboard container needs
// /var/run/docker.sock mounted read/write — see docker-compose.yml.

import Docker from 'dockerode';
import { config } from './config.js';
import { botConfigs, botContainer } from './botRegistry.js';

let docker = null;
const statsStreams = new Map();

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

function formatMemory(bytes, precision = 2) {
  const value = Math.max(0, Number(bytes) || 0);
  const gib = value / (1024 ** 3);
  if (gib >= 0.1) return `${gib.toFixed(precision)} GiB`;
  return `${Math.round(value / (1024 ** 2))} MiB`;
}

function fmtUptime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  return h ? `${h}h ${m}m` : `${m}m`;
}

// Match Unraid's container overview: the container's share of the machine's
// total CPU capacity. This stays directly comparable to Unraid's percentage.
function containerCpuPercent(cur) {
  const c = cur?.cpu_stats;
  const p = cur?.precpu_stats;
  if (!c?.cpu_usage || !p?.cpu_usage) return null;
  const currentCpu = Number(c.cpu_usage.total_usage);
  const previousCpu = Number(p.cpu_usage.total_usage);
  const currentSystem = Number(c.system_cpu_usage);
  const previousSystem = Number(p.system_cpu_usage);
  if (![currentCpu, previousCpu, currentSystem, previousSystem].every(Number.isFinite)) return null;
  const cpuDelta = currentCpu - previousCpu;
  const sysDelta = currentSystem - previousSystem;
  if (sysDelta <= 0 || cpuDelta < 0) return 0;
  return (cpuDelta / sysDelta) * 100;
}

function hasCpuSample(stats) {
  return containerCpuPercent(stats) != null;
}

async function liveContainerStats(name, container) {
  const existing = statsStreams.get(name);
  if (existing?.sample && hasCpuSample(existing.sample)) return existing.sample;
  if (existing?.ready) return existing.ready;

  let resolveReady;
  let rejectReady;
  const entry = {
    sample: existing?.sample || null,
    ready: new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    }),
  };
  const ready = entry.ready;
  statsStreams.set(name, entry);

  try {
    const stream = await container.stats({ stream: true });
    entry.stream = stream;
    let buffer = '';

    stream.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          const sample = JSON.parse(line);
          entry.sample = sample;
          if (entry.ready && hasCpuSample(sample)) {
            resolveReady(sample);
            entry.ready = null;
          }
        } catch {
          // Ignore an incomplete frame; the next Docker stats frame is complete.
        }
      }
    });

    const reset = (error) => {
      if (statsStreams.get(name) !== entry) return;
      statsStreams.delete(name);
      if (entry.ready) rejectReady(error || new Error(`stats stream ended for ${name}`));
    };
    stream.once('error', reset);
    stream.once('end', () => reset());
    stream.once('close', () => reset());
  } catch (error) {
    statsStreams.delete(name);
    rejectReady(error);
  }

  return ready;
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
    // Keep one Docker stats stream per container, like Unraid's live view.
    // Requests then use the latest complete one-second sample immediately.
    const cur = await liveContainerStats(info.Id || name, container);
    cpu = containerCpuPercent(cur);
    // Unraid shows the container's cgroup usage including filesystem cache.
    memUsed = cur?.memory_stats?.usage || 0;
    memLimit = cur?.memory_stats?.limit || 0;
  }
  const up = info.State?.StartedAt ? Date.now() - new Date(info.State.StartedAt).getTime() : NaN;
  const display = (info.Name || name).replace(/^\//, '');
  return {
    cards: [
      { key: 'status', label: 'Status', value: info.State?.Status || 'unknown' },
      { key: 'cpu', label: 'Container CPU', value: cpu == null ? '-' : `${cpu.toFixed(2)} %` },
      { key: 'mem', label: 'Memory', value: memLimit ? `${formatMemory(memUsed, 3)} / ${formatMemory(memLimit, 2)}` : formatMemory(memUsed, 3) },
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
