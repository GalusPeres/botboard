import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { listUsers, setPermissions, recordUser } from '../userRegistry.js';
import { botIds, botBaseUrl, botAuthHeader } from '../botClient.js';
import { botTokenConfigured, fetchBotGuildIds, fetchMemberRoleIds } from '../discordBot.js';
import { logActivity } from '../activityLog.js';

export default function usersRoutes() {
  const router = Router();

  router.use(requireAdmin);

  // Nur Mitglieder des aktuell gewählten Servers anzeigen. users.json kennt alle
  // je eingeloggten User board-weit; wer nicht im Server ist, gehört hier nicht
  // hin. Mitgliedschaft wird live über den Bot-Token geprüft. Env-Admins werden
  // immer gezeigt; ohne Bot-Token (oder Bot nicht im Server) wird nicht gefiltert.
  router.get('/', async (req, res) => {
    try {
      const guildId = req.session?.activeGuild;
      let users = listUsers(guildId);
      if (guildId && botTokenConfigured()) {
        const botGuilds = await fetchBotGuildIds().catch(() => new Set());
        if (botGuilds.has(guildId)) {
          const isMember = await Promise.all(users.map(async (u) => {
            if (u.isEnvAdmin) return true;
            try {
              const roles = await fetchMemberRoleIds(guildId, u.id);
              return roles !== null; // null = echtes 404 = nicht im Server
            } catch {
              // Lookup-Fehler (Rate-Limit/Timeout) NICHT als "kein Mitglied"
              // werten, sonst flackern echte Mitglieder rein/raus → drinlassen.
              return true;
            }
          }));
          users = users.filter((_, i) => isMember[i]);
        }
      }
      res.json(users);
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
      const users = listUsers(req.session?.activeGuild);
      res.status(201).json(users.find((u) => u.id === id) || { id });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Update individual permissions for a user.
  router.patch('/:id/permissions', (req, res) => {
    try {
      const result = setPermissions(req.params.id, req.session?.activeGuild, req.body || {});
      const by = req.session?.user?.global_name || req.session?.user?.username || 'admin';
      const target = result.global_name || result.username || req.params.id;
      const changes = Object.entries(req.body || {})
        .map(([k, v]) => `${k}=${v ? 'on' : 'off'}`)
        .join(', ');
      logActivity(`${by} → Rechte (Server ${req.session?.activeGuild}) für ${target}: ${changes}`);
      res.json(result);
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
