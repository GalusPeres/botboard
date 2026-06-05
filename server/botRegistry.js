import fs from 'fs';
import path from 'path';
import { config } from './config.js';

const BOT_ID_RE = /^[a-z][a-z0-9_-]{1,40}$/;

function registryPath() {
  return path.resolve(config.botRegistryPath);
}

function validateId(id) {
  if (!BOT_ID_RE.test(id || '')) {
    const error = new Error('bot id must start with a-z and contain only a-z, 0-9, _ or -');
    error.status = 400;
    throw error;
  }
}

function validateUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid protocol');
    return parsed.toString().replace(/\/$/, '');
  } catch {
    const error = new Error('bot url must be a valid http(s) URL');
    error.status = 400;
    throw error;
  }
}

function normalizeBot(id, raw, source) {
  // A module needs at least a way to reach it: an HTTP API URL (own bot)
  // or a container name (managed purely via the Docker socket).
  if (!raw?.url && !raw?.container) return null;
  return {
    id,
    url: raw.url ? validateUrl(raw.url) : '',
    container: raw.container || '',
    name: raw.name || '',
    enabled: raw.enabled !== false,
    source,
    readOnly: source === 'env',
  };
}

function envBots() {
  const out = {};
  for (const [id, raw] of Object.entries(config.bots)) {
    const bot = normalizeBot(id, raw, 'env');
    if (bot) out[id] = bot;
  }
  return out;
}

function emptyRegistry() {
  return { bots: {} };
}

export function readRegistryDocument() {
  const file = registryPath();
  if (!fs.existsSync(file)) return emptyRegistry();
  const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (Array.isArray(parsed)) {
    return {
      bots: Object.fromEntries(parsed.filter((bot) => bot?.id).map((bot) => [bot.id, bot])),
    };
  }
  return { bots: parsed.bots || parsed || {}, order: parsed.order || [] };
}

function writeRegistryDocument(doc) {
  const file = registryPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const toWrite = { bots: doc.bots || {} };
  if (Array.isArray(doc.order)) toWrite.order = doc.order;
  fs.writeFileSync(file, `${JSON.stringify(toWrite, null, 2)}\n`);
}

function fileBots() {
  const out = {};
  const doc = readRegistryDocument();
  for (const [id, raw] of Object.entries(doc.bots || {})) {
    validateId(id);
    const bot = normalizeBot(id, raw, 'file');
    if (bot) out[id] = bot;
  }
  return out;
}

function mergedBots() {
  const env = envBots();
  const file = fileBots();
  const ids = new Set([...Object.keys(env), ...Object.keys(file)]);
  const out = {};
  for (const id of ids) {
    const bot = file[id] || env[id];
    if (!bot) continue;
    const envDefault = !!env[id];
    const registryBacked = !!file[id];
    const merged = {
      ...bot,
      envDefault,
      registryBacked,
      readOnly: false,
      source: registryBacked ? 'registry' : 'env',
    };
    out[id] = merged;
  }
  return out;
}

export function botConfigs() {
  return mergedBots();
}

export function botIds() {
  return Object.keys(botConfigs());
}

export function hasBot(id) {
  return Object.prototype.hasOwnProperty.call(botConfigs(), id);
}

export function botConfig(id) {
  return botConfigs()[id] || null;
}

export function botContainer(id) {
  return botConfig(id)?.container || '';
}

export function registrySnapshot() {
  const bots = Object.values(botConfigs());
  const order = readRegistryDocument().order || [];
  if (order.length) {
    bots.sort((a, b) => {
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      if (ai < 0 && bi < 0) return 0;
      if (ai < 0) return 1;
      if (bi < 0) return -1;
      return ai - bi;
    });
  }
  return { registryPath: registryPath(), bots };
}

export function setRegistryOrder(order) {
  if (!Array.isArray(order)) return;
  const doc = readRegistryDocument();
  const allIds = Object.keys(botConfigs({ includeDisabled: true }));
  const valid = order.filter(id => allIds.includes(id));
  for (const id of allIds) {
    if (!valid.includes(id)) valid.push(id);
  }
  doc.order = valid;
  writeRegistryDocument(doc);
}

export function reorderRegistryBot(id, direction) {
  validateId(id);
  const doc = readRegistryDocument();
  const allIds = Object.keys(botConfigs({ includeDisabled: true }));
  let order = Array.isArray(doc.order) ? [...doc.order] : [...allIds];
  // Ensure all known bots are represented
  for (const bid of allIds) {
    if (!order.includes(bid)) order.push(bid);
  }
  const idx = order.indexOf(id);
  if (idx < 0) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= order.length) return;
  [order[idx], order[swapIdx]] = [order[swapIdx], order[idx]];
  doc.order = order;
  writeRegistryDocument(doc);
}

export function upsertRegistryBot(id, input) {
  validateId(id);
  const current = readRegistryDocument();
  const existing = current.bots?.[id] || {};
  const next = normalizeBot(id, { ...existing, ...input }, 'file');
  if (!next) {
    const error = new Error('a module needs an API URL or a container name');
    error.status = 400;
    throw error;
  }

  current.bots = current.bots || {};
  current.bots[id] = {
    url: next.url,
    container: next.container,
    name: next.name,
    enabled: next.enabled,
  };
  writeRegistryDocument(current);
  return next;
}

export function deleteRegistryBot(id) {
  validateId(id);
  const current = readRegistryDocument();
  if (!current.bots?.[id]) {
    const error = new Error(envBots()[id] ? 'this bot only exists in .env and has no registry override' : 'bot not found in registry');
    error.status = 404;
    throw error;
  }
  delete current.bots[id];
  writeRegistryDocument(current);
  return { deleted: id, fallback: envBots()[id] ? 'env' : null };
}
