// Botboard als „echter" Discord-Bot: hält eine Gateway-Verbindung offen, damit
// der Bot Online angezeigt wird, und beantwortet den Text-Befehl `#info`.
// Läuft nur, wenn DISCORD_BOT_TOKEN gesetzt ist. Reine REST-Abfragen (Login-
// Gate, Rollen) laufen unabhängig davon weiter.
import { Client, GatewayIntentBits, Events, ActivityType, EmbedBuilder } from 'discord.js';
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

// Alle aktiven Module mit Online/Offline — gleiche Quellen wie das Dashboard.
async function collectModuleStatuses() {
  const bots = registrySnapshot().bots.filter((b) => b.enabled !== false);
  return Promise.all(
    bots.map(async (b) => {
      const cfg = botConfig(b.id);
      const name = cfg?.name?.trim() || b.id;
      const isContainer = isContainerModule(cfg);
      let online = false;
      try {
        online = isContainer
          ? (await containerStatus(b.id)).online
          : (await botStatus(b.id)).online;
      } catch {
        online = false;
      }
      return { name, online, kind: isContainer ? 'Gameserver' : 'Bot' };
    })
  );
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

async function handleInfo(message) {
  const rows = await collectModuleStatuses();
  const url = publicUrl();
  const prefix = getBotboardConfig().prefix || '#';
  const onlineCount = rows.filter((r) => r.online).length;

  const render = (list) =>
    list.length ? list.map((r) => `${r.online ? '🟢' : '🔴'} ${r.name}`).join('\n') : '—';
  const bots = rows.filter((r) => r.kind === 'Bot');
  const games = rows.filter((r) => r.kind === 'Gameserver');

  // Farbe spiegelt den Gesamtzustand: grün = alles online, gelb = teilweise,
  // rot = alles offline, grau = nichts konfiguriert.
  const color =
    rows.length === 0 ? 0x6b7280
    : onlineCount === rows.length ? 0x9dda4f
    : onlineCount === 0 ? 0xe05252
    : 0xe5a83b;

  const avatar = message.client.user.displayAvatarURL({ size: 128 });
  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: 'Botboard', iconURL: avatar, url: url || undefined })
    .setThumbnail(avatar)
    .setDescription(url ? `🔗 **[Open dashboard](${url})**` : 'Discord bot dashboard')
    .addFields(
      { name: '🤖 Bots', value: render(bots), inline: true },
      { name: '🎮 Gameservers', value: render(games), inline: true },
      { name: '💬 Commands', value: `\`${prefix}info\` — show this overview`, inline: false },
    )
    .setFooter({ text: `${onlineCount}/${rows.length} modules online` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
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

  client.on(Events.Error, (err) => console.error('[gateway] client error:', err.message));

  client.login(config.discord.botToken).catch((err) => {
    console.error('[gateway] login failed:', err.message);
  });
}
