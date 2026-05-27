// Statistics, editable environment settings and live logs.
import React, { useState, useEffect, useRef } from 'react';
import { Icon, Tag } from './components.jsx';

function uptime(ms) {
  if (!Number.isFinite(ms)) return 'not available';
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export const StatsScreen = ({ bot, sounds = [], botStatus, botInfo, statusData, queueLength = 0 }) => {
  const isSound = bot === 'sound';
  const totalPlays = sounds.reduce((sum, sound) => sum + (sound.plays || 0), 0);
  const topSounds = [...sounds].filter((sound) => sound.plays > 0).sort((a, b) => b.plays - a.plays).slice(0, 8);
  const lavalink = statusData?.music?.lavalink;
  const status = isSound ? botStatus?.soundbot : botStatus?.newibot;
  const name = isSound ? (botInfo?.soundbot?.tag || 'SoundBot') : (botInfo?.newibot?.tag || 'NewiMusicBot');
  const botData = isSound ? statusData?.sound : statusData?.music;

  return (
    <div className="content-narrow">
      <div className="page-head">
        <div>
          <div className="page-title">{name} Statistics</div>
          <div className="page-sub">Live data from this bot API. Historical analytics are not recorded yet.</div>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        {isSound ? (
          <>
            <div className="stat-card"><div className="stat-label">Sound files</div><div className="stat-value">{sounds.length}</div></div>
            <div className="stat-card"><div className="stat-label">Recorded plays</div><div className="stat-value">{totalPlays.toLocaleString()}</div></div>
          </>
        ) : (
          <>
            <div className="stat-card"><div className="stat-label">Active players</div><div className="stat-value">{statusData?.music?.playerCount ?? '-'}</div></div>
            <div className="stat-card"><div className="stat-label">Current queue</div><div className="stat-value">{queueLength}</div></div>
          </>
        )}
        <div className="stat-card"><div className="stat-label">Uptime</div><div className="stat-value">{uptime(botData?.uptimeMs)}</div></div>
        <div className="stat-card"><div className="stat-label">Status</div><div className="stat-value">{status || 'offline'}</div></div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-header"><div className="card-title">{isSound ? 'Top sounds - recorded plays' : 'Playback status'}</div></div>
          {isSound && topSounds.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>No persisted play counts are reported by this bot.</div>
          ) : !isSound ? (
            <div style={{ color: 'var(--text-muted)' }}>
              The current player and editable queue are available on the Music Player page.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {topSounds.map((sound, index) => (
                <div key={sound.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-dim)', width: 16 }}>{index + 1}</span>
                  <span style={{ flex: 1, fontFamily: 'var(--font-mono)' }}>{sound.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{sound.plays}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Health</div></div>
          {[
            [name, status, uptime(botData?.uptimeMs)],
            ...(!isSound ? [['Lavalink', lavalink?.connected ? 'connected' : 'offline', lavalink?.ping == null ? '' : `${lavalink.ping} ms`]] : []),
          ].map(([rowName, state, detail]) => (
            <div key={rowName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{rowName}</span>
              <Tag kind={state === 'online' || state === 'connected' ? 'success' : 'error'}>
                {state}{detail ? ` - ${detail}` : ''}
              </Tag>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

function pickFields(settings, fields) {
  const values = {};
  for (const field of fields) values[field] = settings[field] ?? '';
  return values;
}

function useEditableSettings(settings, fields, onSave, settingsLoaded) {
  const [draft, setDraft] = useState({});
  const [pending, setPending] = useState('');
  const [feedback, setFeedback] = useState('');
  const baseline = useRef(null);
  const valueKey = fields.map((field) => String(settings[field] ?? '')).join('|');

  useEffect(() => {
    const next = pickFields(settings, fields);
    setDraft(next);
    if (settingsLoaded && !baseline.current) baseline.current = { ...next };
  }, [valueKey, settingsLoaded]);

  const setField = (field, value) => setDraft((prev) => ({ ...prev, [field]: value }));

  const commit = async (field) => {
    if (String(draft[field] ?? '') === String(settings[field] ?? '')) return;
    setPending(field);
    setFeedback('');
    const saved = await onSave({ [field]: draft[field] });
    setPending('');
    if (saved) {
      setFeedback(saved.restartRequired ? 'Saved. Restart required for this connection setting.' : 'Saved and active now.');
    } else {
      setDraft(pickFields(settings, fields));
    }
  };

  const reset = async () => {
    if (!baseline.current) return;
    setDraft({ ...baseline.current });
    const changed = Object.fromEntries(
      fields
        .filter((field) => String(baseline.current[field] ?? '') !== String(settings[field] ?? ''))
        .map((field) => [field, baseline.current[field]])
    );
    if (!Object.keys(changed).length) {
      setFeedback('Already using the initial values.');
      return;
    }
    setPending('reset');
    setFeedback('');
    const saved = await onSave(changed);
    setPending('');
    if (saved) setFeedback(saved.restartRequired ? 'Initial values restored. Restart required for connection settings.' : 'Initial values restored and active now.');
  };

  return { draft, setField, pending, feedback, commit, reset };
}

const Row = ({ label, help, children }) => (
  <div className="settings-row">
    <div className="settings-label-col">
      <div className="settings-label">{label}</div>
      {help && <div className="settings-help">{help}</div>}
    </div>
    <div className="settings-control">{children}</div>
  </div>
);

const SettingsHeader = ({ title, subtitle, botStatus, restartEnabled, botKey, onRestart, onReset, resetting, resetDisabled }) => (
  <div className="page-head">
    <div>
      <div className="page-title">{title}</div>
      <div className="page-sub">{subtitle}</div>
    </div>
    <div className="page-actions">
      <Tag kind={botStatus === 'online' ? 'success' : 'error'}><span className="dot"/> {botStatus}</Tag>
      <button className="btn btn-sm" type="button" onClick={onReset} disabled={resetting || resetDisabled}>
        <Icon name="refresh" size={13}/> {resetting ? 'Resetting...' : 'Reset page'}
      </button>
      {restartEnabled && (
        <button className="btn btn-sm" type="button" onClick={() => onRestart(botKey)}>
          <Icon name="refresh" size={13}/> Restart
        </button>
      )}
    </div>
  </div>
);

const AutoField = ({ field, value, setField, commit, pending, type = 'text', min, max, placeholder }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <input className="input" type={type} min={min} max={max} value={value ?? ''}
      placeholder={placeholder}
      onChange={(event) => setField(field, event.target.value)}
      onBlur={() => commit(field)}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
    />
    {pending === field && <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>saving...</span>}
  </div>
);

const AutoBoolean = ({ field, value, setField, commit, pending }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <select className="select" value={value ? 'true' : 'false'}
      onChange={(event) => setField(field, event.target.value === 'true')}
      onBlur={() => commit(field)}>
      <option value="true">Enabled</option>
      <option value="false">Disabled</option>
    </select>
    {pending === field && <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>saving...</span>}
  </div>
);

export const SoundbotSettingsScreen = ({ settings, onSave, settingsLoaded, botStatus, restartEnabled, onRestart }) => {
  const fields = ['sbPrefix', 'sbMaxMb', 'sbMaxName', 'sbAutoLeave'];
  const { draft, setField, pending, feedback, commit, reset } = useEditableSettings(settings, fields, onSave, settingsLoaded);

  return (
    <div className="content-narrow">
      <SettingsHeader title="SoundBot Settings" subtitle="Environment configuration for the connected SoundBot."
        botStatus={botStatus} restartEnabled={restartEnabled} botKey="soundbot" onRestart={onRestart}
        onReset={reset} resetting={pending === 'reset'} resetDisabled={!settingsLoaded}/>
      <div className="settings-notice">
        Changes save automatically when you leave a field and apply immediately.
        {feedback && <div style={{ marginTop: 6 }}>{feedback}</div>}
      </div>
      <div className="settings-group">
        <Row label="Command prefix" help="COMMAND_PREFIX">
          <AutoField field="sbPrefix" value={draft.sbPrefix} setField={setField} commit={commit} pending={pending}/>
        </Row>
        <Row label="Max upload size" help="MAX_UPLOAD_SIZE_MB">
          <AutoField field="sbMaxMb" value={draft.sbMaxMb} setField={setField} commit={commit} pending={pending} type="number" min="1"/>
        </Row>
        <Row label="Max filename length" help="MAX_FILENAME_LENGTH">
          <AutoField field="sbMaxName" value={draft.sbMaxName} setField={setField} commit={commit} pending={pending} type="number" min="1"/>
        </Row>
        <Row label="Auto-leave delay (seconds)" help="AUTO_LEAVE_DELAY_MS">
          <AutoField field="sbAutoLeave" value={draft.sbAutoLeave} setField={setField} commit={commit} pending={pending} type="number" min="0"/>
        </Row>
      </div>
    </div>
  );
};

export const NewibotSettingsScreen = ({ settings, onSave, settingsLoaded, botStatus, restartEnabled, onRestart }) => {
  const fields = [
    'mbPrefix', 'mbUsername', 'mbLogLevel', 'mbSearch', 'mbVol', 'mbMaxQueue', 'mbAutoDc',
    'mbConnTimeout', 'mbCooldown', 'mbRetryDelay', 'mbRetryCount', 'mbMaxPlaylist', 'mbMaxResults',
    'mbFast', 'mbUiInterval', 'mbFastUi', 'mbProgressLength', 'mbMaxDisplay', 'mbAutoCleanup',
    'mbPauseTimeout', 'mbVolumeStep', 'mbPrebuffer', 'mbSmartVolume', 'mbCache', 'mbCacheResults',
    'mbCacheTtl', 'mbCacheSize', 'mbQualityCache', 'mbConcurrent', 'mbPrevious',
    'llHost', 'llPort', 'llTimeout',
    'emojiPrevious', 'emojiPlaypause', 'emojiSkip', 'emojiShuffle', 'emojiStop', 'emojiYt', 'emojiYtm',
  ];
  const { draft, setField, pending, feedback, commit, reset } = useEditableSettings(settings, fields, onSave, settingsLoaded);
  const [password, setPassword] = useState('');

  const commitPassword = async () => {
    if (!password.trim()) return;
    const saved = await onSave({ llPass: password });
    if (saved) setPassword('');
  };

  return (
    <div className="content-narrow">
      <SettingsHeader title="NewiMusicBot Settings" subtitle="Environment configuration for the connected MusicBot and external Lavalink."
        botStatus={botStatus} restartEnabled={restartEnabled} botKey="newibot" onRestart={onRestart}
        onReset={reset} resetting={pending === 'reset'} resetDisabled={!settingsLoaded}/>
      <div className="settings-notice">
        Most changes apply immediately when you leave a field. Lavalink/client connection values require a bot restart.
        {feedback && <div style={{ marginTop: 6 }}>{feedback}</div>}
      </div>
      <div className="settings-group">
        <div className="settings-group-head"><div className="settings-group-title">General and playback</div></div>
        <Row label="Command prefix" help="COMMAND_PREFIX"><AutoField field="mbPrefix" value={draft.mbPrefix} setField={setField} commit={commit} pending={pending}/></Row>
        <Row label="Lavalink client name" help="BOT_USERNAME"><AutoField field="mbUsername" value={draft.mbUsername} setField={setField} commit={commit} pending={pending}/></Row>
        <Row label="Log level" help="LOG_LEVEL"><AutoField field="mbLogLevel" value={draft.mbLogLevel} setField={setField} commit={commit} pending={pending}/></Row>
        <Row label="Search platform" help="DEFAULT_SEARCH_PLATFORM"><AutoField field="mbSearch" value={draft.mbSearch} setField={setField} commit={commit} pending={pending}/></Row>
        <Row label="Default volume" help="DEFAULT_VOLUME"><AutoField field="mbVol" value={draft.mbVol} setField={setField} commit={commit} pending={pending} type="number" min="0" max="100"/></Row>
        <Row label="Max queue size" help="MAX_QUEUE_SIZE"><AutoField field="mbMaxQueue" value={draft.mbMaxQueue} setField={setField} commit={commit} pending={pending} type="number" min="1"/></Row>
        <Row label="Auto-disconnect (minutes)" help="AUTO_DISCONNECT_DELAY_MS"><AutoField field="mbAutoDc" value={draft.mbAutoDc} setField={setField} commit={commit} pending={pending} type="number" min="0"/></Row>
        <Row label="Pause timeout (minutes)" help="PAUSE_TIMEOUT_MS"><AutoField field="mbPauseTimeout" value={draft.mbPauseTimeout} setField={setField} commit={commit} pending={pending} type="number" min="0"/></Row>
        <Row label="Volume step" help="VOLUME_STEP"><AutoField field="mbVolumeStep" value={draft.mbVolumeStep} setField={setField} commit={commit} pending={pending} type="number" min="1"/></Row>
        <Row label="Pre-buffer next track" help="PREBUFFER_NEXT"><AutoBoolean field="mbPrebuffer" value={draft.mbPrebuffer} setField={setField} commit={commit} pending={pending}/></Row>
        <Row label="Smart volume control" help="SMART_VOLUME_CONTROL"><AutoBoolean field="mbSmartVolume" value={draft.mbSmartVolume} setField={setField} commit={commit} pending={pending}/></Row>
      </div>
      <div className="settings-group">
        <div className="settings-group-head"><div className="settings-group-title">Limits and interface</div></div>
        <Row label="Command cooldown (ms)" help="COMMAND_COOLDOWN_MS"><AutoField field="mbCooldown" value={draft.mbCooldown} setField={setField} commit={commit} pending={pending} type="number" min="0"/></Row>
        <Row label="Max playlist size" help="MAX_PLAYLIST_SIZE"><AutoField field="mbMaxPlaylist" value={draft.mbMaxPlaylist} setField={setField} commit={commit} pending={pending} type="number" min="1"/></Row>
        <Row label="Max search results" help="MAX_SEARCH_RESULTS"><AutoField field="mbMaxResults" value={draft.mbMaxResults} setField={setField} commit={commit} pending={pending} type="number" min="1"/></Row>
        <Row label="Fast mode" help="FAST_MODE_ENABLED"><AutoBoolean field="mbFast" value={draft.mbFast} setField={setField} commit={commit} pending={pending}/></Row>
        <Row label="UI update interval (ms)" help="UI_UPDATE_INTERVAL_MS"><AutoField field="mbUiInterval" value={draft.mbUiInterval} setField={setField} commit={commit} pending={pending} type="number" min="1"/></Row>
        <Row label="Fast UI updates" help="FAST_UI_UPDATES"><AutoBoolean field="mbFastUi" value={draft.mbFastUi} setField={setField} commit={commit} pending={pending}/></Row>
        <Row label="Progress bar length" help="PROGRESS_BAR_LENGTH"><AutoField field="mbProgressLength" value={draft.mbProgressLength} setField={setField} commit={commit} pending={pending} type="number" min="1"/></Row>
        <Row label="Max displayed tracks" help="MAX_DISPLAY_TRACKS"><AutoField field="mbMaxDisplay" value={draft.mbMaxDisplay} setField={setField} commit={commit} pending={pending} type="number" min="1"/></Row>
        <Row label="Auto UI cleanup" help="AUTO_UI_CLEANUP"><AutoBoolean field="mbAutoCleanup" value={draft.mbAutoCleanup} setField={setField} commit={commit} pending={pending}/></Row>
      </div>
      <div className="settings-group">
        <div className="settings-group-head"><div className="settings-group-title">Lavalink</div><Tag kind="info">external</Tag></div>
        <Row label="Host" help="LAVALINK_HOST"><AutoField field="llHost" value={draft.llHost} setField={setField} commit={commit} pending={pending}/></Row>
        <Row label="Port" help="LAVALINK_PORT"><AutoField field="llPort" value={draft.llPort} setField={setField} commit={commit} pending={pending} type="number" min="1"/></Row>
        <Row label="Password" help="LAVALINK_PASSWORD">
          <input className="input" value={password} onChange={(event) => setPassword(event.target.value)}
            onBlur={commitPassword} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
            type="password" placeholder="Leave blank to keep current password"/>
        </Row>
        <Row label="Timeout (ms)" help="LAVALINK_TIMEOUT_MS"><AutoField field="llTimeout" value={draft.llTimeout} setField={setField} commit={commit} pending={pending} type="number" min="1"/></Row>
        <Row label="Connection timeout (ms)" help="CONNECTION_TIMEOUT_MS"><AutoField field="mbConnTimeout" value={draft.mbConnTimeout} setField={setField} commit={commit} pending={pending} type="number" min="1"/></Row>
        <Row label="Retry delay (ms)" help="LAVALINK_RETRY_DELAY_MS"><AutoField field="mbRetryDelay" value={draft.mbRetryDelay} setField={setField} commit={commit} pending={pending} type="number" min="0"/></Row>
        <Row label="Retry count" help="LAVALINK_RETRY_COUNT"><AutoField field="mbRetryCount" value={draft.mbRetryCount} setField={setField} commit={commit} pending={pending} type="number" min="0"/></Row>
      </div>
      <div className="settings-group">
        <div className="settings-group-head"><div className="settings-group-title">Cache and history</div></div>
        <Row label="Cache enabled" help="CACHE_ENABLED"><AutoBoolean field="mbCache" value={draft.mbCache} setField={setField} commit={commit} pending={pending}/></Row>
        <Row label="Cache search results" help="CACHE_SEARCH_RESULTS"><AutoBoolean field="mbCacheResults" value={draft.mbCacheResults} setField={setField} commit={commit} pending={pending}/></Row>
        <Row label="Cache TTL (seconds)" help="CACHE_TTL_SECONDS"><AutoField field="mbCacheTtl" value={draft.mbCacheTtl} setField={setField} commit={commit} pending={pending} type="number" min="0"/></Row>
        <Row label="Max cache size" help="MAX_CACHE_SIZE"><AutoField field="mbCacheSize" value={draft.mbCacheSize} setField={setField} commit={commit} pending={pending} type="number" min="0"/></Row>
        <Row label="Track quality cache" help="TRACK_QUALITY_CACHE"><AutoBoolean field="mbQualityCache" value={draft.mbQualityCache} setField={setField} commit={commit} pending={pending}/></Row>
        <Row label="Concurrent searches" help="MAX_CONCURRENT_SEARCHES"><AutoField field="mbConcurrent" value={draft.mbConcurrent} setField={setField} commit={commit} pending={pending} type="number" min="1"/></Row>
        <Row label="Previous tracks kept" help="MAX_PREVIOUS_TRACKS"><AutoField field="mbPrevious" value={draft.mbPrevious} setField={setField} commit={commit} pending={pending} type="number" min="0"/></Row>
      </div>
      <div className="settings-group">
        <div className="settings-group-head"><div className="settings-group-title">Discord emoji IDs</div></div>
        <Row label="Previous" help="EMOJI_PREVIOUS_ID"><AutoField field="emojiPrevious" value={draft.emojiPrevious} setField={setField} commit={commit} pending={pending}/></Row>
        <Row label="Play / pause" help="EMOJI_PLAYPAUSE_ID"><AutoField field="emojiPlaypause" value={draft.emojiPlaypause} setField={setField} commit={commit} pending={pending}/></Row>
        <Row label="Skip" help="EMOJI_SKIP_ID"><AutoField field="emojiSkip" value={draft.emojiSkip} setField={setField} commit={commit} pending={pending}/></Row>
        <Row label="Shuffle" help="EMOJI_SHUFFLE_ID"><AutoField field="emojiShuffle" value={draft.emojiShuffle} setField={setField} commit={commit} pending={pending}/></Row>
        <Row label="Stop" help="EMOJI_STOP_ID"><AutoField field="emojiStop" value={draft.emojiStop} setField={setField} commit={commit} pending={pending}/></Row>
        <Row label="YouTube" help="EMOJI_YT_ID"><AutoField field="emojiYt" value={draft.emojiYt} setField={setField} commit={commit} pending={pending}/></Row>
        <Row label="YouTube Music" help="EMOJI_YTM_ID"><AutoField field="emojiYtm" value={draft.emojiYtm} setField={setField} commit={commit} pending={pending}/></Row>
      </div>
    </div>
  );
};

export const LogsScreen = ({ bot, botName, liveLogs, connection }) => {
  const [filter, setFilter] = useState('all');
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (paused) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [liveLogs, paused]);

  const botLogs = liveLogs.filter((line) => line.src === bot);
  const filtered = botLogs.filter((line) => filter === 'all' || line.level === filter);

  return (
    <div className="content-narrow">
      <div className="page-head">
        <div>
          <div className="page-title">{botName} Live Logs</div>
          <div className="page-sub">Streaming from this bot. <span className="dot" style={{ background: paused || connection?.state === 'error' ? 'var(--amber)' : 'var(--green)' }}/> {paused ? 'paused' : connection?.state || 'connecting'} - {botLogs.length} lines</div>
        </div>
        <div className="page-actions">
          <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 140 }}>
            <option value="all">All levels</option>
            <option value="info">Info</option>
            <option value="warn">Warnings</option>
            <option value="error">Errors</option>
            <option value="debug">Debug</option>
          </select>
          <button className="btn btn-sm" onClick={() => setPaused((value) => !value)}>
            {paused ? <><Icon name="play" size={12}/> Resume</> : <><Icon name="pause" size={12}/> Pause</>}
          </button>
        </div>
      </div>

      {connection?.message && <div className="settings-notice" style={{ marginBottom: 14 }}>{connection.message}</div>}
      <div className="logs" ref={scrollRef}>
        {filtered.map((line, index) => (
          <div key={index} className={'log-line src-' + line.src}>
            <span className="log-time">{line.time}</span>
            <span className={'log-level ' + line.level}>{line.level.toUpperCase()}</span>
            <span className="log-msg">
              <span style={{ color: line.src === 'music' ? 'oklch(0.72 0.15 240)' : line.src === 'sound' ? 'oklch(0.7 0.16 25)' : 'var(--text-dim)', fontWeight: 600 }}>[{line.src}]</span> {line.text}
            </span>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ color: 'var(--text-muted)', padding: 14 }}>No log events received yet.</div>}
      </div>
    </div>
  );
};
