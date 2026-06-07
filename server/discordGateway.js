// Botboard als „echter" Discord-Bot: hält eine Gateway-Verbindung offen, damit
// der Bot Online angezeigt wird, und beantwortet den Text-Befehl `#info`.
// Läuft nur, wenn DISCORD_BOT_TOKEN gesetzt ist. Reine REST-Abfragen (Login-
// Gate, Rollen) laufen unabhängig davon weiter.
import { Client, GatewayIntentBits, Events, ActivityType, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { config } from './config.js';
import { botTokenConfigured } from './discordBot.js';
import { registrySnapshot, botConfig } from './botRegistry.js';
import { botStatus } from './botClient.js';
import { containerStatus } from './docker.js';
import { getBotboardConfig } from './botboardConfig.js';
import { getGuildAccess } from './accessRegistry.js';

const PRESENCE_REFRESH_MS = 30_000;
const INFO_TTL_MS = 15 * 60 * 1000; // #info-Karten so lange auto-aktualisieren

// Kleine farbige Status-Punkte als App-Emojis (klein, inline, kein Code-Block,
// kein riesiges Unicode-Emoji). Werden beim Start angelegt; Fallback = Zeichen.
const DOT_ONLINE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABD0lEQVR4nO3bwWHDIBBE0eE3k5JSQOpKAS4p1ST3XAxoF4Rm3xlrZhH2RbJUSimlFFdtdeDnz9fvuzWvj+9lvdodBt65Ie3Og6/YiHbC4JkbgQ4bPjqnnTR4xmng5OEj8tkZHuVKD3aEZpjtw8qwbDO9kDmecvdn+5F58V1GeiJzPO3uj/ZF5nji3R/pjcwhc8gcT/3+9/ZH5pA5ZA6ZQ+aQOWQOmeNODyozvOuPzCFzyBw9i079HejpjczRu/C0U9DbF5ljZPEpp2CkJ5kX32G0HzLHzIfuegpmerEyLNNsH3aERrvSg53hEa7mt7gqa58hRG08CrTqNETmNCWxfVf4P9u3xU/5v0AppZQiX38gb3Ra4NQFuAAAAABJRU5ErkJggg==';
const DOT_OFFLINE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABDElEQVR4nO3bwWHDIBBE0eFXkppcqGtKJ849FwPaBaHZd8aaWYR9kSyVUkopxVVbHfj7en2+rfl5v5f1ancYeOeGtDsPvmIj2gmDZ24EOmz46Jx20uAZp4GTh4/IZ2d4lCs92BGaYbYPK8OyzfRC5njK3Z/tR+bFdxnpiczxtLs/2heZ44l3f6Q3MofMIXM89fvf2x+ZQ+aQOWQOmUPmkDlkjjs9qMzwrT8yh8whc/QsOvV3oKc3MkfvwtNOQW9fZI6RxaecgpGeZF58h9F+yBwzH7rrKZjpxcqwTLN92BEa7UoPdoZHuJrf4qqsfYYQtfEo0KrTEJnTlMT2XeH/bN8WP+X/AqWUUop8/QF8rHRazfPyFAAAAABJRU5ErkJggg==';
let dotOnline = '🟢';
let dotOffline = '⚫';

let client = null;
const liveInfo = new Map(); // gepostete #info-Nachricht -> Zeitpunkt (für Auto-Update)

function isContainerModule(cfg) {
  return !!(cfg && cfg.container && !cfg.url);
}

function publicUrl() {
  const configured = getBotboardConfig().publicUrl;
  if (configured) return configured.replace(/\/$/, '');
  try {
    return new URL(config.discord.redirectUri).origin;
  } catch {
    return '';
  }
}

// App-Emojis (kleine Punkte) anlegen, falls noch nicht vorhanden.
async function ensureDots(app) {
  try {
    const existing = await app.emojis.fetch();
    const pick = (name) => existing.find((e) => e.name === name);
    let on = pick('bb_online') || await app.emojis.create({ name: 'bb_online', attachment: Buffer.from(DOT_ONLINE_PNG, 'base64') });
    let off = pick('bb_offline') || await app.emojis.create({ name: 'bb_offline', attachment: Buffer.from(DOT_OFFLINE_PNG, 'base64') });
    dotOnline = `<:${on.name}:${on.id}>`;
    dotOffline = `<:${off.name}:${off.id}>`;
  } catch (err) {
    console.error('[gateway] status emojis unavailable, using fallback:', err.message);
  }
}

// Alle aktiven Module: online? + Startzeit für Uptime. Uptime wird – wenn das
// Modul einen Container hat – aus dem Container gelesen (gilt also auch für die
// HTTP-Bots, nicht nur für reine Gameserver).
async function collectModuleStatuses() {
  const bots = registrySnapshot().bots.filter((b) => b.enabled !== false);
  return Promise.all(
    bots.map(async (b) => {
      const cfg = botConfig(b.id);
      const name = cfg?.name?.trim() || b.id;
      let online = false;
      let since = null;
      try {
        if (isContainerModule(cfg)) {
          const s = await containerStatus(b.id);
          online = !!s.online;
          if (online && s.startedAt) since = Date.parse(s.startedAt) || null;
        } else {
          const s = await botStatus(b.id);
          online = !!s.online;
          if (online) {
            if (cfg?.container) {
              const cs = await containerStatus(b.id).catch(() => null);
              if (cs?.startedAt) since = Date.parse(cs.startedAt) || null;
            }
            if (!since && s.startedAt) since = Date.parse(s.startedAt) || null;
            else if (!since && typeof s.uptime === 'number') since = Date.now() - s.uptime * 1000;
          }
        }
      } catch {
        online = false;
      }
      return { name, online, since };
    })
  );
}

function fmtUptime(sinceMs) {
  if (!sinceMs) return '';
  let s = Math.floor((Date.now() - sinceMs) / 1000);
  if (s < 0) return '';
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export async function refreshPresence() {
  if (!client?.user) return;
  try {
    const { statusText } = getBotboardConfig();
    const rows = await collectModuleStatuses();
    const onlineCount = rows.filter((r) => r.online).length;
    const name = statusText?.trim() || `${onlineCount}/${rows.length} modules online`;
    client.user.setPresence({ status: 'online', activities: [{ name, type: ActivityType.Watching }] });
  } catch (err) {
    console.error('[gateway] presence update failed:', err.message);
  }
}

// Rollen-Check (gleiche Regel für Befehle und Buttons).
function roleAllowed(guildId, member) {
  if (!guildId) return false;
  const access = getGuildAccess(guildId);
  if (!access.requiredRoleId) return true;
  const roles = member?.roles;
  if (roles?.cache) return roles.cache.has(access.requiredRoleId);
  if (Array.isArray(roles)) return roles.includes(access.requiredRoleId);
  return false;
}

async function commandGate(message) {
  if (!message.guildId) return { allowed: false };
  let member = message.member;
  if (!member && message.guild) member = await message.guild.members.fetch(message.author.id).catch(() => null);
  const access = getGuildAccess(message.guildId);
  return { allowed: roleAllowed(message.guildId, member), roleName: access.requiredRoleName || 'the required' };
}

// Moderne „Components V2"-Karte: Akzentleiste = Gesamtzustand, pro Modul eine
// eigene Zeile mit kleinem Farbpunkt + Name + Uptime, grüner Dashboard-Button.
async function buildInfoPayload() {
  const rows = await collectModuleStatuses();
  const url = publicUrl();
  const onlineCount = rows.filter((r) => r.online).length;

  const color =
    rows.length === 0 ? 0x6b7280
    : onlineCount === rows.length ? 0x9dda4f
    : onlineCount === 0 ? 0xe05252
    : 0xe5a83b;

  const stamp = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const container = new ContainerBuilder().setAccentColor(color);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## Botboard\n**${onlineCount} / ${rows.length}** modules online`),
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  if (rows.length) {
    for (const r of rows) {
      const dot = r.online ? dotOnline : dotOffline;
      const up = r.online && r.since ? `  ·  \`up ${fmtUptime(r.since)}\`` : '';
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${dot}  **${r.name}**${up}`));
    }
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('_No modules configured._'));
  }

  if (url) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open dashboard').setURL(url),
    ));
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Auto-updates · ${stamp}`));

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

async function handleInfo(message) {
  const sent = await message.reply(await buildInfoPayload());
  liveInfo.set(sent, Date.now());
}

// Gepostete #info-Karten regelmäßig selbst aktualisieren (kein Button nötig).
async function refreshLiveInfo() {
  if (!liveInfo.size) return;
  let payload = null;
  for (const [msg, postedAt] of liveInfo) {
    if (Date.now() - postedAt > INFO_TTL_MS) { liveInfo.delete(msg); continue; }
    try {
      if (!payload) payload = await buildInfoPayload();
      await msg.edit(payload);
    } catch {
      liveInfo.delete(msg);
    }
  }
}

export function startGateway() {
  if (!botTokenConfigured()) {
    console.log('[gateway] DISCORD_BOT_TOKEN not set — bot stays offline (REST-only mode).');
    return;
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, async (c) => {
    console.log(`[gateway] online as ${c.user.tag}`);
    await ensureDots(c.application);
    refreshPresence();
    setInterval(() => { refreshPresence(); refreshLiveInfo(); }, PRESENCE_REFRESH_MS);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    const prefix = getBotboardConfig().prefix || '#';
    if (!message.content.startsWith(prefix)) return;
    const command = message.content.slice(prefix.length).trim().split(/\s+/)[0]?.toLowerCase();
    if (command !== 'info') return;
    try {
      const gate = await commandGate(message);
      if (!gate.allowed) {
        if (message.guildId) {
          await message.reply(`⛔ You need the **${gate.roleName}** role to use Botboard commands.`).catch(() => {});
        }
        return;
      }
      await handleInfo(message);
    } catch (err) {
      console.error('[gateway] #info failed:', err.message);
    }
  });

  client.on(Events.Error, (err) => console.error('[gateway] client error:', err.message));

  client.login(config.discord.botToken).catch((err) => {
    console.error('[gateway] login failed:', err.message);
  });
}
