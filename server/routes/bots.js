import { Router } from 'express';
import { botIds, hasBot, botStatus, botFetch } from '../botClient.js';
import { restartContainer, stopContainer, startContainer, containerStatus, containerStats, containerLogs } from '../docker.js';
import { botConfig, deleteRegistryBot, registrySnapshot, upsertRegistryBot, reorderRegistryBot, setRegistryOrder } from '../botRegistry.js';
import { config } from '../config.js';
import { requireAdmin, requirePermission, userAllowedInGuild } from '../auth.js';
import { logActivity } from '../activityLog.js';
import { refreshPresence } from '../discordGateway.js';
import { botTokenConfigured, fetchBotGuildIds } from '../discordBot.js';

// Bot-Presence sofort aktualisieren, wenn ein Modul über Botboard gestartet/
// gestoppt wird. Zweiter, verzögerter Refresh fängt HTTP-Bots ab, deren API
// erst ein paar Sekunden nach dem Container-Start wieder erreichbar ist.
function bumpPresence() {
  refreshPresence().catch(() => {});
  setTimeout(() => refreshPresence().catch(() => {}), 4000);
}

// A module with a container name but NO API URL is managed purely via the
// Docker socket (raw container / gameserver) — its pages are synthesized here.
function isContainerModule(bot) {
  const cfg = botConfig(bot);
  return !!(cfg && cfg.container && !cfg.url);
}

function containerManifest(bot) {
  const cfg = botConfig(bot);
  const name = cfg?.name?.trim() || bot;
  return {
    apiVersion: 1,
    id: bot,
    type: 'container',
    name,
    displayName: name,
    description: 'Docker container',
    icon: 'server',
    capabilities: ['stats', 'logs', 'settings'],
    pages: [
      { id: 'stats',    label: 'Statistics', icon: 'stats',    kind: 'stats' },
      { id: 'logs',     label: 'Live Logs',  icon: 'logs',     kind: 'container-logs' },
      { id: 'settings', label: 'Settings',   icon: 'settings', kind: 'settings' },
    ],
  };
}

function configuredName(bot) {
  const cfg = botConfig(bot);
  if (cfg?.source !== 'registry') return '';
  return cfg?.name?.trim() || '';
}

function withConfiguredName(bot, status) {
  const name = configuredName(bot);
  if (!name) return status;
  return {
    ...status,
    name,
    bot: {
      ...(status?.bot || {}),
      displayName: name,
    },
  };
}

function withConfiguredManifestName(bot, manifest) {
  const name = configuredName(bot);
  if (!name || !manifest) return manifest;
  return {
    ...manifest,
    name,
    displayName: name,
    bot: manifest.bot ? { ...manifest.bot, displayName: name } : manifest.bot,
  };
}

function fallbackManifest(bot, status) {
  return {
    apiVersion: 1,
    id: bot,
    type: bot,
    name: status?.name || bot,
    displayName: status?.bot?.displayName || status?.bot?.username || status?.bot?.tag?.replace(/#\d+$/, '') || status?.name || bot,
    description: 'Configured bot module',
    icon: bot,
    bot: status?.bot || null,
    capabilities: ['status', 'guilds'],
    pages: [],
    endpoints: {
      status: '/api/status',
      guilds: '/api/guilds',
    },
  };
}

function normaliseProbeUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid protocol');
    return parsed.toString().replace(/\/$/, '');
  } catch {
    const error = new Error('bot url must be a valid http(s) URL');
    error.status = 400;
    throw error;
  }
}

async function probeBotUrl(rawUrl) {
  const baseUrl = normaliseProbeUrl(rawUrl);
  const headers = { Accept: 'application/json' };
  if (config.botApiToken) headers.Authorization = `Bearer ${config.botApiToken}`;

  async function read(path) {
    const res = await fetch(`${baseUrl}${path}`, { headers, signal: AbortSignal.timeout(3000) });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const error = new Error(data?.error || `probe returned ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return data;
  }

  const [manifest, status] = await Promise.all([
    read('/api/manifest').catch(() => null),
    read('/api/status'),
  ]);
  return {
    ok: true,
    url: baseUrl,
    manifest,
    status,
    displayName: manifest?.displayName || status?.bot?.displayName || status?.bot?.username || status?.name || baseUrl,
  };
}

export default function botsRoutes() {
  const router = Router();

  router.get('/', async (req, res) => {
    const statuses = await Promise.all(botIds().map(async (bot) => {
      const status = isContainerModule(bot)
        ? await containerStatus(bot).catch((err) => ({ online: false, error: err.message }))
        : await botStatus(bot);
      return [bot, withConfiguredName(bot, status)];
    }));
    res.json(Object.fromEntries(statuses));
  });

  router.get('/modules', async (req, res) => {
    const snapshot = registrySnapshot();
    const orderedIds = snapshot.bots.map((b) => b.id);
    const modules = await Promise.all(
      orderedIds.map(async (bot) => {
        if (isContainerModule(bot)) {
          const status = await containerStatus(bot).catch((err) => ({ online: false, error: err.message }));
          return {
            id: bot,
            visible: botConfig(bot)?.enabled !== false,
            online: status.online,
            status: withConfiguredName(bot, status),
            manifest: withConfiguredManifestName(bot, containerManifest(bot)),
          };
        }
        const [status, manifest] = await Promise.all([
          botStatus(bot),
          botFetch(bot, '/api/manifest', { timeout: 3000 }).catch(() => null),
        ]);
        return {
          id: bot,
          visible: botConfig(bot)?.enabled !== false,
          online: status.online,
          status: withConfiguredName(bot, status),
          manifest: withConfiguredManifestName(bot, manifest || fallbackManifest(bot, status)),
        };
      })
    );
    res.json(modules);
  });

  router.get('/registry', requirePermission('botModules'), (req, res) => {
    try {
      res.json(registrySnapshot());
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.post('/registry/reorder', requirePermission('botModules'), (req, res) => {
    try {
      const { id, direction, order } = req.body || {};
      if (Array.isArray(order)) {
        setRegistryOrder(order);
      } else {
        if (!id || !['up', 'down'].includes(direction)) {
          return res.status(400).json({ error: 'id and direction (up|down) required, or order array' });
        }
        reorderRegistryBot(id, direction);
      }
      res.json(registrySnapshot());
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.post('/registry/test', requirePermission('botModules'), async (req, res) => {
    try {
      res.json(await probeBotUrl(req.body?.url));
    } catch (err) {
      res.status(err.status || 502).json({ error: err.message });
    }
  });

  router.post('/registry', requirePermission('botModules'), (req, res) => {
    try {
      const { id, ...input } = req.body || {};
      const bot = upsertRegistryBot(id, input);
      res.status(201).json(bot);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.put('/registry/:bot', requirePermission('botModules'), (req, res) => {
    try {
      const bot = upsertRegistryBot(req.params.bot, req.body || {});
      res.json(bot);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.delete('/registry/:bot', requirePermission('botModules'), (req, res) => {
    try {
      res.json(deleteRegistryBot(req.params.bot));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.post('/:bot/restart', requirePermission('restartBot'), async (req, res) => {
    const { bot } = req.params;
    if (!hasBot(bot)) return res.status(400).json({ error: 'unknown bot' });
    try {
      const result = await restartContainer(bot);
      const who = req.session?.user?.global_name || req.session?.user?.username || 'unknown';
      logActivity(`${who} → Bot neugestartet: ${bot}`);
      bumpPresence();
      res.json(result);
    } catch (err) {
      console.error('[restart]', err);
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.post('/:bot/stop', requirePermission('startStop'), async (req, res) => {
    const { bot } = req.params;
    if (!hasBot(bot)) return res.status(400).json({ error: 'unknown bot' });
    try {
      const result = await stopContainer(bot);
      const who = req.session?.user?.global_name || req.session?.user?.username || 'unknown';
      logActivity(`${who} → Bot gestoppt: ${bot}`);
      bumpPresence();
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.post('/:bot/start', requirePermission('startStop'), async (req, res) => {
    const { bot } = req.params;
    if (!hasBot(bot)) return res.status(400).json({ error: 'unknown bot' });
    try {
      const result = await startContainer(bot);
      const who = req.session?.user?.global_name || req.session?.user?.username || 'unknown';
      logActivity(`${who} → Bot gestartet: ${bot}`);
      bumpPresence();
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Container-Module: Stats/Logs aus dem Docker-Socket. HTTP-Bots fallen per
  // next() durch zum generischen Proxy (unverändertes Verhalten).
  router.get('/:bot/stats', async (req, res, next) => {
    if (!isContainerModule(req.params.bot)) return next();
    try {
      res.json(await containerStats(req.params.bot));
    } catch (err) {
      res.status(err.status || 502).json({ error: err.message });
    }
  });

  router.get('/:bot/logs/tail', async (req, res, next) => {
    if (!isContainerModule(req.params.bot)) return next();
    try {
      const tail = Math.min(2000, Number(req.query.tail) || 300);
      res.json({ lines: await containerLogs(req.params.bot, tail) });
    } catch (err) {
      res.status(err.status || 502).json({ error: err.message });
    }
  });

  // Container haben (noch) keine editierbare Config (Env kommt später) → leeres
  // Schema, damit die Settings-Seite sauber „No configuration available" zeigt
  // statt eines Proxy-Fehlers. HTTP-Bots fallen per next() zum Proxy durch.
  router.get('/:bot/settings/schema', (req, res, next) => {
    if (!isContainerModule(req.params.bot)) return next();
    res.json({ sections: [] });
  });
  router.get('/:bot/settings', (req, res, next) => {
    if (!isContainerModule(req.params.bot)) return next();
    res.json({});
  });

  router.get('/servers', async (req, res) => {
    try {
      const guildLists = await Promise.all(
        botIds().map(async (bot) => [bot, await botFetch(bot, '/api/guilds').catch(() => [])])
      );
      const byId = new Map();
      for (const [bot, guilds] of guildLists) {
        for (const guild of guilds) {
          if (!byId.has(guild.id)) byId.set(guild.id, { ...guild, bots: [] });
          byId.get(guild.id).bots.push(bot);
        }
      }
      let guilds = [...byId.values()];

      if (req.session?.userGuilds?.length) {
        const userSet = new Set(req.session.userGuilds);
        guilds = guilds.filter((g) => userSet.has(g.id));
      }

      // Botboard-Bot muss im Server sein. Nur so funktionieren Rollen-Gate und
      // Mitglieder-Filter zuverlässig. Ohne Token: kein Filter (Botboard ist
      // noch nicht als Bot eingerichtet). Discord-Ausfall: nicht filtern.
      if (botTokenConfigured()) {
        const botGuilds = await fetchBotGuildIds().catch(() => null);
        if (botGuilds) guilds = guilds.filter((g) => botGuilds.has(g.id));
      }

      // Pro-Server-Rollen-Gate: rollen-geschützte Server nur zeigen, wenn der
      // User dort die Pflichtrolle hat (sonst gar nicht auswählbar).
      const userId = req.session?.user?.id;
      if (userId) {
        const ok = await Promise.all(guilds.map((g) => userAllowedInGuild(userId, g.id)));
        guilds = guilds.filter((_, i) => ok[i]);
      }

      res.json(guilds);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
