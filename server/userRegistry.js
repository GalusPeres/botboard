import fs from 'fs';
import path from 'path';
import { config } from './config.js';

export const PERMISSIONS = ['controlBot', 'restartBot', 'soundLibrary', 'settings', 'userManagement', 'botModules'];

const DEFAULT_PERMISSIONS = {
  controlBot: true,
  restartBot: false,
  soundLibrary: false,
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
    lastSeen: new Date().toISOString(),
  };
  save(data);
}

export function getPermissions(userId) {
  if (envAdminSet().has(userId)) return { ...ALL_PERMISSIONS };
  const data = load();
  return { ...DEFAULT_PERMISSIONS, ...(data[userId]?.permissions || {}) };
}

export function setPermissions(userId, incoming) {
  if (envAdminSet().has(userId)) {
    const err = new Error('Permissions of ENV admins cannot be changed here.');
    err.status = 400;
    throw err;
  }
  const data = load();
  if (!data[userId]) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  const merged = { ...(data[userId].permissions || {}), ...incoming };
  // Only keep known keys with boolean values.
  for (const key of Object.keys(merged)) {
    if (!PERMISSIONS.includes(key) || typeof merged[key] !== 'boolean') delete merged[key];
  }
  data[userId].permissions = merged;
  save(data);
  return serialize(data[userId]);
}

function serialize(u) {
  const isEnvAdmin = envAdminSet().has(u.id);
  return {
    ...u,
    permissions: isEnvAdmin ? { ...ALL_PERMISSIONS } : { ...DEFAULT_PERMISSIONS, ...(u.permissions || {}) },
    isEnvAdmin,
  };
}

export function listUsers() {
  const data = load();
  return Object.values(data).map(serialize);
}
