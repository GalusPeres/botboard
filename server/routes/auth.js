import { Router } from 'express';
import crypto from 'crypto';
import { buildAuthUrl, exchangeCode, fetchDiscordUser, fetchUserGuilds, isAllowed, userAllowedInGuild } from '../auth.js';
import { recordUser, getPermissions } from '../userRegistry.js';
import { config, discordOAuthEnabled } from '../config.js';
import { logActivity } from '../activityLog.js';

export default function authRoutes() {
  const router = Router();

  router.get('/discord', (req, res) => {
    if (!discordOAuthEnabled()) return res.status(503).json({ error: 'OAuth not enabled' });
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;
    res.redirect(buildAuthUrl(state));
  });

  router.get('/callback', async (req, res) => {
    if (!discordOAuthEnabled()) return res.status(503).send('OAuth not enabled');
    const { code, state, error } = req.query;
    if (error && state === req.session.oauthState) {
      delete req.session.oauthState;
      return res.redirect('/?reauthorize=1');
    }
    if (!code || !state || state !== req.session.oauthState) {
      return res.status(400).send('Invalid OAuth state');
    }
    delete req.session.oauthState;

    try {
      const token = await exchangeCode(code);
      const user = await fetchDiscordUser(token.access_token);
      const guilds = await fetchUserGuilds(token.access_token);
      const guildIds = guilds.map((g) => g.id);

      const access = await isAllowed(user.id, guildIds);
      if (!access.allowed) {
        const msg = access.reason === 'missing-role'
          ? 'You do not have the required role on a server that Botboard is in.'
          : 'You must be a member of a Discord server that Botboard is in.';
        logActivity(`Login denied (${access.reason}): ${user.global_name || user.username} (@${user.username})`);
        return res.status(403).send(msg);
      }

      const avatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null;
      recordUser({ id: user.id, username: user.username, global_name: user.global_name, avatar, guilds: guildIds });

      req.session.user = {
        id: user.id,
        username: user.username,
        global_name: user.global_name,
        avatar,
        permissions: getPermissions(user.id),
      };
      req.session.userGuilds = guildIds;
      req.session.save((saveErr) => {
        if (saveErr) return res.status(500).send('Login session could not be saved.');
        logActivity(`Login: ${user.global_name || user.username} (@${user.username})`);
        res.redirect('/');
      });
    } catch (err) {
      console.error('OAuth callback failed:', err);
      res.status(500).send('Login failed: ' + err.message);
    }
  });

  // Aktiven Server für die Session setzen. Hier wird das Rollen-Gate erneut
  // serverseitig geprüft (Mitglied + ggf. Pflichtrolle). Erst danach gelten die
  // Rechte für diesen Server (requirePermission liest session.activeGuild).
  router.post('/active-server', async (req, res) => {
    const { guildId } = req.body || {};
    if (!guildId) return res.status(400).json({ error: 'guildId required' });

    if (config.devAuthBypass) {
      req.session.activeGuild = String(guildId);
      return req.session.save(() => res.json({
        user: { ...(req.session.user || { id: 'dev', username: 'dev' }), permissions: { controlBot: true, restartBot: true, startStop: true, soundLibrary: true, settings: true, userManagement: true, botModules: true } },
      }));
    }

    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const isMember = !req.session.userGuilds?.length || req.session.userGuilds.includes(String(guildId));
    const allowed = isMember && await userAllowedInGuild(userId, String(guildId));
    if (!allowed) return res.status(403).json({ error: 'no access to this server' });

    req.session.activeGuild = String(guildId);
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'session save failed' });
      res.json({ user: { ...req.session.user, permissions: getPermissions(userId, String(guildId)) } });
    });
  });

  router.post('/logout', (req, res) => {
    const who = req.session?.user?.global_name || req.session?.user?.username || 'unknown';
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      logActivity(`Logout: ${who}`);
      res.json({ loggedOut: true });
    });
  });

  return router;
}
