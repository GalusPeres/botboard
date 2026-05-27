// Thin fetch wrappers grouped by domain. All requests include credentials so
// the session cookie travels. 401 from any call signals "not logged in" — the
// app reacts by sending the user to the Discord OAuth flow.

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
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
  logout: () => api('/api/auth/logout', { method: 'POST' }),
  loginUrl: '/api/auth/discord',
};

export const bots = {
  status: () => api('/api/bots'),
  restart: (bot) => api(`/api/bots/${bot}/restart`, { method: 'POST' }),
  servers: () => api('/api/bots/servers'),
};

export const music = {
  guilds: () => api('/api/bots/music/guilds'),
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
