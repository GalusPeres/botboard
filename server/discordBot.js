// Botboard als eigener Discord-Bot: Abfragen über den Bot-Token (eigene
// Server-Liste, Rollen eines Servers, Mitglieds-Rollen). Wird für das
// Login-Gate (Mitgliedschaft + optionale Pflichtrolle) und das Rollen-Dropdown
// in den Settings genutzt. Token kommt ausschließlich aus der env (Unraid).
import { config } from './config.js';

const API = 'https://discord.com/api/v10';

export function botTokenConfigured() {
  return !!config.discord.botToken;
}

function authHeaders() {
  return { Authorization: `Bot ${config.discord.botToken}`, Accept: 'application/json' };
}

async function botFetch(path) {
  const res = await fetch(`${API}${path}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Discord bot API ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Server-Liste des Bots — kurz gecacht, damit nicht jeder Login einen Roundtrip
// auslöst. 60 s ist genug, neue Server werden selten hinzugefügt.
let guildCache = { ids: null, at: 0 };
const GUILD_TTL_MS = 60_000;

export async function fetchBotGuildIds() {
  if (!botTokenConfigured()) return new Set();
  const now = Date.now();
  if (guildCache.ids && now - guildCache.at < GUILD_TTL_MS) return guildCache.ids;
  const guilds = (await botFetch('/users/@me/guilds')) || [];
  const ids = new Set(guilds.map((g) => g.id));
  guildCache = { ids, at: now };
  return ids;
}

export function invalidateBotGuildCache() {
  guildCache = { ids: null, at: 0 };
}

// Rollen eines Servers für das Settings-Dropdown. @everyone (id === guildId) und
// von Integrationen verwaltete Rollen werden rausgefiltert; sortiert nach
// Position (oben = wichtigste).
export async function fetchGuildRoles(guildId) {
  if (!botTokenConfigured()) return [];
  const roles = (await botFetch(`/guilds/${guildId}/roles`)) || [];
  return roles
    .filter((r) => r.id !== guildId && !r.managed)
    .sort((a, b) => (b.position ?? 0) - (a.position ?? 0))
    .map((r) => ({ id: r.id, name: r.name, color: r.color }));
}

// Rollen-IDs eines Mitglieds in einem Server. null = nicht im Server (404).
// Kurz gecacht, damit Rollen-/Mitgliedschafts-Checks bei jedem Request günstig
// sind (sie laufen jetzt auch in requirePermission). Fehler werden NICHT
// gecacht (Aufrufer macht fail-open). Änderungen greifen nach ≤ TTL.
const memberCache = new Map(); // `${guildId}:${userId}` -> { roles, at }
const MEMBER_TTL_MS = 10_000;

export async function fetchMemberRoleIds(guildId, userId) {
  if (!botTokenConfigured()) return null;
  const key = `${guildId}:${userId}`;
  const hit = memberCache.get(key);
  if (hit && Date.now() - hit.at < MEMBER_TTL_MS) return hit.roles;
  const member = await botFetch(`/guilds/${guildId}/members/${userId}`);
  const roles = member ? (Array.isArray(member.roles) ? member.roles : []) : null;
  memberCache.set(key, { roles, at: Date.now() });
  return roles;
}
