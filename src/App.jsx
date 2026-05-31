// Main App — login flow, route table, live data wiring.
// All mutating actions go through src/api.js; reads are either one-shot
// (useFetch) or periodic (usePoll). Logs come in via SSE.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sidebar, Topbar, MobileMoreSheet, routeMeta } from './sidebar.jsx';
import { Icon } from './components.jsx';
import { LoginScreen, ServerSelectScreen, OverviewScreen } from './screens-1.jsx';
import { SoundboardScreen, MusicScreen, LibraryScreen } from './screens-2.jsx';
import { StatsScreen, SoundbotSettingsScreen, NewibotSettingsScreen, LogsScreen, GenericStatsScreen, GenericSettingsScreen } from './screens-3.jsx';
import { BotRegistryScreen } from './registry-screen.jsx';
import { AdminScreen } from './admin-screen.jsx';
import { dashboardBotName, moduleDisplayName } from './botIdentity.js';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakColor } from './tweaks-panel.jsx';
import * as API from './api.js';
import { useFetch, usePoll, useSSE, useHashRoute } from './hooks.js';
import { adaptTrack, adaptSound, normalizeLog, msToClock, formatBytes, relativeTime } from './format.js';
import { savedUser, saveUser, savedServer, saveServer, savedVoiceTargets, saveVoiceTargets, clearVoiceTargets } from './storage.js';
import { SETTING_MAP_MUSIC, SETTING_MAP_SOUND, mapSettingsPatch, mergeSettings } from './settings-map.js';

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

  // Wrap setRoute so non-admins are silently redirected away from restricted pages.
  const ADMIN_ROUTES = new Set(['bot-modules', 'admin', 'sb/settings', 'mb/settings']);
  const setRoute = (next) => {
    const adminOnly = ADMIN_ROUTES.has(next) || String(next).includes('/settings');
    if (adminOnly && !user?.isAdmin) return;
    setRouteRaw(next);
  };

  const [currentSound, setCurrentSound] = useState(null);
  const [currentPreview, setCurrentPreview] = useState(null);
  const [toast, setToast] = useState(null);

  const [restartConfirm, setRestartConfirm] = useState(null);
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
    restartConfirm, setRestartConfirm, restartEnabled,
    toast, setToast,
    liveLogs, setLiveLogs, logConnection, setLogConnection,
    onLogout, tweaks, setTweak,
  } = props;

  const guildId = server.id;
  const previewAudioRef = useRef(null);
  const { data: serverOptions } = useFetch(API.bots.servers, [guildId]);
  const { data: modulesData, reload: reloadModules } = usePoll(API.bots.modules, POLL_STATUS_MS, [guildId]);
  const modules = modulesData || [];
  const moduleById = new Map(modules.map((module) => [module.id, module]));

  useEffect(() => {
    const freshServer = serverOptions?.find((option) => option.id === guildId);
    if (!freshServer) return;
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
    setRoute('overview');
  };

  const { data: statusData, reload: reloadStatus } = usePoll(API.bots.status, POLL_STATUS_MS, [guildId]);
  const botStatus = {
    soundbot: statusData?.sound?.online ? 'online' : 'offline',
    newibot: statusData?.music?.online ? 'online' : 'offline',
  };
  const botInfo = {
    soundbot: statusData?.sound?.bot || moduleById.get('sound')?.manifest?.bot || null,
    newibot: statusData?.music?.bot || moduleById.get('music')?.manifest?.bot || null,
  };
  const displayNames = {
    soundbot: moduleDisplayName(moduleById.get('sound'), dashboardBotName('soundbot', botInfo)),
    newibot: moduleDisplayName(moduleById.get('music'), dashboardBotName('newibot', botInfo)),
  };
  const moduleLabels = Object.fromEntries(modules.map((module) => [module.id, moduleDisplayName(module, module.id)]));

  const { data: guildDetail, reload: reloadGuildDetail } = usePoll(async () => {
    const [musicGuilds, soundGuilds] = await Promise.all([
      API.music.guilds().catch(() => []),
      API.sound.guilds().catch(() => []),
    ]);
    return musicGuilds.find((guild) => guild.id === guildId)
      || soundGuilds.find((guild) => guild.id === guildId)
      || null;
  }, POLL_STATUS_MS, [guildId]);
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
    soundbot: statusData?.sound?.voiceChannelId || null,
    newibot: rawPlayer?.voiceChannelId || null,
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
    if (botStatus.soundbot !== 'online') {
      setToast({ msg: `${displayNames.soundbot} is offline`, id: Date.now() });
      return;
    }
    const targetChannel = requireTarget('soundbot');
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
    const target = requireTarget('soundbot');
    if (!target) return;
    try {
      await API.sound.connect({ guildId, channelId: target.id });
      await Promise.all([reloadStatus(), reloadGuildDetail()]);
      setToast({ msg: `${displayNames.soundbot} joined ${target.name}`, id: Date.now() });
    } catch (err) {
      setToast({ msg: `${displayNames.soundbot} join failed: ${err.message}`, id: Date.now() });
    }
  };
  const stopSound = async () => {
    try {
      await API.sound.stop();
      setCurrentSound(null);
      await reloadStatus();
      setToast({ msg: `${displayNames.soundbot} playback stopped`, id: Date.now() });
    } catch (err) {
      setToast({ msg: `${displayNames.soundbot} stop failed: ${err.message}`, id: Date.now() });
    }
  };
  const disconnectSound = async () => {
    try {
      await API.sound.disconnect();
      setCurrentSound(null);
      await Promise.all([reloadStatus(), reloadGuildDetail()]);
      setToast({ msg: `${displayNames.soundbot} disconnected`, id: Date.now() });
    } catch (err) {
      setToast({ msg: `${displayNames.soundbot} disconnect failed: ${err.message}`, id: Date.now() });
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

  const restartBot = async (bot) => {
    const apiKey = bot === 'newibot' ? 'music' : bot === 'soundbot' ? 'sound' : bot;
    if (!apiKey) return;
    const label = displayNames[bot] || moduleLabels[apiKey] || bot;
    setToast({ msg: `Restarting ${label}...`, id: Date.now() });
    try {
      await API.bots.restart(apiKey);
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
    const targetChannel = requireTarget('newibot');
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
    const target = requireTarget('newibot');
    if (!target) return;
    try {
      await API.music.connect(guildId, target.id);
      await Promise.all([reloadPlayer(), reloadStatus(), reloadGuildDetail()]);
      setToast({ msg: `${displayNames.newibot} joined ${target.name}`, id: Date.now() });
    } catch (err) {
      setToast({ msg: `${displayNames.newibot} join failed: ${err.message}`, id: Date.now() });
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
      setToast({ msg: `${displayNames.newibot} disconnected`, id: Date.now() });
    } catch (err) {
      setToast({ msg: `${displayNames.newibot} disconnect failed: ${err.message}`, id: Date.now() });
    }
  };
  const searchMusic = useCallback((query) => API.music.search(guildId, query), [guildId]);
  const soundTarget = resolveTarget('soundbot');
  const voiceControls = {
    soundbot: {
      onJoin: connectSound,
      onStop: stopSound,
      onDisconnect: disconnectSound,
    },
    newibot: {
      onJoin: connectMusic,
      onStop: stopMusic,
      onDisconnect: disconnectMusic,
    },
  };
  const activeMeta = routeMeta(route, modules);
  const activeGenericKind = activeMeta.module ? (activeMeta.page?.kind || activeMeta.page?.id) : '';
  const activeGenericName = activeMeta.module ? moduleDisplayName(activeMeta.module, activeMeta.parentBot) : '';
  return (
    <div className="app">
      <Sidebar route={route} setRoute={setRoute}
               server={server}
               servers={serverOptions || [server]}
               onChangeServer={changeServer}
               user={user}
               soundsCount={sounds.length}
               onLogout={onLogout}
               botStatus={botStatus}
               botInfo={botInfo}
               modules={modules}
               restartEnabled={restartEnabled}
               onRestart={(bot) => setRestartConfirm(bot)}
               isAdmin={!!user?.isAdmin}/>
      <div className="main">
        <Topbar route={route} server={server}
                voiceChannels={voiceChannels}
                voiceTargets={voiceTargets} setVoiceTarget={setVoiceTarget}
                userVoiceChannel={userVoiceChannel} botVoiceChannelId={botVoiceChannelId}
                voiceControls={voiceControls}
                onOpenMenu={() => setMoreSheetOpen(true)}
                botInfo={botInfo}
                modules={modules}/>
        <div className="content">
          {route === 'overview' && <OverviewScreen server={server} openRoute={setRoute}
            currentTrack={playerState.queue[playerState.currentIdx]}
            voiceJoined={!!soundTarget} channel={soundTarget || { name: 'voice' }}
            botStatus={botStatus} currentSound={currentSound}
            botInfo={botInfo} statusData={statusData} liveLogs={liveLogs}
            sounds={sounds} soundsCount={sounds.length} queueLength={playerState.queue.length}/>}
          {route === 'bot-modules' && <BotRegistryScreen onChanged={() => { reloadStatus(); reloadModules(); }}/>}
          {route === 'admin' && <AdminScreen currentUserId={user?.id}/>}
          {route === 'sb/board' && (
            <>
              <SoundboardScreen sounds={sounds} currentSound={currentSound} currentPreview={currentPreview}
                playSound={playSound} previewSound={previewSound}
                tileSize={tweaks.tileSize} targetChannel={soundTarget}/>
              {(currentSound || currentPreview) && (
                <div className="mini-player">
                  <div className="mini-player-cover"
                       style={currentPreview && !currentSound ? { background: 'oklch(0.72 0.15 240)', color: '#fff' } : {}}>
                    {(currentSound || currentPreview).name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="mini-player-info">
                    <div className="mini-player-name">{(currentSound || currentPreview).name}.mp3</div>
                    <div className="mini-player-meta">
                      {currentSound
                        ? <>Playing in Discord · {soundTarget ? soundTarget.name : 'joining voice'}</>
                        : <>Local preview · not sent to Discord</>}
                    </div>
                  </div>
                  <div className="mini-player-actions">
                    {currentSound && (
                      <button className="btn btn-sm" onClick={() => playSound(currentSound)}>
                        <Icon name="refresh" size={12}/> Replay
                      </button>
                    )}
                    <button className="btn btn-icon btn-sm btn-ghost" onClick={() => { previewAudioRef.current?.pause(); previewAudioRef.current = null; setCurrentSound(null); setCurrentPreview(null); }}>
                      <Icon name="x" size={12}/>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {route === 'sb/library' && <LibraryScreen sounds={sounds}
            addSound={addSound} deleteSound={deleteSound} renameSound={renameSound} playSound={playSound}/>}
          {route === 'sb/stats' && <StatsScreen bot="sound" sounds={sounds}
            botStatus={botStatus} botInfo={botInfo} statusData={statusData} apiStats={soundStats}/>}
          {route === 'sb/logs' && <LogsScreen bot="sound"
            botName={displayNames.soundbot} liveLogs={liveLogs} connection={logConnection}/>}
          {route === 'sb/settings' && <SoundbotSettingsScreen
            settings={settings} onSave={(patch) => saveSettings('sound', patch)}
            settingsLoaded={!!soundSettings}
            botStatus={botStatus.soundbot} botName={displayNames.soundbot} restartEnabled={restartEnabled} onRestart={(b) => setRestartConfirm(b)}/>}

          {route === 'mb/player' && <MusicScreen playerState={playerState} dispatch={dispatchPlayer} addTrack={addMusic} searchTracks={searchMusic}
            playerStyle={tweaks.playerStyle} playerError={playerError}/>}
          {route === 'mb/stats' && <StatsScreen bot="music" sounds={sounds}
            botStatus={botStatus} botInfo={botInfo} statusData={statusData} queueLength={playerState.queue.length} apiStats={musicStats}/>}
          {route === 'mb/logs' && <LogsScreen bot="music"
            botName={displayNames.newibot} liveLogs={liveLogs} connection={logConnection}/>}
          {route === 'mb/settings' && <NewibotSettingsScreen
            settings={settings} onSave={(patch) => saveSettings('music', patch)}
            settingsLoaded={!!musicSettings}
            botStatus={botStatus.newibot} botName={displayNames.newibot} restartEnabled={restartEnabled} onRestart={(b) => setRestartConfirm(b)}/>}

          {activeMeta.module && activeGenericKind === 'stats' && (
            <GenericStatsScreen botId={activeMeta.parentBot} botName={activeGenericName}/>
          )}
          {activeMeta.module && activeGenericKind === 'logs' && (
            <LogsScreen bot={activeMeta.parentBot}
              botName={activeGenericName} liveLogs={liveLogs} connection={logConnection}/>
          )}
          {activeMeta.module && activeGenericKind === 'settings' && (
            <GenericSettingsScreen botId={activeMeta.parentBot}
              botName={activeGenericName} setToast={setToast}/>
          )}
          {activeMeta.module && !['stats', 'logs', 'settings'].includes(activeGenericKind) && (
            <div className="content-narrow">
              <div className="empty">
                <div>No renderer is available yet for module page "{activeGenericKind}".</div>
              </div>
            </div>
          )}
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
          onChangeServer={(selectedServer) => { changeServer(selectedServer); setMoreSheetOpen(false); }}
          user={user}
          botStatus={botStatus}
          botInfo={botInfo}
          modules={modules}
          soundsCount={sounds.length}
          restartEnabled={restartEnabled}
          onRestart={(bot) => { setRestartConfirm(bot); setMoreSheetOpen(false); }}
          onLogout={onLogout}
          isAdmin={!!user?.isAdmin}
        />
      )}

      {restartConfirm && (
        <RestartModal which={restartConfirm}
                      names={{ ...moduleLabels, ...displayNames }}
                      onCancel={() => setRestartConfirm(null)}
                      onConfirm={() => { restartBot(restartConfirm); setRestartConfirm(null); }}/>
      )}

      <TweaksUI t={tweaks} setTweak={setTweak}/>
    </div>
  );
}

// Mapping between the UI's flat settings keys (sbPrefix, mbVol, …) and the
// per-bot API config. Keep this in one place so the screens stay dumb.

const RestartModal = ({ which, names: dynamicNames = {}, onCancel, onConfirm }) => {
  const names = { soundbot: dynamicNames.soundbot || 'Sound Bot', newibot: dynamicNames.newibot || 'Music Bot', all: 'both bots' };
  const label = names[which] || dynamicNames[which] || which;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Restart {label}?</h3>
        <p>
          {which === 'newibot'
            ? 'The current track will stop. Queue will be preserved. Estimated downtime ~3s.'
            : which === 'soundbot'
            ? 'Any sound currently playing will stop. Estimated downtime ~3s.'
            : 'Both bots will be restarted. Active queue will be preserved, current track will stop.'}
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
