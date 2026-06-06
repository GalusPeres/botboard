import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { getBotboardConfig, setBotboardConfig } from '../botboardConfig.js';
import { botTokenConfigured } from '../discordBot.js';
import { refreshPresence } from '../discordGateway.js';
import { logActivity } from '../activityLog.js';

export default function botboardRoutes() {
  const router = Router();
  router.use(requireAdmin);

  router.get('/', (req, res) => {
    res.json({ ...getBotboardConfig(), tokenConfigured: botTokenConfigured() });
  });

  router.put('/', async (req, res) => {
    try {
      const saved = setBotboardConfig(req.body || {});
      // Status-Änderung sofort übernehmen (sonst erst beim 60s-Refresh).
      refreshPresence().catch(() => {});
      const by = req.session?.user?.global_name || req.session?.user?.username || 'admin';
      logActivity(`${by} → Bot-Einstellungen geändert: prefix="${saved.prefix}", status="${saved.statusText || 'auto'}"`);
      res.json({ ...saved, tokenConfigured: botTokenConfigured() });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  return router;
}
