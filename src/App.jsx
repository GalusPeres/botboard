// Main App — login flow, route table, live data wiring.
// All mutating actions go through src/api.js; reads are either one-shot
// (useFetch) or periodic (usePoll). Logs come in via SSE.
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sidebar, Topbar, MobileMoreSheet, routeMeta } from './layout/sidebar.jsx';
import { Icon, Row } from './ui/components.jsx';
import { LoginScreen, ServerSelectScreen } from './screens/auth.jsx';
import { OverviewScreen } from './screens/overview.jsx';
import { LogsScreen } from './pages/logs.jsx';
import PAGE_RENDERERS from './pages/registry.js';
import { BotRegistryScreen } from './screens/registry-screen.jsx';
import { AdminScreen } from './screens/admin-screen.jsx';
import { dashboardBotName, moduleDisplayName } from './lib/botIdentity.js';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakColor } from './layout/tweaks-panel.jsx';
import * as API from './lib/api.js';
import { useFetch, usePoll, useSSE, useHashRoute } from './lib/hooks.js';
import { adaptTrack, adaptSound, normalizeLog, msToClock, formatBytes, relativeTime } from './lib/format.js';
import { savedUser, saveUser, savedServer, saveServer, savedVoiceTargets, saveVoiceTargets, clearVoiceTargets, savedBotInfo, saveBotInfo, savedModules, saveModules, savedModuleOrder, saveModuleOrder } from './lib/storage.js';
import { SETTING_MAP_MUSIC, SETTING_MAP_SOUND, mapSettingsPatch, mergeSettings } from './lib/settings-map.js';

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  accent: 'lime',
  playerStyle: 'split',
  tileSize: 'md',
  showActivity: true,
}/*EDITMODE-END*/;

const ACCENTS = {
  lime:   { l: 0.82, c: 0.18, h: 130, name: 'Lime' },
  violet: { l: 0.72, c: 0.18, h: 295, name: 'Violet' },
  cyan:   { l: 0.78, c: 0.15, h: 215, name: 'Cyan' },
  amber:  { l: 0.80, c: 0.16, h: 70,  name: 'Amber' },
  rose:   { l: 0.72, c: 0.18, h: 10,  name: 'Rose' },
};

function applyAccent(key) {
  const a = ACCENTS[key] || ACCENTS.lime;
  const root = document.documentElement;
  root.style.setProperty('--accent', `oklch(${a.l} ${a.c} ${a.h})`);
  root.style.setProperty('--accent-soft', `oklch(${a.l} ${a.c} ${a.h} / 0.16)`);
  root.style.setProperty('--accent-fg', a.l > 0.7 ? 'oklch(0.18 0.05 ' + a.h + ')' : 'oklch(0.98 0.01 ' + a.h + ')');
}

const POLL_STATUS_MS = 2000;
const POLL_PLAYER_MS = 2000;
const POLL_GUILD_MS = 1000; // faster for voice-channel detection

export default function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  // Render the app shell immediately for returning users (cached login + server)
  // and revalidate auth in the background, so a refresh doesn't flash the boot screen.
  const initialUser = savedUser();
  const initialServer = savedServer();
  const [stage, setStage] = useState(initialUser && initialServer?.id ? 'app' : 'boot');
  const [user, setUser] = useState(initialUser);
  const [server, setServer] = useState(initialServer);
  const [route, setRouteRaw] = useHashRoute('overview');
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);

  // Lock body scroll when mobile drawer is open (iOS workaround)
  useEffect(() => {
    if (moreSheetOpen) {
      document.body.classList.add('drawer-open');
    } else {
      document.body.classList.remove('drawer-open');
    }
    return () => document.body.classList.remove('drawer-open');
  }, [moreSheetOpen]);

  const perms = user?.permissions || {};
  const setRoute = (next) => {
    if (['bot-modules'].includes(next) && !perms.botModules) return;
    if (['admin', 'botboard-logs', 'manage-navigation', 'manage-settings'].includes(next) && !perms.userManagement) return;
    if (String(next).endsWith('/settings') && !(perms.settings || perms.restartBot || perms.startStop)) return;
    setRouteRaw(next);
  };

  // Aktiven Server serverseitig setzen (validiert das Rollen-Gate) und die
  // per-Server-Rechte holen. Läuft bei App-Start und jedem Serverwechsel.
  useEffect(() => {
    if (stage !== 'app' || !server?.id) return;
    let cancelled = false;
    API.auth.setActiveServer(server.id)
      .then((res) => { if (!cancelled && res?.user) setUser((prev) => ({ ...prev, ...res.user })); })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 403 || err.status === 401) {
          // Kein Zugang (mehr) zu diesem Server → zurück zur Serverauswahl.
          saveServer(null);
          setServer(null);
          setStage('server');
        }
      });
    return () => { cancelled = true; };
  }, [server?.id, stage]);

  // Poll permissions every 2 s so changes made in Roles take effect live.
  useEffect(() => {
    if (stage !== 'app') return;
    const id = setInterval(async () => {
      try {
        const me = await API.auth.me();
        if (!me.user) return;
        // Zugang zum aktiven Server verloren (Rolle/Mitgliedschaft weg) → raus,
        // ohne dass der User neu laden muss.
        if (me.activeGuildAllowed === false) {
          saveServer(null);
          setServer(null);
          setStage('server');
          return;
        }
        const newPerms = me.user.permissions || {};
        setUser((prev) => {
          if (JSON.stringify(prev?.permissions) === JSON.stringify(newPerms)) return prev;
          return { ...prev, permissions: newPerms };
        });
      } catch {}
    }, 2000);
    return () => clearInterval(id);
  }, [stage]);

  // If the current route requires a permission that was just revoked, go to overview.
  const ROUTE_PERM = {
    'bot-modules': 'botModules',
    'admin': 'userManagement',
    'botboard-logs': 'userManagement',
    'manage-navigation': 'userManagement',
    'manage-settings': 'userManagement',
  };
  useEffect(() => {
    if (String(route).endsWith('/settings')) {
      // Settings-Seite ist offen für Config ODER Restart ODER Start/Stop.
      if (!(perms.settings || perms.restartBot || perms.startStop)) setRouteRaw('overview');
      return;
    }
    const required = ROUTE_PERM[route];
    if (required && perms[required] === false) setRouteRaw('overview');
  }, [perms]);

  const [currentSound, setCurrentSound] = useState(null);
  const [currentPreview, setCurrentPreview] = useState(null);
  const [toast, setToast] = useState(null);

  const [restartConfirm, setRestartConfirm] = useState(null);
  const [stopConfirm, setStopConfirm] = useState(null);
  const [authConfigured, setAuthConfigured] = useState(true);
  const [restartEnabled, setRestartEnabled] = useState(false);

  const [liveLogs, setLiveLogs] = useState([]);
  const [logConnection, setLogConnection] = useState({ state: 'connecting', message: '' });

  useEffect(() => { applyAccent(t.accent); }, [t.accent]);

  useEffect(() => {
    API.auth.me().then((me) => {
      setAuthConfigured(me.authConfigured);
      setRestartEnabled(!!me.restartEnabled);
      if (me.user) {
        setUser(me.user);
        saveUser(me.user);
        const previousServer = savedServer();
        if (previousServer?.id) {
          setServer(previousServer);
          setStage('app');
        } else {
          setStage('server');
        }
      } else {
        saveUser(null);
        clearVoiceTargets();
        setUser(null);
        setStage('login');
      }
    }).catch(() => { saveUser(null); clearVoiceTargets(); setUser(null); setStage('login'); });
  }, []);

  const onLogin = () => {
    if (authConfigured) {
      window.location.replace(API.auth.loginUrl);
    } else {
      setUser({ id: 'dev', username: 'dev', avatar: null, dev: true });
      setStage('server');
    }
  };

  const onLogout = async () => {
    try { await API.auth.logout(); } catch {}
    saveUser(null);
    clearVoiceTargets();
    setUser(null);
    setServer(null);
    setStage('login');
  };

  const selectServer = (selectedServer) => {
    if (!selectedServer) return;
    saveServer(selectedServer);
    setServer(selectedServer);
    setStage('app');
    setRoute('overview');
  };

  if (stage === 'boot') {
    return <div className="login-wrap"><div className="login-card"><div className="login-mark">B</div><h1 className="login-title">Botboard</h1><p className="login-sub">Loading…</p></div></div>;
  }
  if (stage === 'login') {
    return (
      <>
        <LoginScreen onLogin={onLogin}/>
        <TweaksUI t={t} setTweak={setTweak}/>
      </>
    );
  }
  if (stage === 'server') {
    return (
      <>
        <ServerSelect
          onPick={selectServer}
          onLogout={onLogout}
        />
        <TweaksUI t={t} setTweak={setTweak}/>
      </>
    );
  }

  return (
    <DashboardApp
      user={user}
      server={server}
      setServer={setServer}
      route={route}
      setRoute={setRoute}
      currentSound={currentSound}
      setCurrentSound={setCurrentSound}
      currentPreview={currentPreview}
      setCurrentPreview={setCurrentPreview}
      moreSheetOpen={moreSheetOpen}
      setMoreSheetOpen={setMoreSheetOpen}
      restartConfirm={restartConfirm}
      setRestartConfirm={setRestartConfirm}
      stopConfirm={stopConfirm}
      setStopConfirm={setStopConfirm}
      restartEnabled={restartEnabled}
      toast={toast}
      setToast={setToast}
      liveLogs={liveLogs}
      setLiveLogs={setLiveLogs}
      logConnection={logConnection}
      setLogConnection={setLogConnection}
      onLogout={onLogout}
      tweaks={t}
      setTweak={setTweak}
    />
  );
}

const ServerSelect = ({ onPick, onLogout }) => {
  const { data: servers, loading, error } = useFetch(API.bots.servers);

  return (
    <ServerSelectScreen
      servers={servers || []}
      loading={loading}
      error={error}
      onPick={onPick}
      onLogout={onLogout}
    />
  );
};

function DashboardApp(props) {
  const {
    user, server, setServer, route, setRoute,
    currentSound, setCurrentSound, currentPreview, setCurrentPreview,
    moreSheetOpen, setMoreSheetOpen,
    restartConfirm, setRestartConfirm, stopConfirm, setStopConfirm, restartEnabled,
    toast, setToast,
    liveLogs, setLiveLogs, logConnection, setLogConnection,
    onLogout, tweaks, setTweak,
  } = props;

  const perms = user?.permissions || {};
  const guildId = server.id;
  // Synchron (vor allen Effects/Fetches) den aktiven Server für die API setzen,
  // damit jeder Request den X-Guild-Id-Header des GERADE gewählten Servers trägt.
  API.setActiveGuild(guildId);
  const previewAudioRef = useRef(null);
  const { data: serverOptions } = useFetch(API.bots.servers, [guildId]);
  const { data: modulesData, reload: reloadModules } = usePoll(API.bots.modules, POLL_STATUS_MS, [guildId]);
  // Cache: extraModules wie Patchwatcher erscheinen sofort beim Refresh,
  // statt erst nach dem ersten Poll zu verschwinden und wieder aufzutauchen.
  const [cachedModules, setCachedModules] = useState(() => savedModules() || []);
  // Wenn ein Bot neu startet liefert sein Manifest kurz keine Pages (fetch schlägt fehl).
  // In diesem Fall die gecachten Pages behalten damit der Bot in der Sidebar bleibt.
  const mergeWithCache = (live) => live.map(m => {
    const prev = cachedModules.find(c => c.id === m.id);
    if (!prev) return m;
    // Wenn Manifest-Fetch fehlschlägt (Bot startet neu): Pages, Avatar und
    // displayName aus Cache bewahren damit Sidebar korrekt bleibt.
    const pages       = m.manifest?.pages?.length       ? m.manifest.pages       : (prev.manifest?.pages       || []);
    const bot         = m.manifest?.bot                 ?? prev.manifest?.bot     ?? null;
    const displayName = m.manifest?.displayName         || prev.manifest?.displayName || m.id;
    const icon        = m.manifest?.icon                || prev.manifest?.icon    || 'grid';
    if (pages === m.manifest?.pages && bot === m.manifest?.bot) return m; // nichts geändert
    return { ...m, manifest: { ...(m.manifest || {}), pages, bot, displayName, icon } };
  });
  const allModules = modulesData ? mergeWithCache(modulesData) : cachedModules;
  const modules = allModules.filter((module) => module.visible !== false);
  const [moduleOrder, setModuleOrder] = useState(() => savedModuleOrder(guildId));
  useEffect(() => {
    if (modulesData !== null) {
      const merged = mergeWithCache(modulesData);
      setCachedModules(merged);
      saveModules(merged);
    }
  }, [modulesData]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setModuleOrder(savedModuleOrder(guildId));
  }, [guildId]);
  const sortedModules = useMemo(() => {
    const index = new Map(moduleOrder.map((id, position) => [id, position]));
    const originalIndex = new Map(modules.map((module, position) => [module.id, position]));
    return [...modules].sort((left, right) => {
      const leftIndex = index.has(left.id) ? index.get(left.id) : Number.MAX_SAFE_INTEGER;
      const rightIndex = index.has(right.id) ? index.get(right.id) : Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      return (originalIndex.get(left.id) || 0) - (originalIndex.get(right.id) || 0);
    });
  }, [modules, moduleOrder]);
  const updateModuleOrder = useCallback((order) => {
    setModuleOrder(order);
    saveModuleOrder(guildId, order);
  }, [guildId]);
  const moduleById = new Map(sortedModules.map((module) => [module.id, module]));

  useEffect(() => {
    if (!serverOptions) return; // noch nicht geladen
    const freshServer = serverOptions.find((option) => option.id === guildId);
    if (!freshServer) {
      // Aktueller Server nicht (mehr) erlaubt (z. B. Rolle fehlt) → auf einen
      // erlaubten wechseln, damit eine gecachte Auswahl nicht durchrutscht.
      if (serverOptions.length > 0) {
        saveServer(serverOptions[0]);
        setServer(serverOptions[0]);
        setRoute('overview');
      }
      return;
    }
    if (freshServer.name === server.name
      && freshServer.icon === server.icon
      && freshServer.members === server.members) return;
    saveServer(freshServer);
    setServer(freshServer);
  }, [guildId, server.icon, server.members, server.name, serverOptions, setServer]);

  const changeServer = (selectedServer) => {
    if (!selectedServer || selectedServer.id === guildId) return;
    saveServer(selectedServer);
    setServer(selectedServer);
    // Menüpunkt beibehalten, wenn er auf dem neuen Server existiert. Allgemeine/
    // Manage-Seiten (kein bot/-Prefix) bleiben sowieso. Bot-Seiten nur, wenn der
    // Bot dort sichtbar ist (Container überall, sonst Mitgliedschaft im Server).
    const match = String(route).match(/^bot\/([^/]+)\/[^/]+$/);
    if (match) {
      const botId = match[1];
      const module = sortedModules.find((m) => m.id === botId);
      const isContainer = module?.manifest?.type === 'container';
      const visible = isContainer || (Array.isArray(selectedServer.bots) && selectedServer.bots.includes(botId));
      if (!visible) setRoute('overview');
    }
  };

  const { data: statusData, reload: reloadStatus } = usePoll(API.bots.status, POLL_STATUS_MS, [guildId]);

  // All keyed by module ID (e.g. 'sound', 'music', 'patchwatcher') — no hardcoding.
  // botStatus and botInfo come from the cached modules, so they're correct on first render.
  const botStatus = Object.fromEntries(sortedModules.map((m) => [m.id, m.online ? 'online' : 'offline']));
  const botInfo   = Object.fromEntries(sortedModules.map((m) => [m.id, m.manifest?.bot || m.status?.bot || null]));
  const displayNames = Object.fromEntries(sortedModules.map((m) => [m.id, moduleDisplayName(m, m.id)]));

  const { data: guildDetail, reload: reloadGuildDetail } = usePoll(async () => {
    // Fetch just this guild from music bot (primary), fall back to sound bot.
    // Much faster than fetching all guilds from both bots every tick.
    const result = await API.music.guild(guildId).catch(() => null)
      || await API.sound.guild(guildId).catch(() => null);
    return result;
  }, POLL_GUILD_MS, [guildId]);
  const voiceChannels = guildDetail?.voiceChannels || [];

  // Per-bot voice target. Default 'auto' = follow the channel the user is in.
  // A pinned channel id is kept until the user changes it (never overwritten by
  // the auto-detect below).
  const [userVoiceChannel, setUserVoiceChannel] = useState(null);
  const [voiceTargets, setVoiceTargets] = useState(() => savedVoiceTargets(guildId));

  useEffect(() => {
    setVoiceTargets(savedVoiceTargets(guildId));
    setUserVoiceChannel(null);
  }, [guildId]);

  useEffect(() => {
    setUserVoiceChannel(voiceChannels.find((vc) => vc.id === guildDetail?.userVoiceChannelId) || null);
  }, [guildDetail?.userVoiceChannelId, voiceChannels]);

  const { data: rawPlayer, error: playerError, reload: reloadPlayer } = usePoll(
    () => API.music.player(guildId),
    POLL_PLAYER_MS,
    [guildId],
  );
  const { data: soundStats } = usePoll(
    () => API.moduleApi.stats('sound').catch(() => null),
    5000,
    [guildId],
  );
  const { data: musicStats } = usePoll(
    () => API.moduleApi.stats('music').catch(() => null),
    5000,
    [guildId],
  );

  useEffect(() => {
    reloadStatus();
    reloadGuildDetail();
    reloadPlayer();
  }, [route, reloadStatus, reloadGuildDetail, reloadPlayer]);

  const resolveTarget = useCallback((botKey) => {
    const sel = voiceTargets[botKey] || 'auto';
    if (sel === 'auto') return userVoiceChannel;
    return voiceChannels.find((vc) => vc.id === sel) || null;
  }, [voiceTargets, userVoiceChannel, voiceChannels]);

  const setVoiceTarget = useCallback((botKey, value) => {
    setVoiceTargets((prev) => {
      const next = { ...prev, [botKey]: value };
      saveVoiceTargets(guildId, next);
      return next;
    });
  }, [guildId]);

  const botVoiceChannelId = {
    sound: statusData?.sound?.voiceChannelId || null,
    music: rawPlayer?.voiceChannelId || null,
  };

  const playerState = rawPlayer ? {
    queue: [rawPlayer.current, ...rawPlayer.queue].filter(Boolean).map(adaptTrack),
    currentIdx: 0,
    isPlaying: rawPlayer.playing && !rawPlayer.paused,
    position: Math.floor((rawPlayer.position || 0) / 1000),
    volume: rawPlayer.volume ?? 40,
    shuffle: false,
    repeat: rawPlayer.repeatMode === 'track',
    previous: (rawPlayer.previous || []).map(adaptTrack),
  } : { queue: [], currentIdx: 0, isPlaying: false, position: 0, volume: 40, shuffle: false, repeat: false, previous: [] };

  const dispatchPlayer = useCallback(async (action) => {
    try {
      switch (action.type) {
        case 'toggle': await API.music.pause(guildId); break;
        case 'next': await API.music.skip(guildId); break;
        case 'prev': await API.music.previous(guildId); break;
        case 'jump': await API.music.jump(guildId, action.idx); break;
        case 'seek': await API.music.seek(guildId, Math.floor(action.pos * 1000)); break;
        case 'volume': await API.music.volume(guildId, action.value); break;
        case 'shuffle': await API.music.shuffle(guildId); break;
        case 'repeat': await API.music.repeat(guildId, playerState.repeat ? 'off' : 'track'); break;
        case 'remove': await API.music.remove(guildId, action.idx); break;
        case 'move': await API.music.move(guildId, action.from, action.to); break;
        case 'clear': await API.music.clear(guildId); break;
        default: return;
      }
      reloadPlayer();
    } catch (err) {
      setToast({ msg: `Player error: ${err.message}`, id: Date.now() });
    }
  }, [guildId, playerState.repeat, reloadPlayer, setToast]);

  const { data: rawSounds, reload: reloadSounds } = usePoll(API.sound.list, POLL_STATUS_MS, [guildId]);
  const sounds = (rawSounds || []).map(adaptSound);
  // null = noch am Laden, dann Badge verstecken statt "0" zeigen
  const soundsCountForBadge = rawSounds !== null ? sounds.length : null;

  const { data: musicSettings, reload: reloadMusicSettings } = useFetch(API.music.settings, []);
  const { data: soundSettings, reload: reloadSoundSettings } = useFetch(API.sound.settings, []);

  const settings = mergeSettings(musicSettings, soundSettings);
  const saveSettings = async (bot, uiPatch) => {
    const map = bot === 'music' ? SETTING_MAP_MUSIC : SETTING_MAP_SOUND;
    const patch = mapSettingsPatch(uiPatch, map);
    try {
      let result;
      if (bot === 'music') {
        result = await API.music.saveSettings(patch);
        await reloadMusicSettings();
      } else {
        result = await API.sound.saveSettings(patch);
        await reloadSoundSettings();
      }
      const msg = result?.restartRequired ? 'Saved. Restart required for connection settings.' : 'Saved and active now.';
      setToast({ msg, id: Date.now() });
      return result || { restartRequired: false };
    } catch (err) {
      const message = err.status === 409 && /managed by environment variables/i.test(err.message)
        ? 'Bot still runs the previous API code. Restart this bot once, then settings can be changed.'
        : `Save failed: ${err.message}`;
      setToast({ msg: message, id: Date.now() });
      return false;
    }
  };

  const appendLogs = useCallback((entries) => {
    const incoming = (Array.isArray(entries) ? entries : [entries]).map(normalizeLog);
    setLiveLogs((previous) => {
      const byLine = new Map();
      for (const entry of [...previous, ...incoming]) {
        const key = `${entry.timestamp}|${entry.src}|${entry.level}|${entry.text}`;
        byLine.set(key, entry);
      }
      return [...byLine.values()]
        .sort((left, right) => left.timestamp - right.timestamp)
        .slice(-300);
    });
  }, [setLiveLogs]);

  useSSE(
    useCallback((onMsg) => API.logsSSE(
      onMsg,
      () => setLogConnection({ state: 'error', message: 'Log stream disconnected. Restart Botboard once if its server is still running the older code.' }),
      () => setLogConnection({ state: 'live', message: '' }),
    ), [setLogConnection]),
    appendLogs,
  );

  useEffect(() => {
    API.logs.list()
      .then(appendLogs)
      .catch((err) => setLogConnection({
        state: 'error',
        message: err.status === 404
          ? 'Live logs need one Botboard restart to load the new server route.'
          : `Could not load existing logs: ${err.message}`,
      }));
  }, [appendLogs, setLogConnection]);

  // Resolve the channel a bot should use; null means "auto but user is in no
  // channel and nothing pinned" — caller should surface the hint.
  const requireTarget = (botKey) => {
    const target = resolveTarget(botKey);
    if (!target) {
      setToast({ msg: `${displayNames[botKey]}: join a voice channel, or pick one in the top-right selector`, id: Date.now() });
    }
    return target;
  };

  const playSound = async (sound) => {
    if (!sound) return;
    if (botStatus.sound !== 'online') {
      setToast({ msg: `${displayNames.sound} is offline`, id: Date.now() });
      return;
    }
    const targetChannel = requireTarget('sound');
    if (!targetChannel) return;
    setCurrentSound(sound);
    setToast({ msg: `▶ ${sound.name}.mp3 → ${targetChannel.name}`, id: Date.now() });
    try {
      await API.sound.play({ guildId, channelId: targetChannel.id, sound: sound.name });
      setTimeout(() => setCurrentSound(null), Math.max(2000, (parseInt(sound.duration.split(':')[1]) || 2) * 1000));
      reloadSounds();
    } catch (err) {
      setCurrentSound(null);
      setToast({ msg: `Play failed: ${err.message}`, id: Date.now() });
    }
  };
  const connectSound = async () => {
    const target = requireTarget('sound');
    if (!target) return;
    try {
      await API.sound.connect({ guildId, channelId: target.id });
      await Promise.all([reloadStatus(), reloadGuildDetail()]);
      setToast({ msg: `${displayNames.sound} joined ${target.name}`, id: Date.now() });
    } catch (err) {
      setToast({ msg: `${displayNames.sound} join failed: ${err.message}`, id: Date.now() });
    }
  };
  const stopSound = async () => {
    try {
      await API.sound.stop();
      setCurrentSound(null);
      await reloadStatus();
      setToast({ msg: `${displayNames.sound} playback stopped`, id: Date.now() });
    } catch (err) {
      setToast({ msg: `${displayNames.sound} stop failed: ${err.message}`, id: Date.now() });
    }
  };
  const disconnectSound = async () => {
    try {
      await API.sound.disconnect();
      setCurrentSound(null);
      await Promise.all([reloadStatus(), reloadGuildDetail()]);
      setToast({ msg: `${displayNames.sound} disconnected`, id: Date.now() });
    } catch (err) {
      setToast({ msg: `${displayNames.sound} disconnect failed: ${err.message}`, id: Date.now() });
    }
  };

  const previewSound = async (sound) => {
    if (!sound) return;
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (currentPreview?.id === sound.id) {
      setCurrentPreview(null);
      return;
    }
    try {
      const response = await fetch(API.sound.previewUrl(sound.name), { credentials: 'include' });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const objectUrl = URL.createObjectURL(await response.blob());
      const audio = new Audio(objectUrl);
      previewAudioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(objectUrl);
        if (previewAudioRef.current === audio) previewAudioRef.current = null;
        setCurrentPreview(null);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        if (previewAudioRef.current === audio) previewAudioRef.current = null;
        setCurrentPreview(null);
        setToast({ msg: 'Preview playback failed', id: Date.now() });
      };
      setCurrentPreview(sound);
      await audio.play();
      setToast({ msg: `Previewing ${sound.name}.mp3 locally`, id: Date.now() });
    } catch (err) {
      setCurrentPreview(null);
      setToast({ msg: `Preview failed: ${err.message}`, id: Date.now() });
    }
  };

  useEffect(() => () => {
    previewAudioRef.current?.pause();
  }, []);

  const stopBot = async (bot) => {
    const label = displayNames[bot] || bot;
    setToast({ msg: `Stopping ${label}…`, id: Date.now() });
    try {
      await API.bots.stop(bot);
      setTimeout(() => { reloadStatus(); reloadModules(); }, 1500);
    } catch (err) { setToast({ msg: `Stop failed: ${err.message}`, id: Date.now() }); }
  };
  const startBot = async (bot) => {
    const label = displayNames[bot] || bot;
    setToast({ msg: `Starting ${label}…`, id: Date.now() });
    try {
      await API.bots.start(bot);
      setTimeout(() => { reloadStatus(); reloadModules(); }, 3000);
    } catch (err) { setToast({ msg: `Start failed: ${err.message}`, id: Date.now() }); }
  };
  const restartBot = async (bot) => {
    const label = displayNames[bot] || bot;
    setToast({ msg: `Restarting ${label}...`, id: Date.now() });
    try {
      await API.bots.restart(bot);
      setTimeout(() => { reloadStatus(); reloadModules(); setToast({ msg: `${label} restart requested`, id: Date.now() }); }, 1500);
    } catch (err) {
      setToast({ msg: `Restart failed: ${err.message}`, id: Date.now() });
    }
  };

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(h);
  }, [toast]);

  const addSound = async (file, name) => {
    try {
      await API.sound.upload(file, name);
      reloadSounds();
      setToast({ msg: 'Sound uploaded', id: Date.now() });
    } catch (err) {
      setToast({ msg: `Upload failed: ${err.message}`, id: Date.now() });
    }
  };
  const deleteSound = async (name) => {
    try {
      await API.sound.remove(name);
      reloadSounds();
      setToast({ msg: 'Sound deleted', id: Date.now() });
    } catch (err) {
      setToast({ msg: `Delete failed: ${err.message}`, id: Date.now() });
    }
  };
  const renameSound = async (name, newName) => {
    try {
      await API.sound.rename(name, newName);
      reloadSounds();
    } catch (err) {
      setToast({ msg: `Rename failed: ${err.message}`, id: Date.now() });
    }
  };
  const addMusic = async (query) => {
    const targetChannel = requireTarget('music');
    if (!targetChannel) return false;
    try {
      await API.music.play(guildId, { query, channelId: targetChannel.id });
      reloadPlayer();
      setToast({ msg: 'Added to music queue', id: Date.now() });
      return true;
    } catch (err) {
      setToast({ msg: `Could not add track: ${err.message}`, id: Date.now() });
      return false;
    }
  };
  const connectMusic = async () => {
    const target = requireTarget('music');
    if (!target) return;
    try {
      await API.music.connect(guildId, target.id);
      await Promise.all([reloadPlayer(), reloadStatus(), reloadGuildDetail()]);
      setToast({ msg: `${displayNames.music} joined ${target.name}`, id: Date.now() });
    } catch (err) {
      setToast({ msg: `${displayNames.music} join failed: ${err.message}`, id: Date.now() });
    }
  };
  const stopMusic = async () => {
    try {
      await API.music.stop(guildId);
      await Promise.all([reloadPlayer(), reloadStatus()]);
      setToast({ msg: 'Music playback stopped', id: Date.now() });
    } catch (err) {
      setToast({ msg: `Music stop failed: ${err.message}`, id: Date.now() });
    }
  };
  const disconnectMusic = async () => {
    try {
      await API.music.disconnect(guildId);
      await Promise.all([reloadPlayer(), reloadStatus(), reloadGuildDetail()]);
      setToast({ msg: `${displayNames.music} disconnected`, id: Date.now() });
    } catch (err) {
      setToast({ msg: `${displayNames.music} disconnect failed: ${err.message}`, id: Date.now() });
    }
  };
  const searchMusic = useCallback((query) => API.music.search(guildId, query), [guildId]);
  const soundTarget = resolveTarget('sound');
  const voiceControls = {
    sound: { onJoin: connectSound, onStop: stopSound, onDisconnect: disconnectSound },
    music: { onJoin: connectMusic, onStop: stopMusic, onDisconnect: disconnectMusic },
  };
  const activeMeta = routeMeta(route, sortedModules);
  const activeGenericKind = activeMeta.module ? (activeMeta.page?.kind || activeMeta.page?.id) : '';
  const activeGenericName = activeMeta.module ? moduleDisplayName(activeMeta.module, activeMeta.parentBot) : '';

  // Geteilter Kontext für die Page-Kind-Registry (siehe PAGE_RENDERERS).
  const pageCtx = {
    sounds, currentSound, currentPreview, playSound, previewSound, resolveTarget,
    addSound, deleteSound, renameSound, perms,
    playerState, dispatchPlayer, addMusic, searchMusic, playerError,
    botStatus, botInfo, statusData, soundStats, musicStats,
    liveLogs, logConnection,
    settings, saveSettings, soundSettings, musicSettings,
    restartEnabled, setRestartConfirm, setStopConfirm, stopBot, startBot,
    guildId, setToast, tweaks,
  };

  return (
    <div className="app">
      <Sidebar route={route} setRoute={setRoute}
               server={server}
               servers={serverOptions || [server]}
               onChangeServer={changeServer}
               user={user}
               soundsCount={soundsCountForBadge}
               onLogout={onLogout}
               modules={sortedModules}
               restartEnabled={restartEnabled}
               onRestart={(bot) => setRestartConfirm(bot)}
               onStop={(bot) => setStopConfirm(bot)} onStart={startBot}
               permissions={perms}/>
      <div className="main">
        <Topbar route={route} server={server}
                voiceChannels={voiceChannels}
                voiceTargets={voiceTargets} setVoiceTarget={setVoiceTarget}
                userVoiceChannel={userVoiceChannel} botVoiceChannelId={botVoiceChannelId}
                voiceControls={voiceControls}
                onOpenMenu={() => setMoreSheetOpen(true)}
                modules={sortedModules}/>
        <div className="content">
          {route === 'overview' && <OverviewScreen server={server} openRoute={setRoute}
            currentTrack={playerState.queue[playerState.currentIdx]}
            voiceJoined={!!soundTarget} channel={soundTarget || { name: 'voice' }}
            botStatus={botStatus} currentSound={currentSound}
            botInfo={botInfo} statusData={statusData} liveLogs={liveLogs}
            sounds={sounds} soundsCount={sounds.length} queueLength={playerState.queue.length}
            permissions={perms}/>}
          {/* Immer gemountet, nur per hidden umgeschaltet — kein Remount beim
              Wechsel = kein Lade-Flash (wie bei den Bot-Seiten). Per Permission
              gegated, damit kein unnötiger Fetch für Unberechtigte läuft. */}
          {!!perms.botModules && (
            <div hidden={route !== 'bot-modules'}>
              <BotRegistryScreen modules={allModules}
                onChanged={() => { reloadStatus(); reloadModules(); updateModuleOrder([]); }}
                restartEnabled={restartEnabled && !!perms.restartBot}
                onRestart={restartBot} onStop={stopBot} onStart={startBot}/>
            </div>
          )}
          {!!perms.userManagement && (
            <div hidden={route !== 'admin'}>
              <AdminScreen currentUserId={user?.id} server={server}/>
            </div>
          )}
          {route === 'botboard-logs' && <LogsScreen bot="botboard" botName="Botboard"
            liveLogs={liveLogs.filter(e => e.src === 'botboard')} connection={logConnection}/>}
          {route === 'manage-navigation' && <NavigationSettingsScreen modules={sortedModules} moduleOrder={moduleOrder} onChangeOrder={updateModuleOrder}/>}
          {route === 'manage-settings' && <BotboardSettingsScreen server={server} modules={sortedModules} setToast={setToast}/>}
          {/* Alle Bots + alle ihre Seiten immer gemountet, nur das Aktive sichtbar.
              Kein Remount beim Bot- ODER Seitenwechsel = null Flash. */}
          {sortedModules.flatMap(module => {
            const parentBot = module.id;
            const botName   = moduleDisplayName(module, parentBot);
            return (module.manifest?.pages || []).map(page => {
              const kind    = page.kind || page.id;
              const visible = activeMeta.parentBot === parentBot && activeGenericKind === kind;
              const render  = PAGE_RENDERERS[kind];
              return (
                <div key={`${parentBot}/${page.id}`} hidden={!visible}>
                  {render
                    ? render({ ...pageCtx, parentBot, botName, active: visible })
                    : (
                      <div className="content-narrow">
                        <div className="empty"><div>No renderer for page kind "{kind}".</div></div>
                      </div>
                    )}
                </div>
              );
            });
          })}
        </div>
      </div>

      {toast && <div className="toast" key={toast.id}>{toast.msg}</div>}

      {moreSheetOpen && (
        <MobileMoreSheet
          onClose={() => setMoreSheetOpen(false)}
          route={route}
          setRoute={setRoute}
          server={server}
          servers={serverOptions || [server]}
          onChangeServer={(selectedServer) => changeServer(selectedServer)}
          user={user}
          botStatus={botStatus}
          botInfo={botInfo}
          modules={sortedModules}
          soundsCount={soundsCountForBadge}
          restartEnabled={restartEnabled}
          onRestart={(bot) => { setRestartConfirm(bot); setMoreSheetOpen(false); }}
          onStop={stopBot} onStart={startBot}
          onLogout={onLogout}
          permissions={perms}
        />
      )}

      {restartConfirm && (
        <RestartModal which={restartConfirm}
                      names={displayNames}
                      onCancel={() => setRestartConfirm(null)}
                      onConfirm={() => { restartBot(restartConfirm); setRestartConfirm(null); }}/>
      )}
      {stopConfirm && (
        <StopModal which={stopConfirm}
                   names={displayNames}
                   onCancel={() => setStopConfirm(null)}
                   onConfirm={() => { stopBot(stopConfirm); setStopConfirm(null); }}/>
      )}

      <TweaksUI t={tweaks} setTweak={setTweak}/>
    </div>
  );
}

const NavigationSettingsScreen = ({ modules, moduleOrder, onChangeOrder }) => {
  const orderedIds = modules.map((module) => module.id);
  const move = (id, direction) => {
    const next = [...orderedIds];
    const index = next.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChangeOrder(next);
  };
  const reset = () => onChangeOrder([]);

  return (
    <div className="content-narrow">
      <div className="page-head">
        <div>
          <div className="page-title">Navigation</div>
          <div className="page-sub">Sidebar order for this server.</div>
        </div>
        <button className="btn" type="button" onClick={reset} disabled={!moduleOrder.length}>
          <Icon name="refresh" size={13}/> Reset
        </button>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Modules</div></div>
        <div className="nav-order-list">
          {modules.map((module, index) => (
            <div className="nav-order-row" key={module.id}>
              <div className="nav-order-mark">
                {module.manifest?.bot?.avatar
                  ? <img src={module.manifest.bot.avatar} alt=""/>
                  : <Icon name={module.manifest?.icon || 'grid'} size={15}/>}
              </div>
              <div className="nav-order-main">
                <div className="nav-order-name">{moduleDisplayName(module, module.id)}</div>
                <div className="nav-order-meta">{module.id}</div>
              </div>
              <div className="nav-order-actions">
                <button className="btn btn-sm" type="button" onClick={() => move(module.id, -1)} disabled={index === 0} title="Move up">
                  <Icon name="chevron-up" size={13}/>
                </button>
                <button className="btn btn-sm" type="button" onClick={() => move(module.id, 1)} disabled={index === modules.length - 1} title="Move down">
                  <Icon name="chevron-down" size={13}/>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const BotboardSettingsScreen = ({ server, modules, setToast }) => (
  <div className="content-narrow">
    <div className="page-head">
      <div>
        <div className="page-title">Settings</div>
        <div className="page-sub">Botboard settings for this Discord server.</div>
      </div>
    </div>

    <div className="settings-group">
      <div className="settings-group-head"><div className="settings-group-title">Server</div></div>
      <Row label="Server name" help="Selected Discord server.">
        <span className="settings-value">{server?.name || 'Unknown'}</span>
      </Row>
      <Row label="Members" help="Member count reported by Discord.">
        <span className="settings-value">{server?.members ?? '-'}</span>
      </Row>
      <Row label="Active modules" help="Modules visible for this server.">
        <span className="settings-value">{modules.length}</span>
      </Row>
    </div>

    <AccessBlock server={server} setToast={setToast}/>
    <BotBlock setToast={setToast}/>
  </div>
);

// Login-Gate pro Server: optionale Pflichtrolle. Rollen kommen live vom
// Discord-Bot-Token (Dropdown). "Keine" = Mitgliedschaft im Server reicht.
const AccessBlock = ({ server, setToast }) => {
  const guildId = server?.id;
  const { data, error, reload } = useFetch(() => API.access.get(guildId), [guildId]);
  const [saving, setSaving] = useState(false);

  const onPick = async (event) => {
    const roleId = event.target.value;
    const role = (data?.roles || []).find((r) => r.id === roleId);
    setSaving(true);
    try {
      await API.access.set(guildId, { requiredRoleId: roleId, requiredRoleName: role?.name || '' });
      setToast?.({ msg: roleId ? `Saved — only “${role?.name}” can log in or use commands.` : 'Saved — membership is enough now.', id: Date.now() });
      reload();
    } catch (err) {
      setToast?.({ msg: `Save failed: ${err.message}`, id: Date.now() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-group">
      <div className="settings-group-head"><div className="settings-group-title">Access</div></div>
      <Row label="Required role" help="Login and bot commands need this role. Empty = membership in the server is enough.">
        {!data && !error && <span className="settings-value">Loading…</span>}
        {error && <span className="tag error">{error.message}</span>}
        {data && !data.tokenConfigured && (
          <span className="tag warn">Set DISCORD_BOT_TOKEN to enable</span>
        )}
        {data && data.tokenConfigured && !data.botInGuild && (
          <span className="tag warn">Botboard bot is not in this server</span>
        )}
        {data && data.tokenConfigured && data.botInGuild && (
          <select className="select" value={data.requiredRoleId || ''} onChange={onPick} disabled={saving}>
            <option value="">No role required (membership is enough)</option>
            {data.roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        )}
      </Row>
    </div>
  );
};

// Globale Bot-Einstellungen: env liefert den Default, das UI überschreibt live.
// Token bleibt env-only und ist hier bewusst nicht editierbar.
const BotBlock = ({ setToast }) => {
  const { data, error } = useFetch(() => API.botboardConfig.get(), []);
  const [prefix, setPrefix] = useState('');
  const [statusText, setStatusText] = useState('');
  const [publicUrl, setPublicUrl] = useState('');

  useEffect(() => {
    if (data) {
      setPrefix(data.prefix || '');
      setStatusText(data.statusText || '');
      setPublicUrl(data.publicUrl || '');
    }
  }, [data]);

  const save = async (patch) => {
    try {
      const saved = await API.botboardConfig.set(patch);
      setPrefix(saved.prefix);
      setStatusText(saved.statusText);
      setPublicUrl(saved.publicUrl);
      setToast?.({ msg: 'Saved and active now.', id: Date.now() });
    } catch (err) {
      setToast?.({ msg: `Save failed: ${err.message}`, id: Date.now() });
    }
  };

  // Kleiner Hinweis, dass der aktuelle Wert aus der env kommt.
  const srcTag = (key) => data?.source?.[key] === 'env'
    ? <span className="tag info">from env</span>
    : null;

  return (
    <div className="settings-group">
      <div className="settings-group-head"><div className="settings-group-title">Bot</div></div>
      {!data && !error && <Row label="Bot"><span className="settings-value">Loading…</span></Row>}
      {error && <Row label="Bot"><span className="tag error">{error.message}</span></Row>}
      {data && (
        <>
          {!data.tokenConfigured && (
            <Row label="Status" help="Set DISCORD_BOT_TOKEN (env only) to bring the bot online.">
              <span className="tag warn">Token not set — bot offline</span>
            </Row>
          )}
          <Row label="Command prefix" help="BOTBOARD_PREFIX">
            <div className="generic-setting-control">
              <input className="input" style={{ maxWidth: 120 }} value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                onBlur={() => prefix !== (data.prefix || '') && save({ prefix })}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}/>
              {srcTag('prefix')}
            </div>
          </Row>
          <Row label="Status text" help="BOTBOARD_STATUS_TEXT">
            <div className="generic-setting-control">
              <input className="input" value={statusText} placeholder="Auto (X/Y modules online)"
                onChange={(e) => setStatusText(e.target.value)}
                onBlur={() => statusText !== (data.statusText || '') && save({ statusText })}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}/>
              {srcTag('statusText')}
            </div>
          </Row>
          <Row label="Dashboard URL" help="BOTBOARD_PUBLIC_URL">
            <div className="generic-setting-control">
              <input className="input" value={publicUrl} placeholder="https://botboard.example.com"
                onChange={(e) => setPublicUrl(e.target.value)}
                onBlur={() => publicUrl !== (data.publicUrl || '') && save({ publicUrl })}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}/>
              {srcTag('publicUrl')}
            </div>
          </Row>
        </>
      )}
    </div>
  );
};

const RestartModal = ({ which, names: dynamicNames = {}, onCancel, onConfirm }) => {
  const names = { sound: dynamicNames.sound || 'Sound Bot', music: dynamicNames.music || 'Music Bot', all: 'both bots' };
  const label = names[which] || dynamicNames[which] || which;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Restart {label}?</h3>
        <p>
          {which === 'music'
            ? 'The current track will stop. Queue will be preserved. Estimated downtime ~3s.'
            : which === 'sound'
            ? 'Any sound currently playing will stop. Estimated downtime ~3s.'
            : which === 'all'
            ? 'Both bots will be restarted. Active queue will be preserved, current track will stop.'
            : `${label} will be restarted. Expect a short downtime.`}
        </p>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={onConfirm}>
            <Icon name="refresh" size={13}/> Restart
          </button>
        </div>
      </div>
    </div>
  );
};

const StopModal = ({ which, names: dynamicNames = {}, onCancel, onConfirm }) => {
  const names = { sound: dynamicNames.sound || 'Sound Bot', music: dynamicNames.music || 'Music Bot' };
  const label = names[which] || dynamicNames[which] || which;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Stop {label}?</h3>
        <p>
          {which === 'music'
            ? 'The current track will stop and the queue will be cleared.'
            : which === 'sound'
            ? 'Any sound currently playing will stop.'
            : `${label} will be stopped.`}
        </p>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>
            <Icon name="stop" size={13}/> Stop
          </button>
        </div>
      </div>
    </div>
  );
};

function oklchToHex(l, c, h) {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;
  const L = l_ ** 3, M = m_ ** 3, S = s_ ** 3;
  let r = +4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  let g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  let bl = -0.0041960863 * L - 0.7034186147 * M + 1.7076147010 * S;
  const toSrgb = (x) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(1, v)) * 255);
  };
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return '#' + toHex(toSrgb(r)) + toHex(toSrgb(g)) + toHex(toSrgb(bl));
}

const accentSwatches = Object.entries(ACCENTS).map(([k, a]) => ({
  key: k,
  hex: oklchToHex(a.l, a.c, a.h),
}));
const ACCENT_HEX_TO_KEY = Object.fromEntries(accentSwatches.map(s => [s.hex, s.key]));

const TweaksUI = ({ t, setTweak }) => {
  const accentHex = accentSwatches.find(s => s.key === t.accent)?.hex || accentSwatches[0].hex;
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Accent" />
      <TweakColor
        label="Color"
        value={accentHex}
        options={accentSwatches.map(s => s.hex)}
        onChange={(hex) => setTweak('accent', ACCENT_HEX_TO_KEY[hex] || 'lime')}
      />
      <TweakSection label="Music Player" />
      <TweakRadio
        label="Layout"
        value={t.playerStyle}
        options={[
          { value: 'split', label: 'Split' },
          { value: 'compact', label: 'Compact' },
        ]}
        onChange={(v) => setTweak('playerStyle', v)}
      />
      <TweakSection label="Soundboard" />
      <TweakRadio
        label="Tile size"
        value={t.tileSize}
        options={[
          { value: 'sm', label: 'Small' },
          { value: 'md', label: 'Medium' },
          { value: 'lg', label: 'Large' },
        ]}
        onChange={(v) => setTweak('tileSize', v)}
      />
    </TweaksPanel>
  );
};
