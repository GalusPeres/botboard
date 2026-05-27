import { Router } from 'express';
import { config, discordOAuthEnabled } from '../config.js';

export default function meRoutes() {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({
      user: req.session?.user || null,
      authConfigured: discordOAuthEnabled(),
      restartEnabled: config.dockerRestartEnabled,
    });
  });

  return router;
}
