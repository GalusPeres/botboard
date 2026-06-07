import { Router } from 'express';
import { config, discordOAuthEnabled } from '../config.js';
import { getPermissions } from '../userRegistry.js';
import { reqGuild, userAllowedInGuild } from '../auth.js';

export default function meRoutes() {
  const router = Router();

  router.get('/', async (req, res) => {
    const user = req.session?.user || null;
    const guildId = reqGuild(req);
    // Live, PER-SERVER permissions for the currently active server.
    const permissions = user
      ? (config.devAuthBypass
          ? { controlBot: true, restartBot: true, startStop: true, soundLibrary: true, fileBrowser: true, settings: true, userManagement: true, botModules: true }
          : getPermissions(user.id, guildId))
      : null;
    // Live-Zugangscheck: ist der User auf dem aktiven Server noch zugelassen?
    // Der Client wirft ihn raus, sobald Rolle/Mitgliedschaft weg ist (ohne Reload).
    let activeGuildAllowed = true;
    if (user && guildId && !config.devAuthBypass) {
      activeGuildAllowed = await userAllowedInGuild(user.id, guildId);
    }
    res.json({
      user: user ? { ...user, permissions } : null,
      activeGuild: guildId,
      activeGuildAllowed,
      authConfigured: discordOAuthEnabled(),
      restartEnabled: config.dockerRestartEnabled,
    });
  });

  return router;
}
