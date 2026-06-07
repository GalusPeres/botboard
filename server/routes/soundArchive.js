import { Router } from 'express';
import { Readable } from 'node:stream';
import path from 'node:path';
import archiver from 'archiver';
import { botAuthHeader, botBaseUrl, hasBot } from '../botClient.js';
import { requirePermission } from '../auth.js';

const SAFE_SOUND = /^[a-z0-9]+$/;

export default function soundArchiveRoutes() {
  const router = Router();
  router.use(requirePermission('soundLibrary'));

  router.get('/:bot', async (req, res) => {
    const bot = req.params.bot;
    if (!hasBot(bot)) return res.status(404).json({ error: 'unknown bot' });

    try {
      const names = JSON.parse(String(req.query.names || '[]'));
      if (!Array.isArray(names) || names.length < 2) {
        return res.status(400).json({ error: 'at least two sounds required' });
      }
      const cleanNames = names.map((value) => String(value).replace(/\.mp3$/i, '').toLowerCase());
      if (cleanNames.some((name) => !SAFE_SOUND.test(name))) {
        return res.status(400).json({ error: 'invalid sound name' });
      }

      res.attachment('sounds.zip');
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('error', (error) => {
        if (!res.headersSent) res.status(500).json({ error: error.message });
        else res.destroy(error);
      });
      archive.pipe(res);

      const auth = botAuthHeader();
      for (const name of cleanNames) {
        const upstream = await fetch(`${botBaseUrl(bot)}/api/sounds/${encodeURIComponent(name)}/file`, {
          headers: auth ? { Authorization: auth } : {},
        });
        if (!upstream.ok || !upstream.body) {
          throw new Error(`could not download ${name}.mp3`);
        }
        archive.append(Readable.fromWeb(upstream.body), { name: path.basename(`${name}.mp3`) });
      }
      await archive.finalize();
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: err.message });
      else res.destroy(err);
    }
  });

  return router;
}
