import { Router } from 'express';
import { config, discordOAuthEnabled } from '../config.js';
import { getPermissions } from '../userRegistry.js';
import { reqGuild } from '../auth.js';

export default function meRoutes() {
  const router = Router();

  router.get('/', (req, res) => {
    const user = req.session?.user || null;
    // Live, PER-SERVER permissions for the currently active server (Session).
    const permissions = user
      ? (config.devAuthBypass
          ? { controlBot: true, restartBot: true, startStop: true, soundLibrary: true, settings: true, userManagement: true, botModules: true }
          : getPermissions(user.id, reqGuild(req)))
      : null;
    res.json({
      user: user ? { ...user, permissions } : null,
      activeGuild: reqGuild(req),
      authConfigured: discordOAuthEnabled(),
      restartEnabled: config.dockerRestartEnabled,
    });
  });

  return router;
}
