// localStorage-backed persistence for the dashboard: selected server, cached
// login, and per-guild voice targets. Kept in one place so App.jsx stays lean.

const SELECTED_SERVER_KEY = 'botboard:selected-server-id';
const USER_KEY = 'botboard:user';

export function savedUser() {
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveUser(user) {
  if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  else window.localStorage.removeItem(USER_KEY);
}

export function savedServer() {
  try {
    const raw = window.localStorage.getItem(SELECTED_SERVER_KEY);
    if (!raw) return null;
    if (raw.startsWith('{')) return JSON.parse(raw);
    if (/^\d+$/.test(raw)) {
      return { id: raw, name: 'Selected server', members: null };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveServer(server) {
  window.localStorage.setItem(SELECTED_SERVER_KEY, JSON.stringify(server));
}

// Per-bot voice target ('auto' or a channel id), persisted per guild so a
// browser refresh keeps the selection instead of snapping back to Auto.
export function savedVoiceTargets(guildId) {
  try {
    const raw = window.localStorage.getItem(`botboard:voice-targets:${guildId}`);
    return { soundbot: 'auto', newibot: 'auto', ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { soundbot: 'auto', newibot: 'auto' };
  }
}

export function saveVoiceTargets(guildId, targets) {
  try {
    window.localStorage.setItem(`botboard:voice-targets:${guildId}`, JSON.stringify(targets));
  } catch {}
}

// Cleared on logout / when landing on the login screen, so a new login always
// starts back on Auto (a fixed pick only survives refreshes within a session).
export function clearVoiceTargets() {
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith('botboard:voice-targets:')) window.localStorage.removeItem(key);
    }
  } catch {}
}
