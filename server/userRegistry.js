import fs from 'fs';
import path from 'path';
import { config } from './config.js';

export const PERMISSIONS = ['controlBot', 'restartBot', 'startStop', 'soundLibrary', 'fileBrowser', 'settings', 'userManagement', 'botModules'];

const DEFAULT_PERMISSIONS = {
  controlBot: true,
  // restartBot = "Restart" right; startStop = "Start/Stop" right. Split on
  // purpose so a public Botboard doesn't let everyone start/stop containers.
  restartBot: false,
  startStop: false,
  // soundLibrary = "Sounds" (Soundboard-Bibliothek, locker/breit).
  // fileBrowser = "Files" (generischer Dateibrowser, eher Serververwaltung).
  soundLibrary: false,
  fileBrowser: false,
  settings: false,
  userManagement: false,
  botModules: false,
};

const ALL_PERMISSIONS = Object.fromEntries(PERMISSIONS.map((k) => [k, true]));

function envAdminSet() {
  return new Set([...config.discord.allowedUserIds, ...config.discord.adminUserIds]);
}

function registryPath() {
  return path.resolve(config.usersConfigPath);
}

function load() {
  const file = registryPath();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  const file = registryPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function recordUser(user) {
  const data = load();
  const existing = data[user.id] || {};
  data[user.id] = {
    ...existing,
    id: user.id,
    username: user.username,
    global_name: user.global_name || user.username,
    avatar: user.avatar,
    // Discord-Server des Users (aus dem OAuth-Login). Damit die Roles-Liste pro
    // Server filtern kann, ohne den Bot live zu fragen. Wird bei jedem Login
    // aktualisiert.
    ...(Array.isArray(user.guilds) ? { guilds: user.guilds } : {}),
    lastSeen: new Date().toISOString(),
  };
  save(data);
}

// Rechte werden PRO SERVER gespeichert: data[userId].permissions = {
//   [guildId]: { controlBot, restartBot, ... }
// }. Ein Snowflake-Key (nur Ziffern) = Server. Alte „flache" Formate (Keys wie
// controlBot direkt unter permissions) werden ignoriert bzw. beim nächsten
// Schreiben verworfen, damit globale Altrechte nicht weitergelten.
function isGuildKey(key) {
  return /^\d{5,}$/.test(key);
}

function guildPerms(user, guildId) {
  const perGuild = guildId ? user?.permissions?.[guildId] : null;
  return { ...DEFAULT_PERMISSIONS, ...(perGuild && typeof perGuild === 'object' ? perGuild : {}) };
}

export function getPermissions(userId, guildId) {
  if (envAdminSet().has(userId)) return { ...ALL_PERMISSIONS };
  const data = load();
  return guildPerms(data[userId], guildId);
}

export function setPermissions(userId, guildId, incoming) {
  if (envAdminSet().has(userId)) {
    const err = new Error('Permissions of ENV admins cannot be changed here.');
    err.status = 400;
    throw err;
  }
  if (!guildId) {
    const err = new Error('No active server — permissions are set per server.');
    err.status = 400;
    throw err;
  }
  const data = load();
  if (!data[userId]) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const existing = data[userId].permissions && typeof data[userId].permissions === 'object'
    ? data[userId].permissions : {};
  const merged = { ...(isGuildKey(guildId) && existing[guildId] ? existing[guildId] : {}), ...incoming };
  for (const key of Object.keys(merged)) {
    if (!PERMISSIONS.includes(key) || typeof merged[key] !== 'boolean') delete merged[key];
  }

  // Sauberen, rein server-gekeyten Block neu aufbauen (verwirft Alt-Flachformat).
  const clean = {};
  for (const [k, v] of Object.entries(existing)) {
    if (isGuildKey(k) && v && typeof v === 'object') clean[k] = v;
  }
  clean[guildId] = merged;
  data[userId].permissions = clean;
  save(data);
  return serialize(data[userId], guildId);
}

function serialize(u, guildId) {
  const isEnvAdmin = envAdminSet().has(u.id);
  return {
    ...u,
    permissions: isEnvAdmin ? { ...ALL_PERMISSIONS } : guildPerms(u, guildId),
    isEnvAdmin,
  };
}

// Nur Mitglieder des gewählten Servers (anhand der beim Login gespeicherten
// Server-Liste). Env-Admins immer. Alt-User ohne gespeicherte Server werden
// gezeigt, bis sie sich einmal neu eingeloggt haben (dann exakt).
export function listUsers(guildId) {
  const data = load();
  return Object.values(data)
    .filter((u) => envAdminSet().has(u.id) || !Array.isArray(u.guilds) || (!!guildId && u.guilds.includes(guildId)))
    .map((u) => serialize(u, guildId));
}
