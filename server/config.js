import fs from 'node:fs';

// Load persisted settings from a mounted .env file into process.env before
// the config object is built. Mirrors the same pattern used in the bots so
// any override written to /app/data/.env takes effect after a restart.
function loadEnvFile() {
  const filePath = process.env.BOTBOARD_ENV_FILE || '/app/data/.env';
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[env] Could not load env file:', err.message);
  }
}
loadEnvFile();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name, fallback = '') {
  return process.env[name] ?? fallback;
}

function boolean(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`Invalid boolean environment variable: ${name}`);
}

function list(name) {
  const raw = process.env[name];
  if (!raw) return [];
  return raw.split(',').map((value) => value.trim()).filter(Boolean);
}

export const config = {
  port: Number(optional('PORT', '3000')),
  sessionSecret: required('SESSION_SECRET'),
  sessionDir: optional('SESSION_DIR', './.sessions'),
  botRegistryPath: optional('BOTS_CONFIG_PATH', './data/bots.json'),
  usersConfigPath: optional('USERS_CONFIG_PATH', './data/users.json'),
  cookieSecure: boolean('COOKIE_SECURE'),
  devAuthBypass: boolean('DEV_AUTH_BYPASS'),
  // Schaltet die gesamte Docker-Steuerung frei (start/stop/restart). Neuer,
  // klarerer Name; der alte DOCKER_RESTART_ENABLED wird weiter akzeptiert,
  // damit bestehende Setups nicht brechen.
  dockerRestartEnabled: boolean('DOCKER_CONTROL_ENABLED') || boolean('DOCKER_RESTART_ENABLED'),

  // „Weiche" Bot-Einstellungen: env liefert den Default (auf Unraid setzbar),
  // das UI kann sie überschreiben. Kein Secret hier — der Token bleibt env-only.
  botboard: {
    prefix: optional('BOTBOARD_PREFIX'),
    statusText: optional('BOTBOARD_STATUS_TEXT'),
    publicUrl: optional('BOTBOARD_PUBLIC_URL'),
  },

  discord: {
    clientId: optional('DISCORD_CLIENT_ID'),
    clientSecret: optional('DISCORD_CLIENT_SECRET'),
    redirectUri: optional('DISCORD_REDIRECT_URI'),
    allowedUserIds: list('ALLOWED_USER_IDS'),
    adminUserIds: list('ADMIN_USER_IDS'),
    // Bot-Token, damit Botboard sich selbst als Bot kennt (eigene Server-Liste,
    // Rollen, Mitglieder). Nur per env/Unraid — nicht über die UI editierbar.
    botToken: optional('DISCORD_BOT_TOKEN'),
  },

  bots: {
    music: {
      url: optional('MUSIC_BOT_URL', 'http://localhost:3001'),
      container: optional('MUSIC_BOT_CONTAINER', 'newimusicbot'),
    },
    sound: {
      url: optional('SOUND_BOT_URL', 'http://localhost:3002'),
      container: optional('SOUND_BOT_CONTAINER', 'soundboard'),
    },
  },

  botApiToken: required('BOT_API_TOKEN'),
  dockerSocket: optional('DOCKER_SOCKET', '/var/run/docker.sock'),
};

export function validateOAuthConfig() {
  return !!(config.discord.clientId && config.discord.clientSecret && config.discord.redirectUri);
}

export function discordOAuthEnabled() {
  return !config.devAuthBypass && validateOAuthConfig();
}

if (!config.devAuthBypass && !validateOAuthConfig()) {
  throw new Error(
    'Discord OAuth variables are required unless DEV_AUTH_BYPASS=true is set for local development'
  );
}
