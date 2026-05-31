import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Icon } from './components.jsx';
import { useFetch } from './hooks.js';
import * as API from './api.js';
import { relativeTime } from './format.js';

const PERMISSION_LABELS = {
  controlBot:     'Control Bot',
  soundLibrary:   'Edit Sound Library',
  settings:       'Change Settings',
  botModules:     'Edit Bot Modules',
  userManagement: 'User Management',
};

function UserAvatar({ user, size = 36 }) {
  const initial = (user.global_name || user.username || '?').charAt(0).toUpperCase();
  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt=""
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--surface-3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.42, color: 'var(--text-dim)', flexShrink: 0,
    }}>
      {initial}
    </div>
  );
}

function AdminBadge({ fixed }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 99,
      background: fixed ? 'color-mix(in oklch, var(--accent) 18%, transparent)' : 'color-mix(in oklch, var(--green) 18%, transparent)',
      color: fixed ? 'var(--accent)' : 'var(--green)',
      fontSize: 11, fontWeight: 600,
    }}>
      {fixed ? <Icon name="settings" size={10}/> : <Icon name="check" size={10}/>}
      {fixed ? 'Admin (ENV)' : 'Admin'}
    </span>
  );
}

// Modal to add users — either from server member list or by entering a user ID.
function AddUserModal({ guildId, existingIds, onAdd, onClose }) {
  const [tab, setTab] = useState('server'); // 'server' | 'id'
  const [search, setSearch] = useState('');
  const [manualId, setManualId] = useState('');
  const [members, setMembers] = useState(null);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (tab === 'server' && guildId && members === null) {
      setLoadingMembers(true);
      setMembersError(null);
      API.users.guildMembers(guildId)
        .then(setMembers)
        .catch((err) => setMembersError(err.message))
        .finally(() => setLoadingMembers(false));
    }
  }, [tab, guildId, members]);

  useEffect(() => {
    if (tab === 'id') setTimeout(() => inputRef.current?.focus(), 50);
  }, [tab]);

  const filtered = (members || []).filter((m) => {
    if (existingIds.has(m.id)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (m.global_name || '').toLowerCase().includes(q) || m.username.toLowerCase().includes(q);
  });

  const addMember = async (member) => {
    setBusy(true);
    try {
      await onAdd({ id: member.id, username: member.username, global_name: member.global_name, avatar: member.avatar });
    } finally {
      setBusy(false);
    }
  };

  const addById = async () => {
    const id = manualId.trim();
    if (!id) return;
    setBusy(true);
    try {
      await onAdd({ id });
      setManualId('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <span className="modal-title">Add User</span>
          <button className="btn-icon btn-ghost btn-sm" onClick={onClose}><Icon name="x" size={14}/></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, padding: '0 20px 12px', borderBottom: '1px solid var(--border)' }}>
          {[['server', 'Server Members'], ['id', 'By User ID']].map(([key, label]) => (
            <button key={key} className={'btn btn-sm ' + (tab === key ? '' : 'btn-ghost')}
              onClick={() => setTab(key)} style={{ flex: 1 }}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'server' && (
          <>
            <div style={{ padding: '12px 20px 8px' }}>
              <input
                className="input"
                placeholder="Search members..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px' }}>
              {loadingMembers && <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '16px 0' }}>Loading members...</div>}
              {membersError && <div style={{ color: 'var(--red, #f87171)', fontSize: 13, padding: '8px 0' }}>{membersError}</div>}
              {!loadingMembers && !membersError && filtered.length === 0 && (
                <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '16px 0' }}>
                  {search ? 'No matches.' : 'All server members are already added.'}
                </div>
              )}
              {filtered.map((m) => (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <UserAvatar user={m} size={32}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{m.global_name || m.username}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>@{m.username}</div>
                  </div>
                  <button className="btn btn-sm" onClick={() => addMember(m)} disabled={busy}>
                    Add
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'id' && (
          <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              Enter a Discord User ID. Right-click any user in Discord → Copy User ID (enable Developer Mode first).
            </div>
            <input
              ref={inputRef}
              className="input"
              placeholder="e.g. 123456789012345678"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addById()}
            />
            <button className="btn" onClick={addById} disabled={busy || !manualId.trim()}>
              Add User
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminScreen({ currentUserId, server }) {
  const { data: fetchedUsers, reload } = useFetch(() => API.users.list(), []);
  const [users, setUsers] = useState(null);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const displayed = users ?? fetchedUsers ?? [];
  const existingIds = new Set(displayed.map((u) => u.id));

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const togglePermission = useCallback(async (user, permission) => {
    setBusy(user.id + permission);
    try {
      const updated = await API.users.setPermissions(user.id, { [permission]: !user.permissions[permission] });
      setUsers((prev) => (prev ?? fetchedUsers ?? []).map((u) => u.id === user.id ? { ...u, ...updated } : u));
    } catch (err) {
      showToast(err.message || 'Failed to update');
    } finally {
      setBusy(null);
    }
  }, [fetchedUsers]);

  const addUser = useCallback(async (userData) => {
    try {
      const added = await API.users.add(userData);
      setUsers((prev) => [...(prev ?? fetchedUsers ?? []).filter((u) => u.id !== added.id), added]);
      showToast(`${added.global_name || added.username || added.id} added`);
    } catch (err) {
      showToast(err.message || 'Failed to add user');
      throw err;
    }
  }, [fetchedUsers]);


  return (
    <div className="content-narrow">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Roles</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setUsers(null); reload(); }}>
            <Icon name="refresh" size={13}/> Refresh
          </button>
          <button className="btn btn-sm" onClick={() => setShowAddModal(true)}>
            <Icon name="check" size={13}/> Add User
          </button>
        </div>
      </div>

      {displayed.length === 0 && (
        <div className="empty" style={{ padding: '48px 0' }}>
          <div>No users yet. Click "Add User" to add someone.</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {displayed.map((user) => {
          const isYou = user.id === currentUserId;
          const isBusy = busy === user.id;
          return (
            <div key={user.id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: 'var(--surface-2)', borderRadius: 10,
              padding: '12px 16px',
              border: isYou ? '1px solid color-mix(in oklch, var(--accent) 30%, transparent)' : '1px solid transparent',
            }}>
              <UserAvatar user={user}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{user.global_name || user.username}</span>
                  {user.isEnvAdmin && <AdminBadge fixed={true}/>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                  {user.username && <>@{user.username}</>}
                  {user.lastSeen && <> · Last seen {relativeTime(new Date(user.lastSeen).getTime())}</>}
                  {!user.lastSeen && <> · Not logged in yet</>}
                </div>
              </div>

              {!isYou && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {Object.entries(PERMISSION_LABELS).map(([key, label]) => {
                    const checked = user.permissions?.[key] === true;
                    const disabled = user.isEnvAdmin || busy === user.id + key;
                    return (
                      <label key={key} style={{
                        display: 'flex', alignItems: 'center', gap: 5, cursor: disabled ? 'default' : 'pointer',
                        fontSize: 12, color: disabled ? 'var(--text-dim)' : 'var(--text)',
                        userSelect: 'none',
                      }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => !disabled && togglePermission(user, key)}
                          style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
              )}
              {isYou && <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>(you)</span>}
            </div>
          );
        })}
      </div>

      {showAddModal && (
        <AddUserModal
          guildId={server?.id}
          existingIds={existingIds}
          onAdd={async (userData) => { await addUser(userData); }}
          onClose={() => setShowAddModal(false)}
        />
      )}

{toast && <div className="toast">{toast}</div>}
    </div>
  );
}
