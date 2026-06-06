// Globale, über die UI editierbare Bot-Einstellungen (data/botboard.json).
// Token bleibt in der env; das hier ist „weiche" Config: Befehls-Prefix und
// optionaler Status-Text. Leerer statusText = automatisch („X/Y online").
import fs from 'fs';
import path from 'path';
import { config } from './config.js';

const DEFAULTS = { prefix: '#', statusText: '' };

function filePath() {
  return path.resolve(path.dirname(config.usersConfigPath), 'botboard.json');
}

function load() {
  const file = filePath();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function getBotboardConfig() {
  return { ...DEFAULTS, ...load() };
}

export function setBotboardConfig(patch = {}) {
  const next = { ...DEFAULTS, ...load() };
  if (patch.prefix !== undefined) {
    const prefix = String(patch.prefix).trim();
    // 1–5 Zeichen, kein Whitespace (sonst lässt sich der Befehl nicht tippen).
    if (!prefix || prefix.length > 5 || /\s/.test(prefix)) {
      const err = new Error('prefix must be 1–5 characters with no spaces');
      err.status = 400;
      throw err;
    }
    next.prefix = prefix;
  }
  if (patch.statusText !== undefined) {
    next.statusText = String(patch.statusText).slice(0, 100);
  }
  save(next);
  return next;
}
