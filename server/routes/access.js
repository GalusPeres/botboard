import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { getGuildAccess, setGuildAccess } from '../accessRegistry.js';
import { botTokenConfigured, fetchBotGuildIds, fetchGuildRoles } from '../discordBot.js';
import { logActivity } from '../activityLog.js';

export default function accessRoutes() {
  const router = Router();
  router.use(requireAdmin);

  // Zugangs-Status + Rollen-Dropdown für einen Server.
  router.get('/:guildId', async (req, res) => {
    const { guildId } = req.params;
    const current = getGuildAccess(guildId);
    if (!botTokenConfigured()) {
      return res.json({ tokenConfigured: false, botInGuild: false, roles: [], ...current });
    }
    try {
      const botGuilds = await fetchBotGuildIds();
      const botInGuild = botGuilds.has(guildId);
      const roles = botInGuild ? await fetchGuildRoles(guildId) : [];
      res.json({ tokenConfigured: true, botInGuild, roles, ...current });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // Pflichtrolle für einen Server setzen/entfernen.
  router.put('/:guildId', (req, res) => {
    try {
      const { requiredRoleId = '', requiredRoleName = '' } = req.body || {};
      const saved = setGuildAccess(req.params.guildId, { requiredRoleId, requiredRoleName });
      const by = req.session?.user?.global_name || req.session?.user?.username || 'admin';
      logActivity(`${by} → Zugang geändert (Server ${req.params.guildId}): ${saved.requiredRoleId ? `Rolle ${saved.requiredRoleName || saved.requiredRoleId}` : 'Mitgliedschaft reicht'}`);
      res.json(saved);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  return router;
}
