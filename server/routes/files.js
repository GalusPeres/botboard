// Generischer Filebrowser für ein Modul: liest/schreibt Dateien in dem vom
// Admin konfigurierten Datenordner (dataPath, in Unraid in den Botboard-
// Container gemountet). Alles per Library-Recht (pro Server) abgesichert und
// hart auf den Root beschränkt (kein Pfad-Ausbruch).
import { Router } from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { hasBot } from '../botClient.js';
import { botConfig } from '../botRegistry.js';
import { requirePermission } from '../auth.js';
import { logActivity } from '../activityLog.js';

const MAX_EDIT_BYTES = 2 * 1024 * 1024; // 2 MB Text-Edit-Limit

function moduleRoot(bot) {
  const cfg = botConfig(bot);
  const root = (cfg?.dataPath || '').trim();
  return root ? path.resolve(root) : null;
}

// Absoluten Pfad innerhalb des Roots auflösen; bei Ausbruch werfen.
function safePath(root, rel = '') {
  const clean = String(rel).replace(/\\/g, '/').replace(/^\/+/, '');
  const target = path.resolve(root, clean);
  if (target !== root && !target.startsWith(root + path.sep)) {
    const err = new Error('invalid path');
    err.status = 400;
    throw err;
  }
  return target;
}

function actor(req) {
  return req.session?.user?.global_name || req.session?.user?.username || 'dashboard';
}

export default function filesRoutes() {
  const router = Router();

  // Library-Recht (pro Server) für ALLE Datei-Operationen.
  router.use('/:bot', requirePermission('soundLibrary'));

  // Root-Check + 404 für unbekanntes/un-konfiguriertes Modul.
  function resolveRoot(req, res) {
    if (!hasBot(req.params.bot)) {
      res.status(404).json({ error: 'unknown module' });
      return null;
    }
    const root = moduleRoot(req.params.bot);
    if (!root) {
      res.status(400).json({ error: 'no data folder configured for this module' });
      return null;
    }
    return root;
  }

  // Ordnerinhalt: Ordner zuerst, dann Dateien (alphabetisch).
  router.get('/:bot/list', async (req, res) => {
    const root = resolveRoot(req, res);
    if (!root) return;
    try {
      const rel = req.query.path || '';
      const dir = safePath(root, rel);
      const dirents = await fsp.readdir(dir, { withFileTypes: true });
      const entries = await Promise.all(dirents.map(async (d) => {
        let size = 0, mtime = null;
        try {
          const st = await fsp.stat(path.join(dir, d.name));
          size = st.size; mtime = st.mtimeMs;
        } catch {}
        return { name: d.name, type: d.isDirectory() ? 'dir' : 'file', size, mtime };
      }));
      entries.sort((a, b) =>
        a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      res.json({ path: rel, entries });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Datei zum Download streamen.
  router.get('/:bot/download', (req, res) => {
    const root = resolveRoot(req, res);
    if (!root) return;
    try {
      const target = safePath(root, req.query.path || '');
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        return res.status(404).json({ error: 'file not found' });
      }
      res.download(target, path.basename(target));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Textinhalt zum Bearbeiten lesen (mit Größenlimit).
  router.get('/:bot/read', async (req, res) => {
    const root = resolveRoot(req, res);
    if (!root) return;
    try {
      const target = safePath(root, req.query.path || '');
      const st = await fsp.stat(target);
      if (!st.isFile()) return res.status(400).json({ error: 'not a file' });
      if (st.size > MAX_EDIT_BYTES) {
        return res.status(413).json({ error: 'file too large to edit', size: st.size });
      }
      const content = await fsp.readFile(target, 'utf8');
      res.json({ content, size: st.size });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Textdatei schreiben (Editor-Speichern).
  router.put('/:bot/write', async (req, res) => {
    const root = resolveRoot(req, res);
    if (!root) return;
    try {
      const { path: rel, content } = req.body || {};
      if (typeof content !== 'string') return res.status(400).json({ error: 'content required' });
      const target = safePath(root, rel);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, content, 'utf8');
      logActivity(`${actor(req)} → Datei gespeichert: ${rel} (${req.params.bot})`);
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Upload: rohe Bytes im Body (Content-Type octet-stream), Ziel via Query.
  router.post('/:bot/upload', (req, res) => {
    const root = resolveRoot(req, res);
    if (!root) return;
    try {
      const dir = req.query.dir || '';
      const name = path.basename(String(req.query.name || '')).trim();
      if (!name) return res.status(400).json({ error: 'name required' });
      const target = safePath(root, path.join(dir, name));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const stream = fs.createWriteStream(target);
      req.pipe(stream);
      stream.on('finish', () => {
        logActivity(`${actor(req)} → Datei hochgeladen: ${path.join(dir, name)} (${req.params.bot})`);
        res.json({ ok: true });
      });
      stream.on('error', (err) => res.status(500).json({ error: err.message }));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Umbenennen (innerhalb desselben Ordners).
  router.patch('/:bot/rename', async (req, res) => {
    const root = resolveRoot(req, res);
    if (!root) return;
    try {
      const { path: rel, newName } = req.body || {};
      const base = path.basename(String(newName || '')).trim();
      if (!base) return res.status(400).json({ error: 'newName required' });
      const from = safePath(root, rel);
      const to = safePath(root, path.join(path.dirname(rel || ''), base));
      await fsp.rename(from, to);
      logActivity(`${actor(req)} → Umbenannt: ${rel} → ${base} (${req.params.bot})`);
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Löschen (Datei oder Ordner rekursiv).
  router.delete('/:bot/delete', async (req, res) => {
    const root = resolveRoot(req, res);
    if (!root) return;
    try {
      const rel = req.query.path || '';
      const target = safePath(root, rel);
      if (target === root) return res.status(400).json({ error: 'cannot delete the root' });
      await fsp.rm(target, { recursive: true, force: false });
      logActivity(`${actor(req)} → Gelöscht: ${rel} (${req.params.bot})`, 'warn');
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Ordner anlegen.
  router.post('/:bot/mkdir', async (req, res) => {
    const root = resolveRoot(req, res);
    if (!root) return;
    try {
      const { path: dir, name } = req.body || {};
      const base = path.basename(String(name || '')).trim();
      if (!base) return res.status(400).json({ error: 'name required' });
      const target = safePath(root, path.join(dir || '', base));
      await fsp.mkdir(target, { recursive: true });
      logActivity(`${actor(req)} → Ordner erstellt: ${path.join(dir || '', base)} (${req.params.bot})`);
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  return router;
}
