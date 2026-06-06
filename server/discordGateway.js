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

const PRESENCE_REFRESH_MS = 60_000;

let client = null;

function isContainerModule(cfg) {
  return !!(cfg && cfg.container && !cfg.url);
}

function publicUrl() {
  if (config.publicUrl) return config.publicUrl.replace(/\/$/, '');
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

async function handleInfo(message) {
  const rows = await collectModuleStatuses();
  const url = publicUrl();
  const lines = rows.length
    ? rows
        .map((r) => `${r.online ? '🟢' : '🔴'} **${r.name}** — ${r.kind} · ${r.online ? 'Online' : 'Offline'}`)
        .join('\n')
    : '_No modules configured._';

  const embed = new EmbedBuilder()
    .setColor(0x9dda4f)
    .setTitle('Botboard')
    .setDescription(url ? `Dashboard: ${url}` : 'Dashboard URL not configured.')
    .addFields({ name: 'Modules', value: lines })
    .setFooter({ text: `${rows.filter((r) => r.online).length}/${rows.length} online` });

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
