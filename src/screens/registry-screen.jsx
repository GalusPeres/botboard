import React, { useEffect, useMemo, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Icon, Tag, Toggle } from '../ui/components.jsx';
import * as API from '../lib/api.js';

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

export function BotRegistryScreen({ modules = [], onChanged, restartEnabled, onRestart, onStop, onStart }) {
  const [registry, setRegistry] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const load = async ({ showLoading = false } = {}) => {
    setError('');
    if (showLoading) setLoading(true);
    try {
      setRegistry(await API.bots.registry());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load({ showLoading: true }); }, []);

  const moduleById = useMemo(
    () => new Map((modules || []).map((module) => [module.id, module])),
    [modules],
  );

  const bots = useMemo(() => {
    const rows = registry?.bots || [];
    return rows.map((bot) => ({ ...bot, module: moduleById.get(bot.id) || null }));
  }, [moduleById, registry]);

  const handleDndEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIdx = bots.findIndex(b => b.id === active.id);
    const newIdx = bots.findIndex(b => b.id === over.id);
    const arr = arrayMove(bots, oldIdx, newIdx);
    const newOrder = arr.map(b => b.id);
    setRegistry(prev => prev ? { ...prev, bots: arr } : prev);
    try {
      await API.bots.reorderRegistryAll(newOrder);
      onChanged?.();
      setRegistry(await API.bots.registry());
    } catch (err) {
      setError(err.message);
      load();
    }
  };

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
        setNotice('Module saved.');
      } else {
        await API.bots.addRegistry(payload);
        setNotice('Module added.');
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

  const toggleEnabled = async (bot) => {
    setError('');
    setNotice('');
    const enabled = !bot.enabled;
    setRegistry((current) => current ? {
      ...current,
      bots: current.bots.map((entry) => entry.id === bot.id ? { ...entry, enabled } : entry),
    } : current);
    try {
      await API.bots.updateRegistry(bot.id, { enabled });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
      await load();
    }
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
          <div className="page-title">Modules</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" type="button" onClick={startAdd}>
            <Icon name="plus" size={13}/> Add module
          </button>
          <button className="btn" type="button" onClick={load} disabled={loading}>
            <Icon name="refresh" size={13}/> Refresh
          </button>
        </div>
      </div>

      {error && !formOpen && <div className="settings-notice registry-error" style={{ marginBottom: 18 }}>{error}</div>}
      {notice && <div className="settings-notice registry-notice" style={{ marginBottom: 18 }}>{notice}</div>}

      <div className="registry-subhead">
        <div className="card-title">Registered modules</div>
        <Tag kind="info">{bots.length} modules</Tag>
      </div>

      {loading && <div className="empty"><div>Loading modules...</div></div>}
      {!loading && bots.length === 0 && (
        <div className="empty">
          <div className="empty-icon">+</div>
          <div>No modules registered yet.</div>
        </div>
      )}
      {!loading && bots.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDndEnd}>
          <SortableContext items={bots.map(b => b.id)} strategy={verticalListSortingStrategy}>
            <div className="registry-list">
              {bots.map((bot) => (
                <SortableBot
                  key={bot.id}
                  bot={bot}
                  restartEnabled={restartEnabled}
                  onStop={onStop}
                  onRestart={onRestart}
                  onStart={onStart}
                  onEdit={() => startEdit(bot)}
                  onRemove={() => remove(bot)}
                  onToggleEnabled={() => toggleEnabled(bot)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {formOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeForm(); }}>
          <form className="modal registry-modal" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
            <h3>{editing ? 'Edit module' : 'Add module'}</h3>

            {error && <div className="settings-notice registry-error" style={{ marginBottom: 14 }}>{error}</div>}
            {notice && <div className="settings-notice registry-notice" style={{ marginBottom: 14 }}>{notice}</div>}

            <label className="registry-field">
              <span>Name</span>
              <input className="input" value={form.name}
                placeholder="My Module"
                required autoFocus
                onChange={(event) => setForm((value) => {
                  const name = event.target.value;
                  return { ...value, name, id: editing ? value.id : slugifyName(name) };
                })}/>
            </label>

            <label className="registry-field">
              <span>API URL (optional)</span>
              <input className="input" value={form.url}
                placeholder="http://localhost:3003"
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
                {saving ? 'Saving...' : editing ? 'Save changes' : 'Add module'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function SortableBot({ bot, restartEnabled, onStop, onRestart, onStart, onEdit, onRemove, onToggleEnabled }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: bot.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
  };

  function statusKind(module) {
    if (!module) return 'warn';
    return module.online ? 'success' : 'error';
  }
  function statusText(module) {
    if (!module) return 'not loaded';
    return module.online ? 'online' : module.status?.error || 'offline';
  }

  return (
    <div ref={setNodeRef} style={style} className="registry-row">
      <div className="registry-drag-handle" title="Drag to reorder" {...attributes} {...listeners}>
        <svg width="12" height="20" viewBox="0 0 10 16" fill="currentColor">
          <circle cx="2.5" cy="3" r="1.5"/><circle cx="7.5" cy="3" r="1.5"/>
          <circle cx="2.5" cy="8" r="1.5"/><circle cx="7.5" cy="8" r="1.5"/>
          <circle cx="2.5" cy="13" r="1.5"/><circle cx="7.5" cy="13" r="1.5"/>
        </svg>
      </div>
      <div className="registry-row-top">
        <div className="registry-row-mark">
          {bot.module?.manifest?.bot?.avatar
            ? <img src={bot.module.manifest.bot.avatar} alt=""/>
            : <Icon name={bot.module?.manifest?.icon || 'grid'} size={16}/>}
        </div>
        <div className="registry-row-info">
          <div className="registry-row-title">
            <span>{bot.module?.manifest?.displayName || bot.name || bot.id}</span>
            {!bot.enabled && <Tag kind="warn">hidden</Tag>}
            <Tag kind={statusKind(bot.module)}>{statusText(bot.module)}</Tag>
          </div>
          <div className="registry-row-url">{bot.url}</div>
        </div>
      </div>
      <div className="registry-row-actions">
        <button className={'btn btn-icon registry-action-button registry-visible-button' + (bot.enabled ? ' active' : '')}
          type="button" onClick={onToggleEnabled}
          title={bot.enabled ? 'Hide module' : 'Show module'}
          aria-label={bot.enabled ? 'Hide module' : 'Show module'}
          aria-pressed={bot.enabled}>
          <Icon name={bot.enabled ? 'eye' : 'eye-off'} size={15}/>
        </button>
        {restartEnabled && bot.module?.online && (
          <>
            {onStop && (
              <button className="btn btn-icon registry-action-button" type="button" onClick={() => onStop(bot.id)} title="Stop" aria-label="Stop">
                <Icon name="stop" size={14}/>
              </button>
            )}
            {onRestart && (
              <button className="btn btn-icon registry-action-button" type="button" onClick={() => onRestart(bot.id)} title="Restart" aria-label="Restart">
                <Icon name="refresh" size={14}/>
              </button>
            )}
          </>
        )}
        {restartEnabled && !bot.module?.online && onStart && (
          <button className="btn btn-icon btn-primary registry-action-button" type="button" onClick={() => onStart(bot.id)} title="Start" aria-label="Start">
            <Icon name="play" size={14}/>
          </button>
        )}
        <button className="btn btn-icon registry-action-button" type="button" onClick={onEdit} title="Edit" aria-label="Edit">
          <Icon name="edit" size={14}/>
        </button>
        {bot.registryBacked && (
          bot.envDefault
            ? <button className="btn btn-icon registry-action-button" type="button" onClick={onRemove} title="Reset" aria-label="Reset">
                <Icon name="refresh" size={14}/>
              </button>
            : <button className="btn btn-icon btn-danger registry-action-button" type="button" onClick={onRemove} title="Remove" aria-label="Remove">
                <Icon name="trash" size={14}/>
              </button>
        )}
      </div>
    </div>
  );
}
