import { Router } from 'express';
import crypto from 'crypto';
import { buildAuthUrl, exchangeCode, fetchDiscordUser, fetchUserGuilds, isAllowed } from '../auth.js';
import { discordOAuthEnabled } from '../config.js';

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

      if (!isAllowed(user.id)) {
        return res.status(403).send('Your Discord account is not on the allowlist.');
      }

      const guilds = await fetchUserGuilds(token.access_token);
      req.session.user = {
        id: user.id,
        username: user.username,
        global_name: user.global_name,
        avatar: user.avatar
          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
          : null,
      };
      req.session.userGuilds = guilds.map((g) => g.id);
      req.session.save((saveErr) => {
        if (saveErr) return res.status(500).send('Login session could not be saved.');
        res.redirect('/');
      });
    } catch (err) {
      console.error('OAuth callback failed:', err);
      res.status(500).send('Login failed: ' + err.message);
    }
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ loggedOut: true });
    });
  });

  return router;
}
