import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { listUsers, setAdminOverride, removeUser, recordUser } from '../userRegistry.js';
import { botIds, botBaseUrl, botAuthHeader } from '../botClient.js';

export default function usersRoutes() {
  const router = Router();

  // All user-management routes are admin-only.
  router.use(requireAdmin);

  router.get('/', (req, res) => {
    try {
      res.json(listUsers());
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Pre-register a user (add them before they log in).
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

  router.patch('/:id', (req, res) => {
    try {
      const { isAdmin } = req.body || {};
      if (typeof isAdmin !== 'boolean') {
        return res.status(400).json({ error: 'isAdmin must be a boolean' });
      }
      res.json(setAdminOverride(req.params.id, isAdmin));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  router.delete('/:id', (req, res) => {
    try {
      res.json(removeUser(req.params.id));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Fetch guild members from the first available bot (for the member picker UI).
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
