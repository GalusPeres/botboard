// „Weiche" Bot-Einstellungen mit zwei Quellen (wie bei den anderen Bots):
//   1. env (Default, auf Unraid setzbar)  →  config.botboard.*
//   2. UI-Override (data/botboard.json)    →  hat Vorrang, wirkt live
// Secrets (Token) sind hier bewusst NICHT dabei — die bleiben env-only.
import fs from 'fs';
import path from 'path';
import { config } from './config.js';

const HARD_DEFAULTS = { prefix: '#', statusText: '', publicUrl: '' };

function filePath() {
  return path.resolve(path.dirname(config.usersConfigPath), 'botboard.json');
}

function loadStored() {
  const file = filePath();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function saveStored(data) {
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

// Effektiver Wert: UI-Override (falls gesetzt) > env-Default > Hard-Default.
function pick(stored, key) {
  if (stored[key] !== undefined && stored[key] !== null) return stored[key];
  if (config.botboard[key]) return config.botboard[key];
  return HARD_DEFAULTS[key];
}

export function getBotboardConfig() {
  const stored = loadStored();
  return {
    prefix: pick(stored, 'prefix'),
    statusText: pick(stored, 'statusText'),
    publicUrl: pick(stored, 'publicUrl'),
    // Woher der jeweilige Wert kommt — damit das UI „from env" anzeigen kann.
    source: {
      prefix: stored.prefix != null ? 'ui' : (config.botboard.prefix ? 'env' : 'default'),
      statusText: stored.statusText != null ? 'ui' : (config.botboard.statusText ? 'env' : 'default'),
      publicUrl: stored.publicUrl != null ? 'ui' : (config.botboard.publicUrl ? 'env' : 'default'),
    },
  };
}

export function setBotboardConfig(patch = {}) {
  const stored = loadStored();
  if (patch.prefix !== undefined) {
    const prefix = String(patch.prefix).trim();
    if (!prefix || prefix.length > 5 || /\s/.test(prefix)) {
      const err = new Error('prefix must be 1–5 characters with no spaces');
      err.status = 400;
      throw err;
    }
    stored.prefix = prefix;
  }
  if (patch.statusText !== undefined) {
    stored.statusText = String(patch.statusText).slice(0, 100);
  }
  if (patch.publicUrl !== undefined) {
    const url = String(patch.publicUrl).trim();
    if (url && !/^https?:\/\//i.test(url)) {
      const err = new Error('public URL must start with http:// or https://');
      err.status = 400;
      throw err;
    }
    stored.publicUrl = url;
  }
  saveStored(stored);
  return getBotboardConfig();
}
