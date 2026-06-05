// Patch-Watcher-Seite + Discord-Embed-Vorschau-Helfer.
import React, { useState, useEffect } from 'react';
import { Icon, Tag, Row } from '../ui/components.jsx';
import { useFetch, usePoll } from '../lib/hooks.js';
import * as API from '../lib/api.js';

const DISCORD_EMBED_LIMITS = {
  title: 256,
  description: 4096,
  fieldName: 256,
  fieldValue: 1024,
  fields: 25,
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

function limitDiscordText(value, max) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function samePatchLabel(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

function buildDiscordEmbedPreview(patch, source) {
  if (!patch) return null;
  const game = patch.game || source?.game || '';
  const sourceName = patch.sourceName || source?.name || '';
  const fields = [
    game && { name: 'Game', value: game, inline: true },
    sourceName && !samePatchLabel(sourceName, game) && { name: 'Source', value: sourceName, inline: true },
  ].filter(Boolean).slice(0, DISCORD_EMBED_LIMITS.fields).map((field) => ({
    ...field,
    name: limitDiscordText(field.name, DISCORD_EMBED_LIMITS.fieldName),
    value: limitDiscordText(field.value, DISCORD_EMBED_LIMITS.fieldValue),
  }));
  return {
    title: limitDiscordText(patch.title, DISCORD_EMBED_LIMITS.title),
    url: patch.url,
    description: limitDiscordText(patchSummary(patch), DISCORD_EMBED_LIMITS.description),
    timestamp: patch.publishedAt || patch.discoveredAt || '',
    imageUrl: patch.imageUrl || source?.imageUrl || '',
    fields,
  };
}

function patchDateValue(patch) {
  return Date.parse(patch?.publishedAt || patch?.discoveredAt || 0) || 0;
}

function sortPatchesNewestFirst(a, b) {
  const dateDiff = patchDateValue(b) - patchDateValue(a);
  if (dateDiff) return dateDiff;
  return (Date.parse(b?.discoveredAt || 0) || 0) - (Date.parse(a?.discoveredAt || 0) || 0);
}

function formatDiscordTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const time = `${p(date.getHours())}:${p(date.getMinutes())}`;
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  if (sameDay) return `heute um ${time} Uhr`;
  return `${p(date.getDate())}.${p(date.getMonth() + 1)}.${date.getFullYear()} ${time}`;
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
  const [editingSource, setEditingSource] = useState(null); // null = add new, string id = edit existing
  const [savingSource, setSavingSource] = useState(false);
  const latest = [...(patches || [])].sort(sortPatchesNewestFirst);
  const sourceList = sources || [];
  const textChannels = guild?.textChannels || [];
  const selectedPatch = latest.find((patch) => patch.id === selectedPatchId) || latest[0] || null;
  const selectedSource = selectedPatch ? sourceList.find((source) => source.id === selectedPatch.sourceId) : null;
  const previewEmbed = buildDiscordEmbedPreview(selectedPatch, selectedSource);

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

  const openAddSource = () => { setEditingSource(null); setSourceForm(EMPTY_SOURCE_FORM); setSourceFormOpen(true); };
  const openEditSource = (source) => {
    setEditingSource(source.id);
    setSourceForm({ name: source.name || '', game: source.game || '', url: source.url || '', mode: source.mode || 'generic' });
    setSourceFormOpen(true);
  };

  const saveSourceFn = async (e) => {
    e.preventDefault();
    setSavingSource(true);
    try {
      if (editingSource) {
        await API.moduleApi.updateSource(botId, editingSource, {
          name: sourceForm.name, game: sourceForm.game, url: sourceForm.url, mode: sourceForm.mode,
        });
        setToast?.({ id: Date.now(), msg: `Source "${sourceForm.name}" updated` });
      } else {
        await API.moduleApi.addSource(botId, sourceForm);
        setToast?.({ id: Date.now(), msg: `Source "${sourceForm.name}" added` });
      }
      await reloadSources();
      setSourceFormOpen(false);
      setSourceForm(EMPTY_SOURCE_FORM);
      setEditingSource(null);
    } catch (err) {
      setToast?.({ id: Date.now(), msg: `${editingSource ? 'Update' : 'Add'} failed: ${err.message}` });
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

      <div className="grid grid-2 patchwatcher-grid">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Posting</div>
            {settings?.autoPost ? <Tag kind="success">auto on</Tag> : <Tag kind="info">manual</Tag>}
          </div>
          {settingsLoading && <div style={{ color: 'var(--text-muted)' }}>Loading posting settings...</div>}
          {settings && (
            <div className="patchwatcher-settings">
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
          {!previewEmbed && <div style={{ color: 'var(--text-muted)' }}>No patch selected yet.</div>}
          {previewEmbed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <select className="select" value={selectedPatch.id} onChange={(event) => setSelectedPatchId(event.target.value)}>
                {latest.slice(0, 20).map((patch) => <option key={patch.id} value={patch.id}>{patch.title}</option>)}
              </select>
              <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                Target: {manualChannelId ? `#${channelName(textChannels, manualChannelId)}` : 'source/default channel'}
              </div>
              <div className="discord-preview-stage">
                {postContent && (
                  <div className="discord-preview-content">
                    {postContent}
                  </div>
                )}
                <div className="discord-embed-preview">
                  <div className="discord-embed-accent" style={{ background: embedColor }}/>
                  <div className="discord-embed-body">
                    <a className="discord-embed-title" href={previewEmbed.url} target="_blank" rel="noreferrer">
                      {previewEmbed.title}
                    </a>
                    <div className="discord-embed-description">
                      {previewEmbed.description}
                    </div>
                    {previewEmbed.fields.length > 0 && (
                      <div className="discord-embed-fields">
                        {previewEmbed.fields.map((field) => (
                          <div className="discord-embed-field" key={field.name}>
                            <div className="discord-embed-field-name">{field.name}</div>
                            <div className="discord-embed-field-value">{field.value}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {previewEmbed.imageUrl && (
                      <img className="discord-embed-image" src={previewEmbed.imageUrl} alt=""/>
                    )}
                    {previewEmbed.timestamp && (
                      <div className="discord-embed-timestamp">
                        {formatDiscordTimestamp(previewEmbed.timestamp)}
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

      <div className="grid grid-2 patchwatcher-grid" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Sources</div>
            <button className="btn btn-sm btn-primary" type="button" onClick={openAddSource}>
              <Icon name="plus" size={12}/> Add
            </button>
          </div>
          {sourcesLoading && <div style={{ color: 'var(--text-muted)' }}>Loading sources...</div>}
          {!sourcesLoading && sourceList.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No sources yet. Add one above.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sourceList.map((source) => (
              <div key={source.id} className="patch-source-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700 }}>{source.name}</span>
                    <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{source.game}</span>
                  </div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 2 }}>
                    {source.lastCheck ? `Last check ${new Date(source.lastCheck).toLocaleString()}` : 'Never checked'}
                    {source.lastError ? ` · ${source.lastError}` : ''}
                  </div>
                  <div className="patch-source-controls">
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
                <div className="patch-source-actions">
                  <Tag kind={source.lastStatus === 'error' ? 'error' : source.enabled ? 'success' : 'info'}>
                    {source.enabled ? (source.lastStatus || 'ok') : 'disabled'}
                  </Tag>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-sm btn-ghost" type="button" onClick={() => toggleSource(source)}>
                      {source.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button className="btn btn-sm btn-ghost" type="button" title="Edit source" onClick={() => openEditSource(source)}>
                      <Icon name="edit" size={12}/>
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
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSourceFormOpen(false); }}>
          <form className="modal registry-modal" onSubmit={saveSourceFn} onMouseDown={(e) => e.stopPropagation()}>
            <h3>{editingSource ? 'Edit source' : 'Add source'}</h3>
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
            <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
              Paste any patch notes page URL — the bot detects the format automatically.
            </div>
            <div className="registry-form-actions">
              <button className="btn" type="button" onClick={() => setSourceFormOpen(false)}>Cancel</button>
              <button className="btn btn-primary" type="submit" disabled={savingSource}>
                <Icon name={editingSource ? 'check' : 'plus'} size={13}/>
                {savingSource ? (editingSource ? 'Saving…' : 'Adding…') : (editingSource ? 'Save changes' : 'Add source')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const page = {
  kind: 'patch-watcher',
  render: (c) => (
    <PatchWatcherScreen botId={c.parentBot} botName={c.botName} guildId={c.guildId} setToast={c.setToast}/>
  ),
};
