// Main App — login flow, route table, live data wiring.
// All mutating actions go through src/api.js; reads are either one-shot
// (useFetch) or periodic (usePoll). Logs come in via SSE.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sidebar, Topbar, MobileMoreSheet } from './sidebar.jsx';
import { Icon } from './components.jsx';
import { LoginScreen, ServerSelectScreen, OverviewScreen } from './screens-1.jsx';
import { SoundboardScreen, MusicScreen, LibraryScreen } from './screens-2.jsx';
import { StatsScreen, SoundbotSettingsScreen, NewibotSettingsScreen, LogsScreen } from './screens-3.jsx';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakColor } from './tweaks-panel.jsx';
import * as API from './api.js';
import { useFetch, usePoll, useSSE } from './hooks.js';

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

const POLL_STATUS_MS = 5000;
const POLL_PLAYER_MS = 2000;
const SELECTED_SERVER_KEY = 'botboard:selected-server-id';

function savedServer() {
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

function saveServer(server) {
  window.localStorage.setItem(SELECTED_SERVER_KEY, JSON.stringify(server));
}

// API track shape to the compact view model used by the dashboard.
function adaptTrack(t) {
  if (!t) return null;
  return {
    id: t.id,
    title: t.title || 'Unknown',
    artist: t.author || 'Unknown',
    duration: msToClock(t.duration),
    durationMs: t.duration,
    source: t.source === 'spotify' ? 'Spotify' : 'YouTube',
    cover: (t.title || '??').slice(0, 2).toUpperCase(),
    artwork: t.artwork || null,
    uri: t.uri,
    requestedBy: t.requestedBy?.username || null,
  };
}

function adaptSound(s) {
  return {
    id: s.name,
    name: s.name,
    duration: s.duration,
    size: formatBytes(s.size),
    plays: s.plays,
    added: relativeTime(s.added),
  };
}

function msToClock(ms) {
  if (!ms || ms < 0) return '0:00';
  const sec = Math.round(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function formatBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(ms) {
  if (!ms) return 'unknown';
  const diff = Date.now() - ms;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days < 1) return 'today';
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)} mo`;
}

function normalizeLog(entry) {
  const timestamp = entry.time ? new Date(entry.time).getTime() : Date.now();
  return {
    ...entry,
    src: entry.bot || entry.src || 'core',
    timestamp,
    time: new Date(timestamp).toTimeString().slice(0, 8),
  };
}

export default function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [stage, setStage] = useState('boot');
  const [user, setUser] = useState(null);
  const [server, setServer] = useState(null);
  const [route, setRoute] = useState('overview');
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);

  const [voiceJoined, setVoiceJoined] = useState(false);
  const [channel, setChannel] = useState(null);
  const [userChannel, setUserChannel] = useState(null);

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
        const previousServer = savedServer();
        if (previousServer?.id) {
          setServer(previousServer);
          setStage('app');
        } else {
          setStage('server');
        }
      } else {
        setStage('login');
      }
    }).catch(() => setStage('login'));
  }, []);

  const onLogin = () => {
    if (authConfigured) {
      window.location.href = API.auth.loginUrl;
    } else {
      setUser({ id: 'dev', username: 'dev', avatar: null, dev: true });
      setStage('server');
    }
  };

  const onLogout = async () => {
    try { await API.auth.logout(); } catch {}
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
      voiceJoined={voiceJoined}
      setVoiceJoined={setVoiceJoined}
      channel={channel}
      setChannel={setChannel}
      userChannel={userChannel}
      setUserChannel={setUserChannel}
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
    voiceJoined, setVoiceJoined, channel, setChannel,
    userChannel, setUserChannel,
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
    soundbot: statusData?.sound?.bot || null,
    newibot: statusData?.music?.bot || null,
  };

  const { data: guildDetail } = useFetch(async () => {
    const [musicGuilds, soundGuilds] = await Promise.all([
      API.music.guilds().catch(() => []),
      API.sound.guilds().catch(() => []),
    ]);
    return musicGuilds.find((guild) => guild.id === guildId)
      || soundGuilds.find((guild) => guild.id === guildId)
      || null;
  }, [guildId]);
  const voiceChannels = guildDetail?.voiceChannels || [];

  useEffect(() => {
    setChannel(null);
    setUserChannel(null);
    setVoiceJoined(false);
  }, [guildId]);

  useEffect(() => {
    const actualUserChannel = voiceChannels.find((voiceChannel) => voiceChannel.id === guildDetail?.userVoiceChannelId) || null;
    setUserChannel(actualUserChannel);
    setVoiceJoined(!!actualUserChannel);
    if (actualUserChannel) {
      setChannel(actualUserChannel);
    } else if (channel && !voiceChannels.some((voiceChannel) => voiceChannel.id === channel.id)) {
      setChannel(null);
    }
  }, [guildDetail?.userVoiceChannelId, voiceChannels, channel, setChannel, setUserChannel, setVoiceJoined]);

  const { data: rawPlayer, reload: reloadPlayer } = usePoll(
    () => API.music.player(guildId).catch(() => null),
    POLL_PLAYER_MS,
    [guildId],
  );

  useEffect(() => {
    if (rawPlayer?.voiceChannelId) {
      const ch = voiceChannels.find((c) => c.id === rawPlayer.voiceChannelId);
      if (ch && !channel) setChannel(ch);
    }
  }, [rawPlayer?.voiceChannelId, voiceChannels, channel, setChannel]);

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

  const { data: rawSounds, reload: reloadSounds } = useFetch(API.sound.list, [guildId]);
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

  const playSound = async (sound) => {
    if (!sound) return;
    if (botStatus.soundbot !== 'online') {
      setToast({ msg: 'SoundBot is offline', id: Date.now() });
      return;
    }
    const targetChannel = userChannel || channel;
    if (!targetChannel) {
      setToast({ msg: 'No voice channel selected', id: Date.now() });
      return;
    }
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
  const voiceTarget = () => userChannel || channel;
  const requireVoiceTarget = () => {
    const target = voiceTarget();
    if (!target) setToast({ msg: 'Join a voice channel or choose a target channel first', id: Date.now() });
    return target;
  };
  const connectSound = async () => {
    const target = requireVoiceTarget();
    if (!target) return;
    try {
      await API.sound.connect({ guildId, channelId: target.id });
      setToast({ msg: `SoundBot joined ${target.name}`, id: Date.now() });
    } catch (err) {
      setToast({ msg: `SoundBot join failed: ${err.message}`, id: Date.now() });
    }
  };
  const stopSound = async () => {
    try {
      await API.sound.stop();
      setCurrentSound(null);
      setToast({ msg: 'SoundBot playback stopped', id: Date.now() });
    } catch (err) {
      setToast({ msg: `SoundBot stop failed: ${err.message}`, id: Date.now() });
    }
  };
  const disconnectSound = async () => {
    try {
      await API.sound.disconnect();
      setCurrentSound(null);
      setToast({ msg: 'SoundBot disconnected', id: Date.now() });
    } catch (err) {
      setToast({ msg: `SoundBot disconnect failed: ${err.message}`, id: Date.now() });
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
    const apiKey = bot === 'newibot' ? 'music' : bot === 'soundbot' ? 'sound' : null;
    if (!apiKey) return;
    setToast({ msg: `Restarting ${bot}…`, id: Date.now() });
    try {
      await API.bots.restart(apiKey);
      setTimeout(() => { reloadStatus(); setToast({ msg: `✓ ${bot} restart requested`, id: Date.now() }); }, 1500);
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
    const targetChannel = userChannel || channel;
    if (!targetChannel) {
      setToast({ msg: 'Join or select a voice channel first', id: Date.now() });
      return false;
    }
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
    const target = requireVoiceTarget();
    if (!target) return;
    try {
      await API.music.connect(guildId, target.id);
      reloadPlayer();
      setToast({ msg: `NewiMusicBot joined ${target.name}`, id: Date.now() });
    } catch (err) {
      setToast({ msg: `MusicBot join failed: ${err.message}`, id: Date.now() });
    }
  };
  const stopMusic = async () => {
    try {
      await API.music.stop(guildId);
      reloadPlayer();
      setToast({ msg: 'Music playback stopped', id: Date.now() });
    } catch (err) {
      setToast({ msg: `Music stop failed: ${err.message}`, id: Date.now() });
    }
  };
  const disconnectMusic = async () => {
    try {
      await API.music.disconnect(guildId);
      reloadPlayer();
      setToast({ msg: 'NewiMusicBot disconnected', id: Date.now() });
    } catch (err) {
      setToast({ msg: `Music disconnect failed: ${err.message}`, id: Date.now() });
    }
  };
  const searchMusic = useCallback((query) => API.music.search(guildId, query), [guildId]);
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
               restartEnabled={restartEnabled}
               onRestart={(bot) => setRestartConfirm(bot)}/>
      <div className="main">
        <Topbar route={route} server={server} channel={channel || { name: '—' }} setChannel={setChannel}
                voiceJoined={voiceJoined} setVoiceJoined={setVoiceJoined}
                userChannel={userChannel} setUserChannel={setUserChannel}
                voiceChannels={voiceChannels}
                onOpenMenu={() => setMoreSheetOpen(true)}/>
        <div className="content">
          {route === 'overview' && <OverviewScreen server={server} openRoute={setRoute}
            currentTrack={playerState.queue[playerState.currentIdx]}
            voiceJoined={voiceJoined} channel={channel || { name: '—' }}
            botStatus={botStatus} currentSound={currentSound}
            botInfo={botInfo} statusData={statusData} liveLogs={liveLogs}
            sounds={sounds} soundsCount={sounds.length} queueLength={playerState.queue.length}/>}
          {route === 'sb/board' && (
            <>
              <SoundboardScreen sounds={sounds} currentSound={currentSound} currentPreview={currentPreview}
                playSound={playSound} previewSound={previewSound}
                onConnect={connectSound} onStop={stopSound} onDisconnect={disconnectSound}
                tileSize={tweaks.tileSize} userChannel={userChannel}
                voiceJoined={voiceJoined} channel={channel || { name: '—' }}/>
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
                        ? <>Playing in Discord · {voiceJoined ? channel?.name : 'joining voice'}</>
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
            botStatus={botStatus} botInfo={botInfo} statusData={statusData}/>}
          {route === 'sb/logs' && <LogsScreen bot="sound"
            botName={botInfo?.soundbot?.tag || 'SoundBot'} liveLogs={liveLogs} connection={logConnection}/>}
          {route === 'sb/settings' && <SoundbotSettingsScreen
            settings={settings} onSave={(patch) => saveSettings('sound', patch)}
            settingsLoaded={!!soundSettings}
            botStatus={botStatus.soundbot} restartEnabled={restartEnabled} onRestart={(b) => setRestartConfirm(b)}/>}

          {route === 'mb/player' && <MusicScreen playerState={playerState} dispatch={dispatchPlayer} addTrack={addMusic} searchTracks={searchMusic}
            onConnect={connectMusic} onStop={stopMusic} onDisconnect={disconnectMusic} playerStyle={tweaks.playerStyle}/>}
          {route === 'mb/stats' && <StatsScreen bot="music" sounds={sounds}
            botStatus={botStatus} botInfo={botInfo} statusData={statusData} queueLength={playerState.queue.length}/>}
          {route === 'mb/logs' && <LogsScreen bot="music"
            botName={botInfo?.newibot?.tag || 'NewiMusicBot'} liveLogs={liveLogs} connection={logConnection}/>}
          {route === 'mb/settings' && <NewibotSettingsScreen
            settings={settings} onSave={(patch) => saveSettings('music', patch)}
            settingsLoaded={!!musicSettings}
            botStatus={botStatus.newibot} restartEnabled={restartEnabled} onRestart={(b) => setRestartConfirm(b)}/>}
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
          soundsCount={sounds.length}
          restartEnabled={restartEnabled}
          onRestart={(bot) => { setRestartConfirm(bot); setMoreSheetOpen(false); }}
          onLogout={onLogout}
        />
      )}

      {restartConfirm && (
        <RestartModal which={restartConfirm}
                      onCancel={() => setRestartConfirm(null)}
                      onConfirm={() => { restartBot(restartConfirm); setRestartConfirm(null); }}/>
      )}

      <TweaksUI t={tweaks} setTweak={setTweak}/>
    </div>
  );
}

// Mapping between the UI's flat settings keys (sbPrefix, mbVol, …) and the
// per-bot API config. Keep this in one place so the screens stay dumb.
const SETTING_MAP_MUSIC = {
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
const SETTING_MAP_SOUND = {
  sbPrefix: 'prefix',
  sbMaxMb: 'maxUploadSizeMb',
  sbMaxName: 'maxFilenameLength',
  sbAutoLeave: { key: 'autoLeaveDelayMs', toApi: (v) => Number(v) * 1000, fromApi: (v) => Math.round((v || 0) / 1000) },
};

function mapSettingsPatch(uiPatch, map) {
  const out = {};
  for (const [uiKey, value] of Object.entries(uiPatch)) {
    const spec = map[uiKey];
    if (!spec) continue;
    const apiKey = typeof spec === 'string' ? spec : spec.key;
    out[apiKey] = typeof spec === 'object' && spec.toApi ? spec.toApi(value) : value;
  }
  return out;
}

function mergeSettings(music, sound) {
  const out = {
    sbPrefix: '8', sbMaxMb: 10, sbMaxName: 10, sbAutoLeave: 30,
    mbPrefix: '.', mbUsername: 'NewiMusicBot', mbLogLevel: 'info', mbSearch: 'ytsearch', mbVol: 40, mbMaxQueue: 1000,
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

const RestartModal = ({ which, onCancel, onConfirm }) => {
  const names = { soundbot: 'SoundBot', newibot: 'NewiMusicBot', all: 'both bots' };
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Restart {names[which]}?</h3>
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
