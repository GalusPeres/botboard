import { Router } from 'express';
import { config, discordOAuthEnabled } from '../config.js';
import { getPermissions } from '../userRegistry.js';

export default function meRoutes() {
  const router = Router();

  router.get('/', (req, res) => {
    const user = req.session?.user || null;
    // Always return live permissions from file, not cached session values.
    const permissions = user
      ? (config.devAuthBypass
          ? { controlBot: true, soundLibrary: true, settings: true, userManagement: true, botModules: true }
          : getPermissions(user.id))
      : null;
    res.json({
      user: user ? { ...user, permissions } : null,
      authConfigured: discordOAuthEnabled(),
      restartEnabled: config.dockerRestartEnabled,
    });
  });

  return router;
}
