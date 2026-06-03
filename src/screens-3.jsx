// Statistics, editable environment settings and live logs.
import React, { useState, useEffect, useRef } from 'react';
import { Icon, Tag } from './components.jsx';
import { dashboardBotName } from './botIdentity.js';
import { useCloseOnOutside, useFetch, usePoll } from './hooks.js';
import * as API from './api.js';

const LOG_LEVELS = [
  { value: 'all', label: 'All levels' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warnings' },
  { value: 'error', label: 'Errors' },
  { value: 'debug', label: 'Debug' },
];

const LevelDropdown = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useCloseOnOutside(ref, open, () => setOpen(false));
  const current = LOG_LEVELS.find((l) => l.value === value) || LOG_LEVELS[0];
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="btn" type="button" onClick={() => setOpen((o) => !o)}
        style={{ width: 150, justifyContent: 'space-between' }} aria-haspopup="menu" aria-expanded={open}>
        <span>{current.label}</span>
        <Icon name="chevron-down" size={13} style={{ color: 'var(--text-dim)' }}/>
      </button>
      {open && (
        <div className="menu" style={{ top: 'calc(100% + 6px)', right: 0, minWidth: 160 }} role="menu">
          {LOG_LEVELS.map((l) => (
            <div key={l.value} className="menu-item" role="menuitemradio" aria-checked={l.value === value}
              onClick={() => { onChange(l.value); setOpen(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1 }}>{l.label}</span>
              {l.value === value && <Icon name="check" size={12} style={{ color: 'var(--accent)' }}/>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function uptime(ms) {
  if (!Number.isFinite(ms)) return 'not available';
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export const StatsScreen = ({ bot, sounds = [], botStatus, botInfo, statusData, queueLength = 0, apiStats = null }) => {
  const isSound = bot === 'sound';
  const totalPlays = sounds.reduce((sum, sound) => sum + (sound.plays || 0), 0);
  const topSounds = [...sounds].filter((sound) => sound.plays > 0).sort((a, b) => b.plays - a.plays).slice(0, 8);
  const lavalink = statusData?.music?.lavalink;
  const status = isSound ? botStatus?.sound : botStatus?.music;
  const name = isSound ? dashboardBotName('sound', botInfo) : dashboardBotName('music', botInfo);
  const botData = isSound ? statusData?.sound : statusData?.music;
  const fallbackCards = isSound
    ? [
        { key: 'sounds', label: 'Sound files', value: sounds.length },
        { key: 'plays', label: 'Recorded plays', value: totalPlays.toLocaleString() },
        { key: 'uptime', label: 'Uptime', value: uptime(botData?.uptimeMs) },
        { key: 'status', label: 'Status', value: status || 'offline' },
      ]
    : [
        { key: 'players', label: 'Active players', value: statusData?.music?.playerCount ?? '-' },
        { key: 'queue', label: 'Current queue', value: queueLength },
        { key: 'uptime', label: 'Uptime', value: uptime(botData?.uptimeMs) },
        { key: 'status', label: 'Status', value: status || 'offline' },
      ];
  const cards = apiStats?.cards?.length ? apiStats.cards : fallbackCards;
  const health = apiStats?.health?.length
    ? apiStats.health
    : [
        { key: 'discord', label: name, status: status === 'online' ? 'ok' : 'warn', detail: uptime(botData?.uptimeMs) },
        ...(!isSound ? [{ key: 'lavalink', label: 'Lavalink', status: lavalink?.connected ? 'ok' : 'warn', detail: lavalink?.ping == null ? '' : `${lavalink.ping} ms` }] : []),
      ];

  return (
    <div className="content-narrow">
      <div className="page-head">
        <div>
          <div className="page-title">Statistics</div>
          <div className="page-sub">Live data from this bot API. Historical analytics are not recorded yet.</div>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        {cards.slice(0, 8).map((card) => (
          <div className="stat-card" key={card.key || card.label}>
            <div className="stat-label">{card.label}</div>
            <div className="stat-value">{String(card.value ?? '-')}</div>
          </div>
        ))}
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
          {health.map((item) => (
            <div key={item.key || item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{item.label}</span>
              <Tag kind={item.status === 'ok' || item.status === 'online' || item.status === 'connected' ? 'success' : item.status === 'neutral' ? 'info' : 'error'}>
                {item.status}{item.detail ? ` - ${item.detail}` : ''}
              </Tag>
            </div>
          ))}
        </div>
      </div>
      {apiStats?.tables?.filter((table) => table.rows?.length).map((table) => (
        <div className="card" style={{ marginTop: 16 }} key={table.key || table.label}>
          <div className="card-header"><div className="card-title">{table.label}</div></div>
          <div className="generic-table">
            {table.rows.slice(0, 20).map((row, index) => (
              <div className="generic-table-row" key={index}>
                {Object.entries(row).slice(0, 5).map(([key, value]) => (
                  <div key={key}>
                    <span>{key}</span>
                    <strong>{String(value ?? '-')}</strong>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
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

const SettingsHeader = ({ title, subtitle, botStatus, restartEnabled, botKey, onRestart, onStop, onStart, onReset, resetting, resetDisabled }) => (
  <div className="page-head">
    <div>
      <div className="page-title">{title}</div>
      <div className="page-sub">{subtitle}</div>
    </div>
    <div className="page-actions">
      <Tag kind={botStatus === 'online' ? 'success' : 'error'}><span className="dot"/> {botStatus || 'offline'}</Tag>
      {onReset && (
        <button className="btn btn-sm" type="button" onClick={onReset} disabled={resetting || resetDisabled}>
          <Icon name="refresh" size={13}/> {resetting ? 'Resetting...' : 'Reset page'}
        </button>
      )}
      {restartEnabled && botStatus !== 'online' && onStart && (
        <button className="btn btn-sm btn-primary" type="button" onClick={() => onStart(botKey)}>
          <Icon name="play" size={13}/> Start
        </button>
      )}
      {restartEnabled && botStatus === 'online' && (
        <>
          {onStop && (
            <button className="btn btn-sm" type="button" onClick={() => onStop(botKey)}>
              <Icon name="stop" size={13}/> Stop
            </button>
          )}
          {onRestart && (
            <button className="btn btn-sm" type="button" onClick={() => onRestart(botKey)}>
              <Icon name="refresh" size={13}/> Restart
            </button>
          )}
        </>
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

export const SoundbotSettingsScreen = ({ settings, onSave, settingsLoaded, botStatus, botName = 'Sound Bot', restartEnabled, onRestart, onStop, onStart }) => {
  const fields = ['sbPrefix', 'sbMaxMb', 'sbMaxName', 'sbAutoLeave'];
  const { draft, setField, pending, feedback, commit, reset } = useEditableSettings(settings, fields, onSave, settingsLoaded);

  return (
    <div className="content-narrow">
      <SettingsHeader title="Settings" subtitle={`Environment configuration for ${botName}.`}
        botStatus={botStatus} restartEnabled={restartEnabled} botKey="sound" onRestart={onRestart} onStop={onStop} onStart={onStart}
        onReset={reset} resetting={pending === 'reset'} resetDisabled={!settingsLoaded}/>
      {feedback && <div className="settings-notice">{feedback}</div>}
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

export const NewibotSettingsScreen = ({ settings, onSave, settingsLoaded, botStatus, botName = 'Music Bot', restartEnabled, onRestart, onStop, onStart }) => {
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
      <SettingsHeader title="Settings" subtitle={`Environment configuration for ${botName} and external Lavalink.`}
        botStatus={botStatus} restartEnabled={restartEnabled} botKey="music" onRestart={onRestart} onStop={onStop} onStart={onStart}
        onReset={reset} resetting={pending === 'reset'} resetDisabled={!settingsLoaded}/>
      {feedback && <div className="settings-notice">{feedback}</div>}
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
          <div className="page-title">Live Logs</div>
          <div className="page-sub">Streaming from this bot. <span className="dot" style={{ background: paused || connection?.state === 'error' ? 'var(--amber)' : 'var(--green)' }}/> {paused ? 'paused' : connection?.state || 'connecting'} - {botLogs.length} lines</div>
        </div>
        <div className="page-actions">
          <LevelDropdown value={filter} onChange={setFilter}/>
          <button className="btn" onClick={() => setPaused((value) => !value)}>
            {paused ? <><Icon name="play" size={13}/> Resume</> : <><Icon name="pause" size={13}/> Pause</>}
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
              {line.text}
            </span>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ color: 'var(--text-muted)', padding: 14 }}>No log events received yet.</div>}
      </div>
    </div>
  );
};

export const GenericStatsScreen = ({ botId, botName }) => {
  // Screen bleibt dank CSS-hidden gemountet — kein Remount beim Seitenwechsel,
  // daher kein Loading-Flash. Daten bleiben im lokalen State erhalten.
  const { data: stats, error, reload } = usePoll(
    () => API.moduleApi.stats(botId),
    5000,
    [botId],
  );

  return (
    <div className="content-narrow">
      <div className="page-head">
        <div>
          <div className="page-title">Statistics</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-sm" type="button" onClick={reload}>
            <Icon name="refresh" size={13}/> Refresh
          </button>
        </div>
      </div>
      {error && <div className="settings-notice registry-error">Stats failed: {error.message}</div>}
      {stats && (
        <>
          <div className="grid grid-4" style={{ marginBottom: 16 }}>
            {(stats.cards || []).map((card) => (
              <div className="stat-card" key={card.key || card.label}>
                <div className="stat-label">{card.label}</div>
                <div className="stat-value">{String(card.value ?? '-')}</div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">{botName} health</div></div>
            {(stats.health || []).map((item) => (
              <div key={item.key || item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{item.label}</span>
                <Tag kind={item.status === 'ok' ? 'success' : item.status === 'neutral' ? 'info' : 'error'}>
                  {item.status}{item.detail ? ` - ${item.detail}` : ''}
                </Tag>
              </div>
            ))}
            {(!stats.health || stats.health.length === 0) && <div style={{ color: 'var(--text-muted)' }}>No health entries reported.</div>}
          </div>
          {(stats.tables || []).filter((table) => table.rows?.length).map((table) => (
            <div className="card" style={{ marginTop: 16 }} key={table.key || table.label}>
              <div className="card-header"><div className="card-title">{table.label}</div></div>
              <div className="generic-table">
                {table.rows.slice(0, 20).map((row, index) => (
                  <div className="generic-table-row" key={index}>
                    {Object.entries(row).slice(0, 5).map(([key, value]) => (
                      <div key={key}>
                        <span>{key}</span>
                        <strong>{String(value ?? '-')}</strong>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export const GenericSettingsScreen = ({ botId, botName, setToast, botStatus, restartEnabled, onRestart, onStop, onStart }) => {
  const { data: schema, error: schemaError } = useFetch(
    () => API.moduleApi.settingsSchema(botId),
    [botId],
  );
  const { data: settings, error: settingsError, reload } = useFetch(
    () => API.moduleApi.settings(botId),
    [botId],
  );
  const [draft, setDraft] = useState({});
  const [pending, setPending] = useState('');

  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  const saveField = async (field) => {
    if (!field.editable || field.secret) return;
    const value = draft[field.key];
    if (String(value ?? '') === String(settings?.[field.key] ?? '')) return;
    setPending(field.key);
    try {
      const result = await API.moduleApi.saveSettings(botId, { [field.key]: value });
      await reload();
      setToast?.({
        id: Date.now(),
        msg: result?.restartRequired ? `${botName}: saved, restart required` : `${botName}: setting saved`,
      });
    } catch (err) {
      setDraft(settings || {});
      setToast?.({ id: Date.now(), msg: `${botName}: save failed: ${err.message}` });
    } finally {
      setPending('');
    }
  };

  const renderField = (field) => {
    const disabled = !field.editable || field.secret || pending === field.key;
    const value = draft[field.key] ?? '';
    if (field.type === 'boolean') {
      return (
        <select className="select" value={value ? 'true' : 'false'} disabled={disabled}
          onChange={(event) => setDraft((prev) => ({ ...prev, [field.key]: event.target.value === 'true' }))}
          onBlur={() => saveField(field)}>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
      );
    }
    return (
      <input className="input" type={field.type === 'number' ? 'number' : field.secret ? 'password' : 'text'}
        value={field.secret ? '' : value}
        placeholder={field.secret ? 'hidden' : ''}
        disabled={disabled}
        onChange={(event) => setDraft((prev) => ({ ...prev, [field.key]: field.type === 'number' ? Number(event.target.value) : event.target.value }))}
        onBlur={() => saveField(field)}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}/>
    );
  };

  return (
    <div className="content-narrow">
      <SettingsHeader title="Settings" subtitle={`Environment configuration for ${botName}.`}
        botStatus={botStatus} restartEnabled={restartEnabled} botKey={botId} onRestart={onRestart} onStop={onStop} onStart={onStart}
        onReset={null} resetting={false} resetDisabled={true}/>
      {(schemaError || settingsError) && <div className="settings-notice registry-error">Failed: {(schemaError || settingsError)?.message}</div>}
      {!schema && !schemaError && <div className="empty" style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>}
      {(schemaError || settingsError) && (
        <div className="settings-notice registry-error">
          Settings failed: {(schemaError || settingsError).message}
        </div>
      )}
      {schema?.sections?.map((section) => (
        <div className="settings-group" key={section.id}>
          <div className="settings-group-head"><div className="settings-group-title">{section.label}</div></div>
          {section.fields.map((field) => (
            <Row key={field.key} label={field.label || field.key} help={field.env}>
              <div className="generic-setting-control">
                {renderField(field)}
                {field.restartRequired && <Tag kind="warn">restart</Tag>}
                {pending === field.key && <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>saving...</span>}
              </div>
            </Row>
          ))}
        </div>
      ))}
    </div>
  );
};

function intervalLabel(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return 'off';
  const minutes = Math.round(value / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours} h`;
}

function channelName(channels, id) {
  return channels.find((channel) => channel.id === id)?.name || id || 'not set';
}

function patchSummary(patch) {
  return patch?.summary || `New ${patch?.game || 'game'} patch notes are available.`;
}

export const PatchWatcherScreen = ({ botId, botName, guildId, setToast }) => {
  const { data: patches, loading: patchesLoading, error: patchesError, reload: reloadPatches } = usePoll(
    () => API.moduleApi.patches(botId),
    10000,
    [botId],
  );
  const { data: sources, loading: sourcesLoading, error: sourcesError, reload: reloadSources } = usePoll(
    () => API.moduleApi.sources(botId),
    10000,
    [botId],
  );
  const { data: settings, loading: settingsLoading, error: settingsError, reload: reloadSettings } = useFetch(
    () => API.moduleApi.settings(botId),
    [botId],
  );
  const { data: guild } = usePoll(
    () => API.moduleApi.guild(botId, guildId).catch(() => null),
    10000,
    [botId, guildId],
  );
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState('');
  const [selectedPatchId, setSelectedPatchId] = useState('');
  const [manualChannelId, setManualChannelId] = useState('');
  const EMPTY_SOURCE_FORM = { name: '', game: '', url: '', mode: 'generic' };
  const [sourceFormOpen, setSourceFormOpen] = useState(false);
  const [sourceForm, setSourceForm] = useState(EMPTY_SOURCE_FORM);
  const [savingSource, setSavingSource] = useState(false);
  const latest = patches || [];
  const sourceList = sources || [];
  const textChannels = guild?.textChannels || [];
  const selectedPatch = latest.find((patch) => patch.id === selectedPatchId) || latest[0] || null;

  useEffect(() => {
    if (!selectedPatchId && latest[0]?.id) setSelectedPatchId(latest[0].id);
  }, [latest, selectedPatchId]);

  useEffect(() => {
    if (settings?.defaultChannelId && !manualChannelId) setManualChannelId(settings.defaultChannelId);
  }, [settings?.defaultChannelId, manualChannelId]);

  const runCheck = async (post = false) => {
    setChecking(true);
    try {
      const result = await API.moduleApi.checkPatches(botId, post);
      await Promise.all([reloadPatches(), reloadSources()]);
      setToast?.({ id: Date.now(), msg: `${botName}: ${result.newPatches} new patch notes found` });
    } catch (err) {
      setToast?.({ id: Date.now(), msg: `${botName}: check failed: ${err.message}` });
    } finally {
      setChecking(false);
    }
  };

  const toggleSource = async (source) => {
    try {
      await API.moduleApi.updateSource(botId, source.id, { enabled: !source.enabled });
      await reloadSources();
    } catch (err) {
      setToast?.({ id: Date.now(), msg: `${source.name}: update failed: ${err.message}` });
    }
  };

  const updateSource = async (source, patch) => {
    setPending(`source:${source.id}`);
    try {
      await API.moduleApi.updateSource(botId, source.id, patch);
      await reloadSources();
      setToast?.({ id: Date.now(), msg: `${source.name}: saved` });
    } catch (err) {
      setToast?.({ id: Date.now(), msg: `${source.name}: update failed: ${err.message}` });
    } finally {
      setPending('');
    }
  };

  const saveSetting = async (key, value) => {
    setPending(key);
    try {
      const result = await API.moduleApi.saveSettings(botId, { [key]: value });
      await reloadSettings();
      setToast?.({
        id: Date.now(),
        msg: result?.restartRequired ? `${botName}: saved, restart required` : `${botName}: setting saved`,
      });
    } catch (err) {
      setToast?.({ id: Date.now(), msg: `${botName}: save failed: ${err.message}` });
    } finally {
      setPending('');
    }
  };

  const addSourceFn = async (e) => {
    e.preventDefault();
    setSavingSource(true);
    try {
      await API.moduleApi.addSource(botId, sourceForm);
      await reloadSources();
      setSourceFormOpen(false);
      setSourceForm(EMPTY_SOURCE_FORM);
      setToast?.({ id: Date.now(), msg: `Source "${sourceForm.name}" added` });
    } catch (err) {
      setToast?.({ id: Date.now(), msg: `Add source failed: ${err.message}` });
    } finally {
      setSavingSource(false);
    }
  };

  const deleteSourceFn = async (source) => {
    if (!window.confirm(`Remove "${source.name}"?`)) return;
    try {
      await API.moduleApi.deleteSource(botId, source.id);
      await reloadSources();
      setToast?.({ id: Date.now(), msg: `Source "${source.name}" removed` });
    } catch (err) {
      setToast?.({ id: Date.now(), msg: `Remove failed: ${err.message}` });
    }
  };

  const postPatch = async (patch) => {
    try {
      await API.moduleApi.postPatch(botId, patch.id, manualChannelId);
      await reloadPatches();
      setToast?.({ id: Date.now(), msg: `${botName}: patch posted` });
    } catch (err) {
      setToast?.({ id: Date.now(), msg: `${botName}: post failed: ${err.message}` });
    }
  };

  const embedColor = settings?.embedColor || '#8bd450';
  const postContent = settings?.postContent || '';

  // Zeige Ladeindikator bis erste Daten da sind — verhindert kurzen Leer-Flash
  const initialLoad = patchesLoading && settingsLoading && !latest.length && !sourceList.length;
  if (initialLoad) {
    return (
      <div className="content-narrow">
        <div className="page-head"><div><div className="page-title">Patch Control</div></div></div>
        <div style={{ color: 'var(--text-muted)', paddingTop: 40 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="content-narrow">
      <div className="page-head">
        <div>
          <div className="page-title">Patch Control</div>
          <div className="page-sub">Preview posts, choose channels and control automatic patch-note posting.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-sm" type="button" onClick={() => runCheck(false)} disabled={checking}>
            <Icon name="refresh" size={13}/> {checking ? 'Checking...' : 'Check now'}
          </button>
          <button className="btn btn-sm btn-primary" type="button" onClick={() => runCheck(true)} disabled={checking}>
            <Icon name="send" size={13}/> Check + post
          </button>
        </div>
      </div>

      {(patchesError || sourcesError || settingsError) && (
        <div className="settings-notice registry-error" style={{ marginBottom: 16 }}>
          PatchWatcher failed: {(patchesError || sourcesError || settingsError).message}
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Posting</div>
            {settings?.autoPost ? <Tag kind="success">auto on</Tag> : <Tag kind="info">manual</Tag>}
          </div>
          {settingsLoading && <div style={{ color: 'var(--text-muted)' }}>Loading posting settings...</div>}
          {settings && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Row label="Default channel" help="Used when a source has no own channel.">
                <select className="select" value={settings.defaultChannelId || ''} disabled={pending === 'defaultChannelId'}
                  onChange={(event) => saveSetting('defaultChannelId', event.target.value)}>
                  <option value="">No default channel</option>
                  {textChannels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
                </select>
              </Row>
              <Row label="Manual post channel" help="Used by the Post buttons on this page.">
                <select className="select" value={manualChannelId}
                  onChange={(event) => setManualChannelId(event.target.value)}>
                  <option value="">Use source/default channel</option>
                  {textChannels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
                </select>
              </Row>
              <Row label="Auto-post new patches" help="When enabled, newly found patches are posted during scheduled checks.">
                <select className="select" value={settings.autoPost ? 'true' : 'false'} disabled={pending === 'autoPost'}
                  onChange={(event) => saveSetting('autoPost', event.target.value === 'true')}>
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </Row>
              <Row label="Check interval" help="Requires bot restart after saving.">
                <select className="select" value={String(settings.checkIntervalMs || 900000)} disabled={pending === 'checkIntervalMs'}
                  onChange={(event) => saveSetting('checkIntervalMs', Number(event.target.value))}>
                  <option value="300000">5 min</option>
                  <option value="900000">15 min</option>
                  <option value="1800000">30 min</option>
                  <option value="3600000">1 h</option>
                  <option value="21600000">6 h</option>
                </select>
              </Row>
              <Row label="Post text" help="Optional text above the embed. Role mentions from sources still work.">
                <input key={`postContent:${postContent}`} className="input" defaultValue={postContent} disabled={pending === 'postContent'}
                  placeholder="Optional message text"
                  onBlur={(event) => {
                    if (event.target.value !== postContent) saveSetting('postContent', event.target.value);
                  }}
                  onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}/>
              </Row>
              <Row label="Embed color" help="Hex color for Discord embeds.">
                <input key={`embedColor:${embedColor}`} className="input" defaultValue={embedColor} disabled={pending === 'embedColor'}
                  onBlur={(event) => {
                    if (event.target.value !== embedColor) saveSetting('embedColor', event.target.value);
                  }}
                  placeholder="#8bd450"/>
              </Row>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Discord Preview</div></div>
          {!selectedPatch && <div style={{ color: 'var(--text-muted)' }}>No patch selected yet.</div>}
          {selectedPatch && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <select className="select" value={selectedPatch.id} onChange={(event) => setSelectedPatchId(event.target.value)}>
                {latest.slice(0, 20).map((patch) => <option key={patch.id} value={patch.id}>{patch.title}</option>)}
              </select>
              <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                Target: {manualChannelId ? `#${channelName(textChannels, manualChannelId)}` : 'source/default channel'}
              </div>
              {/* Discord-style message preview */}
              <div style={{ background: '#111214', borderRadius: 6, padding: '12px 14px' }}>
                {/* Post content above embed (like a Discord message) */}
                {postContent && (
                  <div style={{ color: '#dbdee1', fontSize: 15, lineHeight: 1.375, marginBottom: 6, wordBreak: 'break-word' }}>
                    {postContent}
                  </div>
                )}
                {/* Discord embed block */}
                <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', background: '#2b2d31' }}>
                  {/* Left accent bar */}
                  <div style={{ width: 4, flexShrink: 0, background: embedColor }}/>
                  {/* Embed body */}
                  <div style={{ flex: 1, minWidth: 0, padding: '8px 12px 12px 12px' }}>
                    {/* Title — Discord link blue */}
                    <a href={selectedPatch.url} target="_blank" rel="noreferrer"
                       style={{ display: 'block', marginTop: 6, color: '#00b0f4', fontWeight: 600, fontSize: 15, textDecoration: 'none', lineHeight: 1.375, wordBreak: 'break-word' }}>
                      {selectedPatch.title}
                    </a>
                    {/* Description */}
                    <div style={{ marginTop: 6, color: '#dbdee1', fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word' }}>
                      {patchSummary(selectedPatch)}
                    </div>
                    {/* Inline fields — 2-column grid like Discord */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, max-content))', gap: '0 32px', marginTop: 8 }}>
                      {selectedPatch.game && (
                        <div>
                          <div style={{ color: '#dbdee1', fontSize: 14, fontWeight: 700 }}>Game</div>
                          <div style={{ color: '#dbdee1', fontSize: 14, marginTop: 2 }}>{selectedPatch.game}</div>
                        </div>
                      )}
                      {selectedPatch.sourceName && (
                        <div>
                          <div style={{ color: '#dbdee1', fontSize: 14, fontWeight: 700 }}>Source</div>
                          <div style={{ color: '#dbdee1', fontSize: 14, marginTop: 2 }}>{selectedPatch.sourceName}</div>
                        </div>
                      )}
                    </div>
                    {/* Image */}
                    {selectedPatch.imageUrl && (
                      <img src={selectedPatch.imageUrl} alt=""
                           style={{ display: 'block', width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 3, marginTop: 16 }}/>
                    )}
                    {/* Footer — timestamp only, no Botboard metadata in the preview */}
                    {(selectedPatch.publishedAt || selectedPatch.discoveredAt) && (
                      <div style={{ color: '#949ba4', fontSize: 12, marginTop: 8 }}>
                        {selectedPatch.publishedAt
                          ? new Date(selectedPatch.publishedAt).toLocaleString()
                          : `Discovered ${new Date(selectedPatch.discoveredAt).toLocaleString()}`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button className="btn btn-sm btn-primary" type="button" onClick={() => postPatch(selectedPatch)}>
                <Icon name="send" size={13}/> Post selected
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Sources</div>
            <button className="btn btn-sm btn-primary" type="button" onClick={() => { setSourceForm(EMPTY_SOURCE_FORM); setSourceFormOpen(true); }}>
              <Icon name="plus" size={12}/> Add
            </button>
          </div>
          {sourcesLoading && <div style={{ color: 'var(--text-muted)' }}>Loading sources...</div>}
          {!sourcesLoading && sourceList.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No sources yet. Add one above.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sourceList.map((source) => (
              <div key={source.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700 }}>{source.name}</span>
                    <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{source.game}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-deeper)', padding: '1px 5px', borderRadius: 3 }}>{source.mode || 'generic'}</span>
                  </div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 2 }}>
                    {source.lastCheck ? `Last check ${new Date(source.lastCheck).toLocaleString()}` : 'Never checked'}
                    {source.lastError ? ` · ${source.lastError}` : ''}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                    <select className="select" value={source.channelId || ''} disabled={pending === `source:${source.id}`}
                      onChange={(event) => updateSource(source, { channelId: event.target.value })}>
                      <option value="">Default channel</option>
                      {textChannels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
                    </select>
                    <input key={`${source.id}:${source.roleId || ''}`} className="input" defaultValue={source.roleId || ''} disabled={pending === `source:${source.id}`}
                      placeholder="Role ID mention"
                      onBlur={(event) => {
                        if (event.target.value !== (source.roleId || '')) updateSource(source, { roleId: event.target.value });
                      }}
                      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}/>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  <Tag kind={source.lastStatus === 'error' ? 'error' : source.enabled ? 'success' : 'info'}>
                    {source.enabled ? (source.lastStatus || 'ok') : 'disabled'}
                  </Tag>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-sm btn-ghost" type="button" onClick={() => toggleSource(source)}>
                      {source.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button className="btn btn-sm btn-ghost" type="button" title="Remove source" onClick={() => deleteSourceFn(source)}>
                      <Icon name="trash" size={12}/>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Latest Patches</div>
            <Tag kind="info">{intervalLabel(settings?.checkIntervalMs)}</Tag>
          </div>
          {patchesLoading && <div style={{ color: 'var(--text-muted)' }}>Loading patches...</div>}
          {!patchesLoading && latest.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No patches recorded yet.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {latest.slice(0, 12).map((patch) => (
              <div key={patch.id} onClick={() => setSelectedPatchId(patch.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a href={patch.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text)', fontWeight: 700, textDecoration: 'none' }}>
                    {patch.title}
                  </a>
                  <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                    {patch.game} - {patch.publishedAt ? new Date(patch.publishedAt).toLocaleDateString() : 'date unknown'}
                  </div>
                </div>
                {patch.postedAt && <Tag kind="success">posted</Tag>}
                <button className="btn btn-sm btn-ghost" type="button" onClick={() => postPatch(patch)}>
                  <Icon name="send" size={12}/> Post
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Source modal */}
      {sourceFormOpen && (
        <div className="modal-backdrop" onClick={() => setSourceFormOpen(false)}>
          <form className="modal registry-modal" onSubmit={addSourceFn} onClick={(e) => e.stopPropagation()}>
            <h3>Add source</h3>
            <label className="registry-field">
              <span>Name</span>
              <input className="input" value={sourceForm.name} placeholder="Diablo IV" required autoFocus
                onChange={(e) => setSourceForm((f) => ({ ...f, name: e.target.value }))}/>
            </label>
            <label className="registry-field">
              <span>Game</span>
              <input className="input" value={sourceForm.game} placeholder="Diablo IV"
                onChange={(e) => setSourceForm((f) => ({ ...f, game: e.target.value }))}/>
            </label>
            <label className="registry-field">
              <span>URL</span>
              <input className="input" value={sourceForm.url} placeholder="https://news.blizzard.com/…" required
                onChange={(e) => setSourceForm((f) => ({ ...f, url: e.target.value }))}/>
            </label>
            <label className="registry-field">
              <span>Scraper mode</span>
              <select className="select" value={sourceForm.mode} onChange={(e) => setSourceForm((f) => ({ ...f, mode: e.target.value }))}>
                <option value="generic">Generic (auto-detect patch links)</option>
                <option value="league-tags">League of Legends</option>
                <option value="diablo-article">Diablo IV</option>
              </select>
            </label>
            <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: -4 }}>
              {sourceForm.mode === 'generic' && 'Finds any link whose text or URL contains "patch", "notes", "hotfix" or "update".'}
              {sourceForm.mode === 'league-tags' && 'Parses the League of Legends patch notes tag page.'}
              {sourceForm.mode === 'diablo-article' && 'Parses the Blizzard Diablo IV patch notes article page.'}
            </div>
            <div className="registry-form-actions">
              <button className="btn" type="button" onClick={() => setSourceFormOpen(false)}>Cancel</button>
              <button className="btn btn-primary" type="submit" disabled={savingSource}>
                <Icon name="plus" size={13}/> {savingSource ? 'Adding…' : 'Add source'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
