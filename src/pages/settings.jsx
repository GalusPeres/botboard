// Settings-Seiten: sound/music bespoke + generisch (schema-getrieben).
import React, { useState, useEffect, useRef } from 'react';
import { Icon, Tag, Row } from '../ui/components.jsx';
import { useFetch } from '../lib/hooks.js';
import * as API from '../lib/api.js';

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

const SettingsHeader = ({ title, subtitle, onReset, resetting, resetDisabled }) => (
  <div className="page-head">
    <div>
      <div className="page-title">{title}</div>
      <div className="page-sub">{subtitle}</div>
    </div>
    <div className="page-actions">
      {onReset && (
        <button className="btn btn-sm" type="button" onClick={onReset} disabled={resetting || resetDisabled}>
          <Icon name="refresh" size={13}/> {resetting ? 'Resetting...' : 'Reset page'}
        </button>
      )}
    </div>
  </div>
);

// Start/Stop/Restart als eigener Block oben in der Settings-Seite. Sichtbar nur
// mit passendem Recht (Restart bzw. Start/Stop). Greift für Bots UND Container.
const ServicesBlock = ({ botKey, botStatus, canRestart, canStartStop, onStart, onStop, onRestart }) => {
  if (!canRestart && !canStartStop) return null;
  const online = botStatus === 'online';
  return (
    <div className="settings-group">
      <div className="settings-group-head"><div className="settings-group-title">Services</div></div>
      <div style={{ display: 'flex', gap: 8, padding: '14px 20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Tag kind={online ? 'success' : 'error'}><span className="dot"/> {botStatus || 'offline'}</Tag>
        {canStartStop && !online && (
          <button className="btn btn-primary" type="button" onClick={() => onStart(botKey)}>
            <Icon name="play" size={15}/> Start
          </button>
        )}
        {canStartStop && online && (
          <button className="btn" type="button" onClick={() => onStop(botKey)}>
            <Icon name="stop" size={15}/> Stop
          </button>
        )}
        {canRestart && online && (
          <button className="btn" type="button" onClick={() => onRestart(botKey)}>
            <Icon name="refresh" size={15}/> Restart
          </button>
        )}
      </div>
    </div>
  );
};

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

export const SoundbotSettingsScreen = ({ settings, onSave, settingsLoaded, botStatus, botName = 'Sound Bot', canRestart, canStartStop, canConfig, onRestart, onStop, onStart }) => {
  const fields = ['sbPrefix', 'sbMaxMb', 'sbMaxName', 'sbAutoLeave'];
  const { draft, setField, pending, feedback, commit, reset } = useEditableSettings(settings, fields, onSave, settingsLoaded);

  return (
    <div className="content-narrow">
      <SettingsHeader title="Settings" subtitle={`Environment configuration for ${botName}.`}
        onReset={canConfig ? reset : null} resetting={pending === 'reset'} resetDisabled={!settingsLoaded}/>
      <ServicesBlock botKey="sound" botStatus={botStatus} canRestart={canRestart} canStartStop={canStartStop}
        onStart={onStart} onStop={onStop} onRestart={onRestart}/>
      {canConfig && (
        <>
          {feedback && <div className="settings-notice">{feedback}</div>}
          <div className="settings-group">
            <div className="settings-group-head"><div className="settings-group-title">Configuration</div></div>
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
        </>
      )}
    </div>
  );
};

export const NewibotSettingsScreen = ({ settings, onSave, settingsLoaded, botStatus, botName = 'Music Bot', canRestart, canStartStop, canConfig, onRestart, onStop, onStart }) => {
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
        onReset={canConfig ? reset : null} resetting={pending === 'reset'} resetDisabled={!settingsLoaded}/>
      <ServicesBlock botKey="music" botStatus={botStatus} canRestart={canRestart} canStartStop={canStartStop}
        onStart={onStart} onStop={onStop} onRestart={onRestart}/>
      {canConfig && (
      <>
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
      </>
      )}
    </div>
  );
};

export const GenericSettingsScreen = ({ botId, botName, setToast, botStatus, canRestart, canStartStop, canConfig, onRestart, onStop, onStart }) => {
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
        onReset={null} resetting={false} resetDisabled={true}/>
      <ServicesBlock botKey={botId} botStatus={botStatus} canRestart={canRestart} canStartStop={canStartStop}
        onStart={onStart} onStop={onStop} onRestart={onRestart}/>
      {canConfig && (
        <>
          {(schemaError || settingsError) && (
            <div className="settings-notice registry-error">Settings failed: {(schemaError || settingsError).message}</div>
          )}
          {!schema && !schemaError && <div className="empty" style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>}
          {schema?.sections?.length === 0 && (
            <div className="empty" style={{ color: 'var(--text-dim)', fontSize: 13 }}>No configuration available.</div>
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
        </>
      )}
    </div>
  );
};


export const page = {
  kind: 'settings',
  render: (c) => {
    // Rechte → was im Services-Block sichtbar ist (Restart / Start-Stop) und ob
    // der Configuration-Block gezeigt wird (Config). restartEnabled = Docker-Flag.
    const canRestart = c.restartEnabled && !!c.perms.restartBot;
    const canStartStop = c.restartEnabled && !!c.perms.startStop;
    const canConfig = !!c.perms.settings;
    if (c.parentBot === 'sound') {
      return (
        <SoundbotSettingsScreen settings={c.settings} onSave={(patch) => c.saveSettings('sound', patch)}
          settingsLoaded={!!c.soundSettings} botStatus={c.botStatus.sound} botName={c.botName}
          canRestart={canRestart} canStartStop={canStartStop} canConfig={canConfig}
          onRestart={(b) => c.setRestartConfirm(b)} onStop={c.stopBot} onStart={c.startBot}/>
      );
    }
    if (c.parentBot === 'music') {
      return (
        <NewibotSettingsScreen settings={c.settings} onSave={(patch) => c.saveSettings('music', patch)}
          settingsLoaded={!!c.musicSettings} botStatus={c.botStatus.music} botName={c.botName}
          canRestart={canRestart} canStartStop={canStartStop} canConfig={canConfig}
          onRestart={(b) => c.setRestartConfirm(b)} onStop={c.stopBot} onStart={c.startBot}/>
      );
    }
    return (
      <GenericSettingsScreen botId={c.parentBot} botName={c.botName} setToast={c.setToast}
        botStatus={c.botStatus[c.parentBot]}
        canRestart={canRestart} canStartStop={canStartStop} canConfig={canConfig}
        onRestart={() => c.setRestartConfirm(c.parentBot)} onStop={c.stopBot} onStart={c.startBot}/>
    );
  },
};
