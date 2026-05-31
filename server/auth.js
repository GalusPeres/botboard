// Discord OAuth + session middleware.
// Flow: /api/auth/discord -> Discord login -> /api/auth/callback -> session cookie.
// requireAuth guards every /api/* route except auth + healthcheck.

import { config, discordOAuthEnabled } from './config.js';
import { getAdminOverride } from './userRegistry.js';

const OAUTH_BASE = 'https://discord.com/api/oauth2/authorize';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const USER_URL = 'https://discord.com/api/users/@me';
const GUILDS_URL = 'https://discord.com/api/users/@me/guilds';
const SCOPES = ['identify', 'guilds'];

export function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: config.discord.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
  });
  return `${OAUTH_BASE}?${params}`;
}

export async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: config.discord.clientId,
    client_secret: config.discord.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.discord.redirectUri,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord token exchange failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function fetchDiscordUser(accessToken) {
  const res = await fetch(USER_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Discord user fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchUserGuilds(accessToken) {
  const res = await fetch(GUILDS_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Discord guilds fetch failed: ${res.status}`);
  return res.json();
}

export function isAllowed(userId) {
  const allowed = config.discord.allowedUserIds;
  if (allowed.length === 0) return true;
  return allowed.includes(userId);
}

export function isAdmin(userId) {
  const envAdmins = config.discord.adminUserIds;
  // ENV list always grants admin — highest priority.
  if (envAdmins.includes(userId)) return true;
  // Check file-based override (set via dashboard UI).
  const override = getAdminOverride(userId);
  if (override === true) return true;
  if (override === false) return false;
  // No explicit override: if no ADMIN_USER_IDS configured at all, everyone is admin (backwards compat).
  return envAdmins.length === 0;
}

export function requireAuth(req, res, next) {
  if (config.devAuthBypass) {
    req.session.user = req.session.user || { id: 'dev', username: 'dev', avatar: null, dev: true, isAdmin: true };
    return next();
  }
  if (!discordOAuthEnabled()) return res.status(503).json({ error: 'Discord OAuth not configured' });
  if (!req.session?.user) return res.status(401).json({ error: 'unauthorized' });
  next();
}

export function requireAdmin(req, res, next) {
  if (config.devAuthBypass) return next();
  if (!req.session?.user?.isAdmin) return res.status(403).json({ error: 'forbidden' });
  next();
}
