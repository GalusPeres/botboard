// Persists a record of every Discord user who has logged in, plus any
// admin-status overrides set through the dashboard UI.
// File location: USERS_CONFIG_PATH (default ./data/users.json → /app/data/users.json).

import fs from 'fs';
import path from 'path';
import { config } from './config.js';

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

// Called on every successful login — creates or updates the user record.
// Does NOT change an existing isAdmin value (that's done explicitly via UI).
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

// Returns the stored isAdmin override for a user (true / false / undefined).
export function getAdminOverride(userId) {
  const data = load();
  return data[userId]?.isAdmin;
}

// Returns all known users as an array, enriched with whether their admin
// status is locked to the ADMIN_USER_IDS env var.
export function listUsers() {
  const data = load();
  const envAdmins = new Set(config.discord.adminUserIds);
  return Object.values(data).map((u) => ({
    ...u,
    isAdmin: envAdmins.has(u.id) || u.isAdmin === true,
    isAdminFixed: envAdmins.has(u.id), // locked by ENV — cannot be changed via UI
  }));
}

// Updates the isAdmin flag for a user. Throws if user not found.
export function setAdminOverride(userId, isAdmin) {
  const envAdmins = new Set(config.discord.adminUserIds);
  if (envAdmins.has(userId)) {
    const err = new Error('This user\'s admin status is set by the ADMIN_USER_IDS environment variable and cannot be changed here.');
    err.status = 400;
    throw err;
  }
  const data = load();
  if (!data[userId]) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  data[userId].isAdmin = isAdmin;
  save(data);
  const envAdmin = envAdmins.has(userId);
  return { ...data[userId], isAdmin: envAdmin || data[userId].isAdmin === true, isAdminFixed: envAdmin };
}

// Removes a user record entirely (revokes their stored access).
export function removeUser(userId) {
  const envAdmins = new Set(config.discord.adminUserIds);
  if (envAdmins.has(userId)) {
    const err = new Error('Cannot remove a user who is listed in ADMIN_USER_IDS.');
    err.status = 400;
    throw err;
  }
  const data = load();
  if (!data[userId]) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  delete data[userId];
  save(data);
  return { removed: userId };
}
