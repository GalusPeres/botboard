// Aggregated SSE stream — connects to both bots' /api/logs/stream and
// fans the entries to the dashboard. Tags each entry with `bot` so the UI
// can attribute the line.

import { Router } from 'express';
import { botIds, botBaseUrl, botAuthHeader, botFetch } from '../botClient.js';

export default function logsRoutes() {
  const router = Router();

  router.get('/', async (req, res) => {
    const entriesByBot = await Promise.all(
      botIds().map((bot) => botFetch(bot, '/api/logs?limit=100')
        .then((entries) => entries.map((entry) => ({ bot, ...entry })))
        .catch(() => []))
    );
    res.json(entriesByBot.flat().sort((a, b) => new Date(a.time) - new Date(b.time)).slice(-200));
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
    const heartbeat = setInterval(() => {
      res.write(': ping\n\n');
      res.flush?.();
    }, 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
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
    try {
      const upstream = await fetch(`${botBaseUrl(bot)}/api/logs/stream`, {
        headers,
        signal: controller.signal,
      });
      if (!upstream.ok || !upstream.body) return;
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
    } catch (err) {
      if (err.name !== 'AbortError') {
        res.write(`data: ${JSON.stringify({ bot, level: 'warn', src: 'core', text: `log stream lost: ${err.message}`, time: new Date().toISOString() })}\n\n`);
        res.flush?.();
      }
    }
  })();

  return { controller };
}
