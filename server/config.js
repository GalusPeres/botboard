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
  cookieSecure: boolean('COOKIE_SECURE'),
  devAuthBypass: boolean('DEV_AUTH_BYPASS'),
  dockerRestartEnabled: boolean('DOCKER_RESTART_ENABLED'),

  discord: {
    clientId: optional('DISCORD_CLIENT_ID'),
    clientSecret: optional('DISCORD_CLIENT_SECRET'),
    redirectUri: optional('DISCORD_REDIRECT_URI'),
    allowedUserIds: list('ALLOWED_USER_IDS'),
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
