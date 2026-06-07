// Generic proxy for /api/bots/:bot/* → bot's own /api/* endpoint. Streams
// request bodies for uploads and pipes back the response without buffering.

import { Router } from 'express';
import { hasBot, botBaseUrl, botAuthHeader } from '../botClient.js';
import { hasPermission, reqGuild, userAllowedInGuild } from '../auth.js';
import { logActivity } from '../activityLog.js';

const PROXY_PASS_HEADERS = ['content-type', 'content-disposition', 'cache-control'];

export default function proxyRoutes() {
  const router = Router({ mergeParams: true });

  router.use('/:bot/*', async (req, res) => {
    const { bot } = req.params;
    if (!hasBot(bot)) return res.status(404).json({ error: 'unknown bot' });

    const subPath = req.params[0];
    const userId = req.session?.user?.id;
    const guildId = reqGuild(req);

    // Geschützte Pfade: gespeichertes Recht UND aktueller Server-Zugang (Rolle/
    // Mitgliedschaft) — sonst gilt das Recht weiter, obwohl die Rolle weg ist.
    const denyUnlessAccess = async () => (await userAllowedInGuild(userId, guildId));

    if (subPath === 'settings' || subPath.startsWith('settings/')) {
      if (!hasPermission(userId, 'settings', guildId) || !(await denyUnlessAccess())) {
        return res.status(403).json({ error: 'forbidden' });
      }
    }

    if (subPath === 'sounds' || subPath.startsWith('sounds/')) {
      const isWrite = !['GET', 'HEAD'].includes(req.method);
      const isPreview = subPath.endsWith('/file') && req.query.preview === '1';
      const isDownload = subPath === 'sounds/download-zip' || (subPath.endsWith('/file') && !isPreview);
      if (isPreview && !(await denyUnlessAccess())) {
        return res.status(403).json({ error: 'forbidden' });
      }
      if (isWrite || isDownload) {
        if (!hasPermission(userId, 'soundLibrary', guildId) || !(await denyUnlessAccess())) {
          return res.status(403).json({ error: 'forbidden' });
        }
      }
    }
    // Log key dashboard actions before forwarding
    const who = req.session?.user?.global_name || req.session?.user?.username || 'dashboard';
    if (subPath === 'sounds' && req.method === 'POST') {
      const name = req.body?.name || '?';
      logActivity(`${who} → Sound hochgeladen: ${name} (${bot})`);
    } else if (subPath.startsWith('sounds/') && req.method === 'DELETE') {
      const name = subPath.split('/')[1] || '?';
      logActivity(`${who} → Sound gelöscht: ${name} (${bot})`, 'warn');
    } else if (subPath.startsWith('sounds/') && req.method === 'PATCH') {
      const name = subPath.split('/')[1] || '?';
      logActivity(`${who} → Sound umbenannt: ${name} → ${req.body?.name || '?'} (${bot})`);
    } else if ((subPath === 'settings' || subPath.startsWith('settings/')) && req.method === 'PUT') {
      const changes = Object.entries(req.body || {}).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
      logActivity(`${who} → Einstellungen (${bot}): ${changes || '(keine Änderungen)'}`);
    }

    const url = `${botBaseUrl(bot)}/api/${subPath}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;

    try {
      const headers = { ...req.headers };
      delete headers.host;
      delete headers['content-length'];
      // Browser-Session-Cookie & vom Client gesetzte Auth nicht an den Bot
      // weiterreichen — der Bot kriegt nur unseren Bot-Token.
      delete headers.cookie;
      delete headers.authorization;
      delete headers['x-guild-id'];
      const auth = botAuthHeader();
      if (auth) headers.authorization = auth;
      if (req.session?.user?.id) {
        headers['x-dashboard-user-id'] = req.session.user.id;
        headers['x-dashboard-user-name'] = encodeURIComponent(req.session.user.global_name || req.session.user.username || 'dashboard');
      }

      const mayHaveBody = !['GET', 'HEAD'].includes(req.method);
      const isJson = req.is('application/json');
      const body = !mayHaveBody
        ? undefined
        : isJson
          ? JSON.stringify(req.body || {})
          : req;
      const options = {
        method: req.method,
        headers,
        body,
      };
      if (body === req) options.duplex = 'half';

      const upstream = await fetch(url, options);
      res.status(upstream.status);
      for (const h of PROXY_PASS_HEADERS) {
        const v = upstream.headers.get(h);
        if (v) res.setHeader(h, v);
      }
      if (upstream.body) {
        const reader = upstream.body.getReader();
        const pump = async () => {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        };
        pump().catch(() => res.end());
      } else {
        res.end();
      }
    } catch (err) {
      const refused = err.cause?.code === 'ECONNREFUSED'
        || err.cause?.errors?.some((cause) => cause.code === 'ECONNREFUSED');
      if (!refused) console.error('[proxy]', err);
      res.status(refused ? 503 : 502).json({
        error: refused ? `${bot} bot is offline or its API is not running` : err.message,
      });
    }
  });

  return router;
}
