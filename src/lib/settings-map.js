// Mapping between the UI's flat settings keys (sbPrefix, mbVol, …) and each
// bot's API config keys. Kept in one place so the screens stay dumb. Used only
// by the two built-in bots (sound/music); new bots render from their schema.

export const SETTING_MAP_MUSIC = {
  mbPrefix: 'prefix',
  mbUsername: 'username',
  mbLogLevel: 'logLevel',
  mbSearch: 'defaultSearchPlatform',
  mbVol: 'defaultVolume',
  mbMaxQueue: 'maxQueueSize',
  mbAutoDc: { key: 'autoDisconnectDelay', toApi: (v) => Number(v) * 60 * 1000, fromApi: (v) => Math.round((v || 0) / 60_000) },
  mbConnTimeout: 'connectionTimeout',
  mbCooldown: 'commandCooldown',
  mbRetryDelay: 'lavalinkRetryDelay',
  mbRetryCount: 'lavalinkRetryCount',
  mbMaxPlaylist: 'maxPlaylistSize',
  mbMaxResults: 'maxSearchResults',
  mbFast: 'fastModeEnabled',
  mbUiInterval: 'uiUpdateInterval',
  mbFastUi: 'fastUIUpdates',
  mbProgressLength: 'progressBarLength',
  mbMaxDisplay: 'maxDisplayTracks',
  mbAutoCleanup: 'autoUICleanup',
  mbPauseTimeout: { key: 'pauseTimeout', toApi: (v) => Number(v) * 60 * 1000, fromApi: (v) => Math.round((v || 0) / 60_000) },
  mbVolumeStep: 'volumeStep',
  mbPrebuffer: 'preBufferNext',
  mbSmartVolume: 'smartVolumeControl',
  mbCache: 'cacheEnabled',
  mbCacheResults: 'cacheSearchResults',
  mbCacheTtl: 'cacheTTL',
  mbCacheSize: 'maxCacheSize',
  mbQualityCache: 'trackQualityCache',
  mbConcurrent: 'maxConcurrentSearches',
  mbPrevious: 'maxPreviousTracks',
  llHost: 'lavalinkHost',
  llPort: 'lavalinkPort',
  llPass: 'lavalinkPassword',
  llTimeout: 'lavalinkTimeout',
  emojiPrevious: 'emojiPrevious',
  emojiPlaypause: 'emojiPlaypause',
  emojiSkip: 'emojiSkip',
  emojiShuffle: 'emojiShuffle',
  emojiStop: 'emojiStop',
  emojiYt: 'emojiYt',
  emojiYtm: 'emojiYtm',
};

export const SETTING_MAP_SOUND = {
  sbPrefix: 'prefix',
  sbMaxMb: 'maxUploadSizeMb',
  sbMaxName: 'maxFilenameLength',
  sbAutoLeave: { key: 'autoLeaveDelayMs', toApi: (v) => Number(v) * 1000, fromApi: (v) => Math.round((v || 0) / 1000) },
};

export function mapSettingsPatch(uiPatch, map) {
  const out = {};
  for (const [uiKey, value] of Object.entries(uiPatch)) {
    const spec = map[uiKey];
    if (!spec) continue;
    const apiKey = typeof spec === 'string' ? spec : spec.key;
    out[apiKey] = typeof spec === 'object' && spec.toApi ? spec.toApi(value) : value;
  }
  return out;
}

export function mergeSettings(music, sound) {
  const out = {
    sbPrefix: '8', sbMaxMb: 10, sbMaxName: 10, sbAutoLeave: 30,
    mbPrefix: '.', mbUsername: 'Music Bot', mbLogLevel: 'info', mbSearch: 'ytsearch', mbVol: 40, mbMaxQueue: 1000,
    mbAutoDc: 5, mbConnTimeout: 7000, mbCooldown: 2000, mbRetryDelay: 5000, mbRetryCount: 3,
    mbMaxPlaylist: 50, mbMaxResults: 10, mbFast: true, mbUiInterval: 3000, mbFastUi: true,
    mbProgressLength: 18, mbMaxDisplay: 10, mbAutoCleanup: true, mbPauseTimeout: 20, mbVolumeStep: 5,
    mbPrebuffer: true, mbSmartVolume: true, mbCache: true, mbCacheResults: true, mbCacheTtl: 300,
    mbCacheSize: 500, mbQualityCache: true, mbConcurrent: 3, mbPrevious: 50,
    llHost: 'localhost', llPort: 2333, llPass: '******', llTimeout: 15000,
    emojiPrevious: '', emojiPlaypause: '', emojiSkip: '', emojiShuffle: '', emojiStop: '', emojiYt: '', emojiYtm: '',
  };
  if (music) {
    for (const [uiKey, spec] of Object.entries(SETTING_MAP_MUSIC)) {
      const apiKey = typeof spec === 'string' ? spec : spec.key;
      let val = music[apiKey];
      if (typeof spec === 'object' && spec.fromApi) val = spec.fromApi(val);
      if (val !== undefined) out[uiKey] = val;
    }
    if (music.lavalinkPassword) out.llPass = music.lavalinkPassword;
  }
  if (sound) {
    for (const [uiKey, spec] of Object.entries(SETTING_MAP_SOUND)) {
      const apiKey = typeof spec === 'string' ? spec : spec.key;
      let val = sound[apiKey];
      if (typeof spec === 'object' && spec.fromApi) val = spec.fromApi(val);
      if (val !== undefined) out[uiKey] = val;
    }
  }
  return out;
}
