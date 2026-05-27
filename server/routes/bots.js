import { Router } from 'express';
import { botIds, hasBot, botStatus, botFetch } from '../botClient.js';
import { restartContainer } from '../docker.js';

export default function botsRoutes() {
  const router = Router();

  router.get('/', async (req, res) => {
    const statuses = await Promise.all(botIds().map(async (bot) => [bot, await botStatus(bot)]));
    res.json(Object.fromEntries(statuses));
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
