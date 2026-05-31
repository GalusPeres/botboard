import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { listUsers, setPermissions, recordUser } from '../userRegistry.js';
import { botIds, botBaseUrl, botAuthHeader } from '../botClient.js';

export default function usersRoutes() {
  const router = Router();

  router.use(requireAdmin);

  router.get('/', (req, res) => {
    try {
      res.json(listUsers());
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Pre-register a user before they log in.
  router.post('/', (req, res) => {
    try {
      const { id, username, global_name, avatar } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      recordUser({ id, username: username || id, global_name: global_name || username || id, avatar: avatar || null });
      const users = listUsers();
      res.status(201).json(users.find((u) => u.id === id) || { id });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Update individual permissions for a user.
  router.patch('/:id/permissions', (req, res) => {
    try {
      res.json(setPermissions(req.params.id, req.body || {}));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Fetch guild members from the first available bot.
  router.get('/guild-members/:guildId', async (req, res) => {
    const bot = botIds()[0];
    if (!bot) return res.status(503).json({ error: 'no bot available' });
    try {
      const url = `${botBaseUrl(bot)}/api/guilds/${req.params.guildId}/members`;
      const auth = botAuthHeader();
      const upstream = await fetch(url, {
        headers: auth ? { authorization: auth } : {},
        signal: AbortSignal.timeout(5000),
      });
      const data = await upstream.json();
      if (!upstream.ok) return res.status(upstream.status).json(data);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  return router;
}
