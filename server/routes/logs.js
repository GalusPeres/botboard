// Aggregated SSE stream — connects to both bots' /api/logs/stream and
// fans the entries to the dashboard. Tags each entry with `bot` so the UI
// can attribute the line.

import { Router } from 'express';
import { botIds, botBaseUrl, botAuthHeader, botFetch } from '../botClient.js';
import { recentActivity, subscribeActivity } from '../activityLog.js';
import { hasPermission, reqGuild } from '../auth.js';

// Botboards eigenes Activity-Log (Logins, Rechte-Änderungen, wer was tat) ist
// admin-relevant → nur für userManagement. Die operativen Bot-Logs bleiben für
// alle (sie speisen die „Live Logs"-Seite der einzelnen Bots).
function canSeeActivity(req) {
  return hasPermission(req.session?.user?.id, 'userManagement', reqGuild(req));
}

export default function logsRoutes() {
  const router = Router();

  router.get('/', async (req, res) => {
    const entriesByBot = await Promise.all(
      botIds().map((bot) => botFetch(bot, '/api/logs?limit=100')
        .then((entries) => entries.map((entry) => ({ bot, ...entry })))
        .catch(() => []))
    );
    const botboardEntries = canSeeActivity(req)
      ? recentActivity(100).map((entry) => ({ bot: 'botboard', ...entry }))
      : [];
    const all = [...entriesByBot.flat(), ...botboardEntries]
      .sort((a, b) => new Date(a.time) - new Date(b.time))
      .slice(-200);
    res.json(all);
  });

  router.get('/stream', async (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    const upstreams = botIds().map((bot) => connectUpstream(bot, res));

    // Botboards Activity-Log nur für Admins mitstreamen.
    const unsubBotboard = canSeeActivity(req)
      ? subscribeActivity((entry) => {
          res.write(`data: ${JSON.stringify({ bot: 'botboard', ...entry })}\n\n`);
          res.flush?.();
        })
      : () => {};

    const heartbeat = setInterval(() => {
      res.write(': ping\n\n');
      res.flush?.();
    }, 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubBotboard();
      upstreams.forEach((u) => u.controller.abort());
    });
  });

  return router;
}

function connectUpstream(bot, res) {
  const controller = new AbortController();
  const auth = botAuthHeader();
  const headers = {};
  if (auth) headers.Authorization = auth;

  (async () => {
    while (!controller.signal.aborted) {
      try {
        const upstream = await fetch(`${botBaseUrl(bot)}/api/logs/stream`, {
          headers,
          signal: controller.signal,
        });
        if (!upstream.ok || !upstream.body) {
          // Bot not ready yet — wait before retry
          await sleep(3000, controller.signal);
          continue;
        }
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
            if (!dataLine) continue;
            try {
              const entry = JSON.parse(dataLine.slice(6));
              res.write(`data: ${JSON.stringify({ bot, ...entry })}\n\n`);
              res.flush?.();
            } catch {}
          }
        }
        // Stream ended cleanly (bot restart) — reconnect after short delay
        await sleep(2000, controller.signal);
      } catch (err) {
        if (err.name === 'AbortError') break;
        // Connection refused or network error — wait longer before retry
        await sleep(5000, controller.signal);
      }
    }
  })();

  return { controller };
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const onAbort = () => { clearTimeout(t); resolve(); };
    signal?.addEventListener('abort', onAbort, { once: true });
    const t = setTimeout(() => {
      // Timer fired — remove the abort listener so it doesn't accumulate
      // on the AbortSignal across many retries (avoids MaxListeners warning)
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
  });
}
