export function botDisplayName(bot, fallback = 'Bot') {
  const raw = bot?.displayName || bot?.username || bot?.globalName || bot?.applicationName || bot?.tag || fallback;
  const clean = String(raw || '').replace(/#\d+$/, '').trim();
  return clean || fallback;
}

// botId is the module ID: 'sound', 'music', 'patchwatcher', …
export function dashboardBotName(botId, botInfo = {}) {
  const defaults = { sound: 'Sound Bot', music: 'Music Bot' };
  return botDisplayName(botInfo[botId], defaults[botId] || 'Bot');
}

export function moduleDisplayName(module, fallback = 'Bot') {
  return botDisplayName(
    module?.manifest?.bot || {
      displayName: module?.manifest?.displayName,
      username: module?.manifest?.name,
      tag: module?.status?.bot?.tag,
    },
    module?.manifest?.displayName || module?.status?.name || fallback,
  );
}

export function moduleAvatar(module) {
  return module?.manifest?.bot?.avatar || module?.status?.bot?.avatar || null;
}
