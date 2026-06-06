import { config, discordOAuthEnabled } from './config.js';
import { getPermissions } from './userRegistry.js';
import { botTokenConfigured, fetchBotGuildIds, fetchMemberRoleIds } from './discordBot.js';
import { getGuildAccess } from './accessRegistry.js';

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

// Env-Admins dürfen immer rein, egal welche Server/Rollen — sonst sperrt man
// sich beim Einrichten selbst aus.
function isEnvAdmin(userId) {
  return new Set([...config.discord.allowedUserIds, ...config.discord.adminUserIds]).has(userId);
}

// Darf dieser User auf DIESEN Server zugreifen? Ohne gesetzte Pflichtrolle
// reicht die Mitgliedschaft; mit Pflichtrolle muss er die Rolle haben. Wird
// sowohl fürs Login-Gate als auch für die Server-Liste benutzt, damit ein User
// einen rollen-geschützten Server gar nicht erst auswählen kann.
export async function userAllowedInGuild(userId, guildId) {
  if (!botTokenConfigured()) return true;
  if (isEnvAdmin(userId)) return true;
  if (!guildId) return false;
  const access = getGuildAccess(guildId);
  try {
    const roleIds = await fetchMemberRoleIds(guildId, userId);
    if (roleIds === null) return false;                 // nicht (mehr) im Server
    if (!access.requiredRoleId) return true;            // Mitglied, keine Rolle nötig
    return roleIds.includes(access.requiredRoleId);     // Mitglied + hat die Rolle
  } catch (err) {
    // Discord-Ausfall darf bestehende Nutzer nicht aussperren → durchlassen.
    console.error('[access] guild role check failed:', err.message);
    return true;
  }
}

// Login-Gate: nur rein, wer in mindestens einem Server ist, in dem Botboard
// (der Bot) auch drin ist UND dort (falls Pflichtrolle gesetzt) die Rolle hat.
// Reicht EIN passender Server. Welche Server er danach sieht, entscheidet die
// gefilterte Server-Liste (siehe /servers) – ebenfalls per userAllowedInGuild.
//
// Ohne Bot-Token bleibt das Verhalten wie bisher (jeder rein), damit man sich
// beim Einrichten nicht aussperrt.
export async function isAllowed(userId, userGuildIds = []) {
  if (!botTokenConfigured()) return { allowed: true };
  if (isEnvAdmin(userId)) return { allowed: true };

  let botGuildIds;
  try {
    botGuildIds = await fetchBotGuildIds();
  } catch (err) {
    console.error('[access] could not fetch bot guilds:', err.message);
    return { allowed: true, degraded: true };
  }

  const shared = userGuildIds.filter((id) => botGuildIds.has(id));
  if (shared.length === 0) {
    return { allowed: false, reason: 'no-shared-server' };
  }

  for (const guildId of shared) {
    if (await userAllowedInGuild(userId, guildId)) return { allowed: true };
  }
  return { allowed: false, reason: 'missing-role' };
}

// Der aktuell gewählte Server für einen Request: primär der X-Guild-Id-Header
// (vom Client synchron gesetzt → keine Race), Fallback auf die Session.
export function reqGuild(req) {
  const header = req.headers?.['x-guild-id'];
  if (header && /^\d{5,}$/.test(String(header))) return String(header);
  return req.session?.activeGuild || null;
}

// Live permission check — reads from file so changes take effect immediately.
// Rechte gelten PRO SERVER → guildId ist der aktuell gewählte Server.
export function hasPermission(userId, permission, guildId) {
  if (!userId) return false;
  return getPermissions(userId, guildId)[permission] === true;
}

export function isAdmin(userId, guildId) {
  return hasPermission(userId, 'userManagement', guildId);
}

export function requireAuth(req, res, next) {
  if (config.devAuthBypass) {
    req.session.user = req.session.user || {
      id: 'dev', username: 'dev', avatar: null, dev: true,
      permissions: { controlBot: true, soundLibrary: true, settings: true, userManagement: true, botModules: true },
    };
    return next();
  }
  if (!discordOAuthEnabled()) return res.status(503).json({ error: 'Discord OAuth not configured' });
  if (!req.session?.user) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// Prüft das gespeicherte Recht UND ob der User auf dem Server aktuell zugelassen
// ist (Mitglied + ggf. Pflichtrolle). Damit gilt „Rolle/Mitgliedschaft weg =
// kein Zugang" auch hart auf der API, nicht nur im UI. guildId kommt aus dem
// X-Guild-Id-Header (vom Client), darf also nicht blind vertraut werden.
function guardPermission(permission) {
  return (req, res, next) => {
    if (config.devAuthBypass) return next();
    const userId = req.session?.user?.id;
    const guildId = reqGuild(req);
    if (!hasPermission(userId, permission, guildId)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    userAllowedInGuild(userId, guildId)
      .then((ok) => ok ? next() : res.status(403).json({ error: 'no access to this server' }))
      .catch((err) => { console.error('[auth] guard failed:', err.message); res.status(403).json({ error: 'forbidden' }); });
  };
}

export function requireAdmin(req, res, next) {
  return guardPermission('userManagement')(req, res, next);
}

export function requirePermission(permission) {
  return guardPermission(permission);
}
