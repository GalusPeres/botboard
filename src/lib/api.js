// Thin fetch wrappers grouped by domain. All requests include credentials so
// the session cookie travels. 401 from any call signals "not logged in" — the
// app reacts by sending the user to the Discord OAuth flow.

// Aktueller Server (Guild). Wird vom App-Shell synchron beim Render gesetzt und
// als X-Guild-Id-Header mitgeschickt, damit alle per-Server-Checks deterministisch
// auf den GERADE gewählten Server zielen (keine Race über die Session).
let activeGuildId = null;
export function setActiveGuild(id) { activeGuildId = id || null; }

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (activeGuildId) headers['X-Guild-Id'] = activeGuildId;
  let body = opts.body;
  if (body && !(body instanceof FormData) && typeof body !== 'string') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const res = await fetch(path, {
    method: opts.method || 'GET',
    credentials: 'include',
    headers,
    body,
  });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const err = new Error(data?.error || `${res.status} ${res.statusText}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export const auth = {
  me: () => api('/api/me'),
  setActiveServer: (guildId) => api('/api/auth/active-server', { method: 'POST', body: { guildId } }),
  logout: () => api('/api/auth/logout', { method: 'POST' }),
  loginUrl: '/api/auth/discord',
};

export const bots = {
  status: () => api('/api/bots'),
  modules: () => api('/api/bots/modules'),
  registry: () => api('/api/bots/registry'),
  testRegistry: (bot) => api('/api/bots/registry/test', { method: 'POST', body: bot }),
  addRegistry: (bot) => api('/api/bots/registry', { method: 'POST', body: bot }),
  updateRegistry: (bot, patch) => api(`/api/bots/registry/${encodeURIComponent(bot)}`, { method: 'PUT', body: patch }),
  deleteRegistry: (bot) => api(`/api/bots/registry/${encodeURIComponent(bot)}`, { method: 'DELETE' }),
  reorderRegistry: (id, direction) => api('/api/bots/registry/reorder', { method: 'POST', body: { id, direction } }),
  reorderRegistryAll: (order) => api('/api/bots/registry/reorder', { method: 'POST', body: { order } }),
  restart: (bot) => api(`/api/bots/${bot}/restart`, { method: 'POST' }),
  stop:    (bot) => api(`/api/bots/${bot}/stop`,    { method: 'POST' }),
  start:   (bot) => api(`/api/bots/${bot}/start`,   { method: 'POST' }),
  servers: () => api('/api/bots/servers'),
};

export const moduleApi = {
  stats: (bot) => api(`/api/bots/${encodeURIComponent(bot)}/stats`),
  containerLogs: (bot) => api(`/api/bots/${encodeURIComponent(bot)}/logs/tail`),
  settings: (bot) => api(`/api/bots/${encodeURIComponent(bot)}/settings`),
  settingsSchema: (bot) => api(`/api/bots/${encodeURIComponent(bot)}/settings/schema`),
  saveSettings: (bot, patch) => api(`/api/bots/${encodeURIComponent(bot)}/settings`, { method: 'PUT', body: patch }),
  patches: (bot) => api(`/api/bots/${encodeURIComponent(bot)}/patches`),
  sources: (bot) => api(`/api/bots/${encodeURIComponent(bot)}/sources`),
  guild: (bot, guildId) => api(`/api/bots/${encodeURIComponent(bot)}/guilds/${encodeURIComponent(guildId)}`),
  checkPatches: (bot, post = false) => api(`/api/bots/${encodeURIComponent(bot)}/check`, { method: 'POST', body: { post } }),
  addSource: (bot, data) => api(`/api/bots/${encodeURIComponent(bot)}/sources`, { method: 'POST', body: data }),
  updateSource: (bot, sourceId, patch) => api(`/api/bots/${encodeURIComponent(bot)}/sources/${encodeURIComponent(sourceId)}`, { method: 'PUT', body: patch }),
  deleteSource: (bot, sourceId) => api(`/api/bots/${encodeURIComponent(bot)}/sources/${encodeURIComponent(sourceId)}`, { method: 'DELETE' }),
  postPatch: (bot, patchId, channelId = '') => api(`/api/bots/${encodeURIComponent(bot)}/patches/${encodeURIComponent(patchId)}/post`, { method: 'POST', body: { channelId } }),
};

export const music = {
  guilds: () => api('/api/bots/music/guilds'),
  guild: (guildId) => api(`/api/bots/music/guilds/${guildId}`),
  player: (guildId) => api(`/api/bots/music/guilds/${guildId}/player`),
  connect: (guildId, channelId) => api(`/api/bots/music/guilds/${guildId}/player/connect`, { method: 'POST', body: { channelId } }),
  search: (guildId, query) => api(`/api/bots/music/guilds/${guildId}/player/search`, { method: 'POST', body: { query } }),
  play: (guildId, body) => api(`/api/bots/music/guilds/${guildId}/player/play`, { method: 'POST', body }),
  pause: (guildId) => api(`/api/bots/music/guilds/${guildId}/player/pause`, { method: 'POST' }),
  skip: (guildId) => api(`/api/bots/music/guilds/${guildId}/player/skip`, { method: 'POST' }),
  previous: (guildId) => api(`/api/bots/music/guilds/${guildId}/player/previous`, { method: 'POST' }),
  stop: (guildId) => api(`/api/bots/music/guilds/${guildId}/player/stop`, { method: 'POST' }),
  volume: (guildId, value) => api(`/api/bots/music/guilds/${guildId}/player/volume`, { method: 'POST', body: { value } }),
  seek: (guildId, position) => api(`/api/bots/music/guilds/${guildId}/player/seek`, { method: 'POST', body: { position } }),
  shuffle: (guildId) => api(`/api/bots/music/guilds/${guildId}/player/shuffle`, { method: 'POST' }),
  repeat: (guildId, mode) => api(`/api/bots/music/guilds/${guildId}/player/repeat`, { method: 'POST', body: { mode } }),
  clear: (guildId) => api(`/api/bots/music/guilds/${guildId}/player/clear`, { method: 'POST' }),
  remove: (guildId, index) => api(`/api/bots/music/guilds/${guildId}/player/remove`, { method: 'POST', body: { index } }),
  move: (guildId, from, to) => api(`/api/bots/music/guilds/${guildId}/player/move`, { method: 'POST', body: { from, to } }),
  jump: (guildId, index) => api(`/api/bots/music/guilds/${guildId}/player/jump`, { method: 'POST', body: { index } }),
  disconnect: (guildId) => api(`/api/bots/music/guilds/${guildId}/player`, { method: 'DELETE' }),
  settings: () => api('/api/bots/music/settings'),
  saveSettings: (patch) => api('/api/bots/music/settings', { method: 'PUT', body: patch }),
};

export const sound = {
  guilds: () => api('/api/bots/sound/guilds'),
  guild: (guildId) => api(`/api/bots/sound/guilds/${guildId}`),
  list: () => api('/api/bots/sound/sounds'),
  upload: (file, name) => {
    const fd = new FormData();
    if (name) fd.append('name', name);
    fd.append('file', file);
    return api('/api/bots/sound/sounds', { method: 'POST', body: fd });
  },
  rename: (name, newName) => api(`/api/bots/sound/sounds/${name}`, { method: 'PATCH', body: { name: newName } }),
  remove: (name) => api(`/api/bots/sound/sounds/${name}`, { method: 'DELETE' }),
  play: ({ guildId, channelId, sound: soundName }) =>
    api('/api/bots/sound/play', { method: 'POST', body: { guildId, channelId, sound: soundName } }),
  connect: ({ guildId, channelId }) => api('/api/bots/sound/play/connect', { method: 'POST', body: { guildId, channelId } }),
  stop: () => api('/api/bots/sound/play', { method: 'DELETE' }),
  disconnect: () => api('/api/bots/sound/play/disconnect', { method: 'POST' }),
  current: () => api('/api/bots/sound/play'),
  settings: () => api('/api/bots/sound/settings'),
  saveSettings: (patch) => api('/api/bots/sound/settings', { method: 'PUT', body: patch }),
  previewUrl: (name) => `/api/bots/sound/sounds/${encodeURIComponent(name)}/file`,
  downloadUrl: (name) => `/api/bots/sound/sounds/${encodeURIComponent(name)}/file`,
  downloadAllUrl: () => `/api/bots/sound/sounds/download-zip`,
};

export const access = {
  get: (guildId) => api(`/api/access/${encodeURIComponent(guildId)}`),
  set: (guildId, body) => api(`/api/access/${encodeURIComponent(guildId)}`, { method: 'PUT', body }),
};

export const botboardConfig = {
  get: () => api('/api/botboard-config'),
  set: (body) => api('/api/botboard-config', { method: 'PUT', body }),
};

export const users = {
  list: () => api('/api/users'),
  add: (user) => api('/api/users', { method: 'POST', body: user }),
  setPermissions: (id, permissions) => api(`/api/users/${encodeURIComponent(id)}/permissions`, { method: 'PATCH', body: permissions }),
  guildMembers: (guildId) => api(`/api/users/guild-members/${encodeURIComponent(guildId)}`),
};

export function logsSSE(onMessage, onError, onOpen) {
  const es = new EventSource('/api/logs/stream', { withCredentials: true });
  es.onmessage = (ev) => {
    try {
      onMessage(JSON.parse(ev.data));
    } catch (err) {
      console.warn('log parse failed', err);
    }
  };
  if (onError) es.onerror = onError;
  if (onOpen) es.onopen = onOpen;
  return () => es.close();
}

export const logs = {
  list: () => api('/api/logs'),
};
