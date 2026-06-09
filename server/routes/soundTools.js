// Audio-Werkzeuge für den Sound-Editor (gated per soundLibrary-Recht):
//  - POST /youtube : lädt die Audiospur eines YouTube-Links via yt-dlp und
//    liefert sie als MP3 zurück (zum Bearbeiten im Editor).
//  - POST /render  : nimmt rohe Audiodaten (Aufnahme/Upload/vorhandener Sound)
//    + Schnitt/Lautstärke-Parameter und rendert sauberes MP3 via ffmpeg.
// Beide schreiben nur in temporäre Dateien und räumen danach auf. Es wird
// NICHTS in die Sound-Library geschrieben — das Speichern macht der Browser
// anschließend über den bestehenden Upload (/api/bots/sound/sounds).
import { Router } from 'express';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { requirePermission } from '../auth.js';
import { logActivity } from '../activityLog.js';

const MAX_DURATION_S = 600;          // max. 10 min Ausschnitt
const YT_TIMEOUT_MS = 120_000;       // yt-dlp-Download-Timeout
const FF_TIMEOUT_MS = 120_000;       // ffmpeg-Render-Timeout
const ALLOWED_YT_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com',
  'music.youtube.com', 'youtu.be', 'www.youtu.be',
  'youtube-nocookie.com', 'www.youtube-nocookie.com',
]);

function actor(req) {
  return req.session?.user?.global_name || req.session?.user?.username || 'dashboard';
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Befehl mit Timeout ausführen; bei Exit != 0 mit gesammeltem stderr werfen.
function run(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${cmd} timed out`)); }, timeoutMs);
    child.stderr.on('data', (d) => { if (stderr.length < 4000) stderr += d.toString(); });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().split('\n').pop() || `${cmd} exited with ${code}`));
    });
  });
}

async function tmpDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'bb-sound-'));
}

// Fertige MP3-Datei zurückstreamen und das temporäre Verzeichnis aufräumen.
function sendAndCleanup(res, file, dir, downloadName) {
  res.setHeader('Content-Type', 'audio/mpeg');
  if (downloadName) res.setHeader('Content-Disposition', `inline; filename="${downloadName}"`);
  const stream = fs.createReadStream(file);
  const cleanup = () => fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  stream.on('error', () => { if (!res.headersSent) res.status(500).json({ error: 'read failed' }); cleanup(); });
  res.on('close', cleanup);
  stream.pipe(res);
}

export default function soundToolsRoutes() {
  const router = Router();

  router.use(requirePermission('soundLibrary'));

  // YouTube-Audio → MP3.
  router.post('/youtube', async (req, res) => {
    const url = String(req.body?.url || '').trim();
    let parsed;
    try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'invalid url' }); }
    if (!['http:', 'https:'].includes(parsed.protocol) || !ALLOWED_YT_HOSTS.has(parsed.hostname)) {
      return res.status(400).json({ error: 'only YouTube links are allowed' });
    }
    const dir = await tmpDir();
    try {
      await run('yt-dlp', [
        '-x', '--audio-format', 'mp3', '--audio-quality', '2',
        '--no-playlist', '--no-warnings', '--no-part', '--max-filesize', '60M',
        '-o', path.join(dir, 'out.%(ext)s'),
        url,
      ], YT_TIMEOUT_MS);
      const out = path.join(dir, 'out.mp3');
      if (!fs.existsSync(out)) throw new Error('download produced no audio');
      logActivity(`${actor(req)} → YouTube-Audio importiert: ${url}`);
      sendAndCleanup(res, out, dir, 'youtube.mp3');
    } catch (err) {
      console.error('[sound-tools] youtube failed:', err.message);
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
      res.status(502).json({ error: err.message });
    }
  });

  // Rohe Audiodaten (octet-stream im Body) + Parameter (Query) → getrimmtes,
  // lautstärke-angepasstes MP3. start/end in Sekunden, gain in dB.
  router.post('/render', async (req, res) => {
    const start = Math.max(0, num(req.query.start, 0));
    const endRaw = num(req.query.end, 0);
    const gainDb = Math.max(-60, Math.min(30, num(req.query.gain, 0)));
    const fadeIn = Math.max(0, num(req.query.fadeIn, 0));
    const fadeOut = Math.max(0, num(req.query.fadeOut, 0));
    const duration = endRaw > start ? Math.min(endRaw - start, MAX_DURATION_S) : 0;

    const dir = await tmpDir();
    const input = path.join(dir, 'in');
    const output = path.join(dir, 'out.mp3');
    try {
      // Body in temporäre Eingabedatei schreiben.
      await new Promise((resolve, reject) => {
        const ws = fs.createWriteStream(input);
        req.pipe(ws);
        ws.on('finish', resolve);
        ws.on('error', reject);
        req.on('error', reject);
      });
      if (!fs.statSync(input).size) return res.status(400).json({ error: 'empty audio body' });

      // Audio-Filterkette: erst Lautstärke, dann optionale Fades.
      const filters = [`volume=${gainDb}dB`];
      if (fadeIn > 0) filters.push(`afade=t=in:st=0:d=${fadeIn}`);
      if (fadeOut > 0 && duration > 0) {
        filters.push(`afade=t=out:st=${Math.max(0, duration - fadeOut)}:d=${fadeOut}`);
      }

      const args = ['-hide_banner', '-loglevel', 'error', '-i', input];
      if (start > 0) args.push('-ss', String(start));
      if (duration > 0) args.push('-t', String(duration));
      args.push('-af', filters.join(','), '-codec:a', 'libmp3lame', '-q:a', '2', '-y', output);

      await run('ffmpeg', args, FF_TIMEOUT_MS);
      if (!fs.existsSync(output)) throw new Error('render produced no file');
      sendAndCleanup(res, output, dir, 'sound.mp3');
    } catch (err) {
      console.error('[sound-tools] render failed:', err.message);
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  return router;
}
