import React, { useEffect, useMemo, useState } from 'react';
import { Icon, Tag, Toggle } from './components.jsx';
import * as API from './api.js';

const EMPTY_FORM = {
  id: '',
  name: '',
  url: '',
  container: '',
  enabled: true,
};

function slugifyName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function normaliseForm(bot) {
  return {
    id: bot?.id || '',
    name: bot?.name || bot?.module?.manifest?.displayName || '',
    url: bot?.url || '',
    container: bot?.container || '',
    enabled: bot?.enabled !== false,
  };
}

function statusKind(module) {
  if (!module) return 'warn';
  return module.online ? 'success' : 'error';
}

function statusText(module) {
  if (!module) return 'not loaded';
  return module.online ? 'online' : module.status?.error || 'offline';
}

export function BotRegistryScreen({ onChanged, restartEnabled, onRestart, onStop, onStart }) {
  const [registry, setRegistry] = useState(null);
  const [modules, setModules] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setError('');
    setLoading(true);
    try {
      const [registryData, modulesData] = await Promise.all([
        API.bots.registry(),
        API.bots.modules().catch(() => []),
      ]);
      setRegistry(registryData);
      setModules(modulesData || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const moduleById = useMemo(
    () => new Map((modules || []).map((module) => [module.id, module])),
    [modules],
  );

  const bots = useMemo(() => {
    const rows = registry?.bots || [];
    return rows.map((bot) => ({ ...bot, module: moduleById.get(bot.id) || null }));
  }, [moduleById, registry]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const name = form.name.trim();
      const id = editing || form.id.trim() || slugifyName(name);
      if (!name || !id) {
        setError('Name is required.');
        return;
      }
      const payload = {
        id,
        name,
        url: form.url.trim(),
        container: form.container.trim(),
        enabled: !!form.enabled,
      };
      if (editing) {
        await API.bots.updateRegistry(editing, payload);
        setNotice('Bot saved.');
      } else {
        await API.bots.addRegistry(payload);
        setNotice('Bot added.');
      }
      setForm(EMPTY_FORM);
      setEditing(null);
      setFormOpen(false);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setNotice('');
    setFormOpen(true);
  };

  const startEdit = (bot) => {
    setEditing(bot.id);
    setForm(normaliseForm(bot));
    setError('');
    setNotice('');
    setFormOpen(true);
  };

  const closeForm = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setNotice('');
    setFormOpen(false);
  };

  const remove = async (bot) => {
    const display = bot.module?.manifest?.displayName || bot.name || 'this bot';
    const action = bot.envDefault ? `Reset ${display}?` : `Remove ${display} from Botboard?`;
    if (!window.confirm(action)) return;
    setError('');
    setNotice('');
    try {
      await API.bots.deleteRegistry(bot.id);
      setNotice(bot.envDefault ? 'Bot reset.' : 'Bot removed.');
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const testConnection = async () => {
    if (!form.url.trim()) {
      setError('API URL is required.');
      return;
    }
    setTesting(true);
    setError('');
    setNotice('');
    try {
      const result = await API.bots.testRegistry({ url: form.url.trim() });
      setNotice(`Connection OK: ${result.displayName}`);
      if (!form.name.trim() && result.displayName) {
        setForm((value) => ({ ...value, name: result.displayName, id: editing ? value.id : slugifyName(result.displayName) }));
      }
    } catch (err) {
      setError(`Connection failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="content-narrow registry-screen">
      <div className="page-head">
        <div>
          <div className="page-title">Bot Modules</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" type="button" onClick={startAdd}>
            <Icon name="plus" size={13}/> Add bot
          </button>
          <button className="btn" type="button" onClick={load} disabled={loading}>
            <Icon name="refresh" size={13}/> Refresh
          </button>
        </div>
      </div>

      {error && !formOpen && <div className="settings-notice registry-error" style={{ marginBottom: 18 }}>{error}</div>}
      {notice && <div className="settings-notice registry-notice" style={{ marginBottom: 18 }}>{notice}</div>}

      <div className="registry-subhead">
        <div className="card-title">Registered bots</div>
        <Tag kind="info">{bots.length} bots</Tag>
      </div>

      {loading && <div className="empty"><div>Loading bots...</div></div>}
      {!loading && bots.length === 0 && (
        <div className="empty">
          <div className="empty-icon">+</div>
          <div>No bots registered yet.</div>
        </div>
      )}
      {!loading && bots.length > 0 && (
        <div className="registry-list">
          {bots.map((bot) => (
            <div className="registry-row" key={bot.id}>
              <div className="registry-row-mark">
                {bot.module?.manifest?.bot?.avatar
                  ? <img src={bot.module.manifest.bot.avatar} alt=""/>
                  : <Icon name={bot.module?.manifest?.icon || 'grid'} size={16}/>}
              </div>
              <div className="registry-row-main">
                <div className="registry-row-title">
                  <span>{bot.module?.manifest?.displayName || bot.name || bot.id}</span>
                  {!bot.enabled && <Tag kind="warn">disabled</Tag>}
                  <Tag kind={statusKind(bot.module)}>{statusText(bot.module)}</Tag>
                </div>
                <div className="registry-row-url">{bot.url}</div>
                <div className="registry-row-tags">
                  {(bot.module?.manifest?.capabilities || []).slice(0, 7).map((capability) => (
                    <span key={capability}>{capability}</span>
                  ))}
                </div>
              </div>
              <div className="registry-row-actions">
                {restartEnabled && bot.module?.online && (
                  <>
                    {onStop && (
                      <button className="btn btn-sm" type="button" onClick={() => onStop(bot.id)} title="Stop">
                        <Icon name="stop" size={12}/>
                      </button>
                    )}
                    {onRestart && (
                      <button className="btn btn-sm" type="button" onClick={() => onRestart(bot.id)} title="Restart">
                        <Icon name="refresh" size={12}/>
                      </button>
                    )}
                  </>
                )}
                {restartEnabled && !bot.module?.online && onStart && (
                  <button className="btn btn-sm btn-primary" type="button" onClick={() => onStart(bot.id)} title="Start">
                    <Icon name="play" size={12}/>
                  </button>
                )}
                <button className="btn btn-sm" type="button" onClick={() => startEdit(bot)}>
                  <Icon name="edit" size={12}/> Edit
                </button>
                {bot.registryBacked && (
                  bot.envDefault
                    ? <button className="btn btn-sm" type="button" onClick={() => remove(bot)}>
                        <Icon name="refresh" size={12}/> Reset
                      </button>
                    : <button className="btn btn-sm btn-danger" type="button" onClick={() => remove(bot)}>
                        <Icon name="trash" size={12}/> Remove
                      </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <div className="modal-backdrop" onClick={closeForm}>
          <form className="modal registry-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
            <h3>{editing ? 'Edit bot' : 'Add bot'}</h3>

            {error && <div className="settings-notice registry-error" style={{ marginBottom: 14 }}>{error}</div>}
            {notice && <div className="settings-notice registry-notice" style={{ marginBottom: 14 }}>{notice}</div>}

            <label className="registry-field">
              <span>Name</span>
              <input className="input" value={form.name}
                placeholder="My Bot"
                required autoFocus
                onChange={(event) => setForm((value) => {
                  const name = event.target.value;
                  return { ...value, name, id: editing ? value.id : slugifyName(name) };
                })}/>
            </label>

            <label className="registry-field">
              <span>API URL</span>
              <input className="input" value={form.url}
                placeholder="http://localhost:3003"
                required
                onChange={(event) => setForm((value) => ({ ...value, url: event.target.value }))}/>
            </label>

            <label className="registry-field">
              <span>Container name</span>
              <input className="input" value={form.container}
                placeholder="container name"
                onChange={(event) => setForm((value) => ({ ...value, container: event.target.value }))}/>
            </label>

            <div className="registry-toggle-row">
              <div>
                <div className="registry-toggle-title">Enabled</div>
              </div>
              <Toggle on={form.enabled} onClick={() => setForm((value) => ({ ...value, enabled: !value.enabled }))}/>
            </div>

            <div className="registry-form-actions">
              <button className="btn" type="button" onClick={closeForm}>Cancel</button>
              <button className="btn" type="button" onClick={testConnection} disabled={testing || saving}>
                <Icon name="refresh" size={13}/>
                {testing ? 'Testing...' : 'Test connection'}
              </button>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                <Icon name={editing ? 'check' : 'plus'} size={13}/>
                {saving ? 'Saving...' : editing ? 'Save changes' : 'Add bot'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
