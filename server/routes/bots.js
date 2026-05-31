import { Router } from 'express';
import { botIds, hasBot, botStatus, botFetch } from '../botClient.js';
import { restartContainer } from '../docker.js';
import { botConfig, deleteRegistryBot, registrySnapshot, upsertRegistryBot } from '../botRegistry.js';
import { config } from '../config.js';
import { requireAdmin } from '../auth.js';

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
    const statuses = await Promise.all(botIds().map(async (bot) => [bot, withConfiguredName(bot, await botStatus(bot))]));
    res.json(Object.fromEntries(statuses));
  });

  router.get('/modules', async (req, res) => {
    const modules = await Promise.all(
      botIds().map(async (bot) => {
        const [status, manifest] = await Promise.all([
          botStatus(bot),
          botFetch(bot, '/api/manifest', { timeout: 3000 }).catch(() => null),
        ]);
        return {
          id: bot,
          online: status.online,
          status: withConfiguredName(bot, status),
          manifest: withConfiguredManifestName(bot, manifest || fallbackManifest(bot, status)),
        };
      })
    );
    res.json(modules);
  });

  router.get('/registry', requireAdmin, (req, res) => {
    try {
      res.json(registrySnapshot());
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.post('/registry/test', requireAdmin, async (req, res) => {
    try {
      res.json(await probeBotUrl(req.body?.url));
    } catch (err) {
      res.status(err.status || 502).json({ error: err.message });
    }
  });

  router.post('/registry', requireAdmin, (req, res) => {
    try {
      const { id, ...input } = req.body || {};
      const bot = upsertRegistryBot(id, input);
      res.status(201).json(bot);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.put('/registry/:bot', requireAdmin, (req, res) => {
    try {
      const bot = upsertRegistryBot(req.params.bot, req.body || {});
      res.json(bot);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.delete('/registry/:bot', requireAdmin, (req, res) => {
    try {
      res.json(deleteRegistryBot(req.params.bot));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.post('/:bot/restart', async (req, res) => {
    const { bot } = req.params;
    if (!hasBot(bot)) return res.status(400).json({ error: 'unknown bot' });
    try {
      const result = await restartContainer(bot);
      res.json(result);
    } catch (err) {
      console.error('[restart]', err);
      res.status(err.status || 500).json({ error: err.message });
    }
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
      res.json(guilds);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
