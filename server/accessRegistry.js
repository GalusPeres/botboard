// Zugangs-Regeln pro Discord-Server (data/access.json). Aktuell: optionale
// Pflichtrolle je Server. Token bleibt in der env; diese „weiche" Config ist
// über die Settings-UI editierbar. Form: { [guildId]: { requiredRoleId,
// requiredRoleName } }.
import fs from 'fs';
import path from 'path';
import { config } from './config.js';

function accessPath() {
  // Neben users.json/bots.json im selben data-Verzeichnis ablegen.
  return path.resolve(path.dirname(config.usersConfigPath), 'access.json');
}

function load() {
  const file = accessPath();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  const file = accessPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function getGuildAccess(guildId) {
  return load()[guildId] || { requiredRoleId: '', requiredRoleName: '' };
}

export function getAllAccess() {
  return load();
}

export function setGuildAccess(guildId, { requiredRoleId = '', requiredRoleName = '' } = {}) {
  const data = load();
  if (!requiredRoleId) {
    delete data[guildId];
  } else {
    data[guildId] = { requiredRoleId: String(requiredRoleId), requiredRoleName: String(requiredRoleName || '') };
  }
  save(data);
  return getGuildAccess(guildId);
}
