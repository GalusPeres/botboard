// Thin fetch wrapper for talking to the bot HTTP APIs. Adds Bearer auth,
// short timeouts, and normalises errors so route handlers can use try/catch.

import { config } from './config.js';

export function botIds() {
  return Object.keys(config.bots);
}

export function hasBot(bot) {
  return Object.prototype.hasOwnProperty.call(config.bots, bot);
}

function baseUrl(bot) {
  if (!hasBot(bot)) throw new Error(`unknown bot: ${bot}`);
  return config.bots[bot].url.replace(/\/$/, '');
}

function headers(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  if (config.botApiToken) h.Authorization = `Bearer ${config.botApiToken}`;
  return h;
}

export async function botFetch(bot, path, opts = {}) {
  const url = `${baseUrl(bot)}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeout || 8000);

  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: headers(opts.headers),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    const data = text ? safeJson(text) : null;
    if (!res.ok) {
      const err = new Error(data?.error || `${bot} bot returned ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error(`${bot} bot timed out`);
      e.status = 504;
      throw e;
    }
    if (err.code === 'ECONNREFUSED' || err.cause?.code === 'ECONNREFUSED') {
      const e = new Error(`${bot} bot unreachable`);
      e.status = 503;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export async function botStatus(bot) {
  try {
    const data = await botFetch(bot, '/api/status', { timeout: 3000 });
    return { online: true, ...data };
  } catch (err) {
    return { online: false, error: err.message };
  }
}

export function botAuthHeader() {
  return config.botApiToken ? `Bearer ${config.botApiToken}` : '';
}

export function botBaseUrl(bot) {
  return baseUrl(bot);
}
