// Botboard als „echter" Discord-Bot: hält eine Gateway-Verbindung offen, damit
// der Bot Online angezeigt wird, und beantwortet den Text-Befehl `#info`.
// Läuft nur, wenn DISCORD_BOT_TOKEN gesetzt ist. Reine REST-Abfragen (Login-
// Gate, Rollen) laufen unabhängig davon weiter.
import { Client, GatewayIntentBits, Events, ActivityType, ButtonBuilder, ButtonStyle, ActionRowBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } from 'discord.js';
import { config } from './config.js';
import { botTokenConfigured } from './discordBot.js';
import { registrySnapshot, botConfig } from './botRegistry.js';
import { botStatus } from './botClient.js';
import { containerStatus } from './docker.js';
import { getBotboardConfig } from './botboardConfig.js';
import { getGuildAccess } from './accessRegistry.js';

const PRESENCE_REFRESH_MS = 30_000;

let client = null;

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

// Alle aktiven Module mit Online/Offline + Startzeit (für Uptime). Quellen wie
// im Dashboard. Es wird NICHT zwischen Bot und Gameserver unterschieden.
async function collectModuleStatuses() {
  const bots = registrySnapshot().bots.filter((b) => b.enabled !== false);
  return Promise.all(
    bots.map(async (b) => {
      const cfg = botConfig(b.id);
      const name = cfg?.name?.trim() || b.id;
      const isContainer = isContainerModule(cfg);
      let online = false;
      let since = null;
      try {
        const st = isContainer ? await containerStatus(b.id) : await botStatus(b.id);
        online = !!st.online;
        if (online) {
          if (st.startedAt) since = Date.parse(st.startedAt) || null;
          else if (typeof st.uptime === 'number') since = Date.now() - st.uptime * 1000;
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
    client.user.setPresence({
      status: 'online',
      activities: [{ name, type: ActivityType.Watching }],
    });
  } catch (err) {
    console.error('[gateway] presence update failed:', err.message);
  }
}

// Command-Gate: nur Mitglieder mit der für diesen Server konfigurierten
// Access-Rolle dürfen Befehle nutzen. Ohne gesetzte Rolle: jeder im Server.
async function commandGate(message) {
  if (!message.guildId) return { allowed: false };
  const access = getGuildAccess(message.guildId);
  if (!access.requiredRoleId) return { allowed: true };
  let member = message.member;
  if (!member && message.guild) {
    member = await message.guild.members.fetch(message.author.id).catch(() => null);
  }
  return {
    allowed: !!member?.roles?.cache?.has(access.requiredRoleId),
    roleName: access.requiredRoleName || 'the required',
  };
}

// Modul-Liste als farbiger ANSI-Block: grüner/roter Punkt + Name + Status +
// Uptime. Eine Liste „modules", keine Bot/Gameserver-Trennung.
function moduleListBlock(rows) {
  if (!rows.length) return '_no modules_';
  const G = '[0;32m', R = '[0;31m', X = '[0m';
  const nameW = Math.max(4, ...rows.map((r) => r.name.length));
  const lines = rows.map((r) => {
    const c = r.online ? G : R;
    const status = (r.online ? 'online' : 'offline').padEnd(7);
    const up = r.online ? fmtUptime(r.since) : '';
    return `${c}●${X} ${r.name.padEnd(nameW)}   ${c}${status}${X}${up ? `  ${up}` : ''}`;
  });
  return '```ansi\n' + lines.join('\n') + '\n```';
}

// Moderne „Components V2"-Karte: kein Embed, kein Thumbnail. Akzentleiste zeigt
// den Gesamtzustand. Wird von #info UND vom Refresh-Button genutzt.
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

  const header = `## Botboard\n**${onlineCount} / ${rows.length}** modules online`
    + (url ? `\n**[Open dashboard ↗](${url})**` : '');

  const container = new ContainerBuilder().setAccentColor(color);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(header));
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(moduleListBlock(rows)));
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Primary).setCustomId('info:refresh').setLabel('Refresh status'),
  ));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Updated ${stamp}`));

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

async function handleInfo(message) {
  await message.reply(await buildInfoPayload());
}

// Rollen-Check für den Refresh-Button (gleiche Regel wie für die Befehle).
function interactionAllowed(interaction) {
  if (!interaction.guildId) return false;
  const access = getGuildAccess(interaction.guildId);
  if (!access.requiredRoleId) return true;
  const roles = interaction.member?.roles;
  if (roles?.cache) return roles.cache.has(access.requiredRoleId);
  if (Array.isArray(roles)) return roles.includes(access.requiredRoleId);
  return false;
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

  client.once(Events.ClientReady, (c) => {
    console.log(`[gateway] online as ${c.user.tag}`);
    refreshPresence();
    setInterval(refreshPresence, PRESENCE_REFRESH_MS);
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

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton() || interaction.customId !== 'info:refresh') return;
    try {
      if (!interactionAllowed(interaction)) {
        await interaction.reply({ content: '⛔ You do not have access to this.', flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
      }
      await interaction.update(await buildInfoPayload());
    } catch (err) {
      console.error('[gateway] refresh failed:', err.message);
    }
  });

  client.on(Events.Error, (err) => console.error('[gateway] client error:', err.message));

  client.login(config.discord.botToken).catch((err) => {
    console.error('[gateway] login failed:', err.message);
  });
}
