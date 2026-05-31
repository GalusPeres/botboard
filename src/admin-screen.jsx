import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Icon } from './components.jsx';
import { useFetch } from './hooks.js';
import * as API from './api.js';
import { relativeTime } from './format.js';

const PERMISSIONS = ['controlBot', 'soundLibrary', 'settings', 'botModules', 'userManagement'];
const PERM_LABELS = {
  controlBot:     'Control Bot',
  soundLibrary:   'Sound Library',
  settings:       'Settings',
  botModules:     'Bot Modules',
  userManagement: 'User Mgmt',
};

function UserAvatar({ user, size = 36 }) {
  const initial = (user.global_name || user.username || '?').charAt(0).toUpperCase();
  if (user.avatar) {
    return <img src={user.avatar} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}/>;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--surface-3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.42, color: 'var(--text-dim)', flexShrink: 0,
    }}>{initial}</div>
  );
}

// Add User modal — server member list or manual ID.
function AddUserModal({ guildId, existingIds, onAdd, onClose }) {
  const [tab, setTab] = useState('server');
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
      API.users.guildMembers(guildId).then(setMembers).catch((err) => setMembersError(err.message)).finally(() => setLoadingMembers(false));
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
    try { await onAdd({ id: member.id, username: member.username, global_name: member.global_name, avatar: member.avatar }); }
    finally { setBusy(false); }
  };

  const addById = async () => {
    const id = manualId.trim();
    if (!id) return;
    setBusy(true);
    try { await onAdd({ id }); setManualId(''); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <span className="modal-title">Add User</span>
          <button className="btn-icon btn-ghost btn-sm" onClick={onClose}><Icon name="x" size={14}/></button>
        </div>
        <div style={{ display: 'flex', gap: 2, padding: '0 20px 12px', borderBottom: '1px solid var(--border)' }}>
          {[['server', 'Server Members'], ['id', 'By User ID']].map(([key, label]) => (
            <button key={key} className={'btn btn-sm ' + (tab === key ? '' : 'btn-ghost')} onClick={() => setTab(key)} style={{ flex: 1 }}>{label}</button>
          ))}
        </div>
        {tab === 'server' && (
          <>
            <div style={{ padding: '12px 20px 8px' }}>
              <input className="input" placeholder="Search members..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '100%' }}/>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px' }}>
              {loadingMembers && <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '16px 0' }}>Loading members...</div>}
              {membersError && <div style={{ color: 'var(--red, #f87171)', fontSize: 13, padding: '8px 0' }}>{membersError}</div>}
              {!loadingMembers && !membersError && filtered.length === 0 && (
                <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '16px 0' }}>{search ? 'No matches.' : 'All server members are already added.'}</div>
              )}
              {filtered.map((m) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <UserAvatar user={m} size={32}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{m.global_name || m.username}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>@{m.username}</div>
                  </div>
                  <button className="btn btn-sm" onClick={() => addMember(m)} disabled={busy}>Add</button>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === 'id' && (
          <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Enter a Discord User ID (right-click user → Copy User ID).</div>
            <input ref={inputRef} className="input" placeholder="e.g. 123456789012345678" value={manualId}
              onChange={(e) => setManualId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addById()}/>
            <button className="btn" onClick={addById} disabled={busy || !manualId.trim()}>Add User</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Table row for a single user.
function UserRow({ user, currentUserId, onToggle, busy }) {
  const isYou = user.id === currentUserId;
  const locked = user.isEnvAdmin;
  return (
    <div style={{ display: 'contents' }}>
      {/* User info cell */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', minWidth: 0 }}>
        <UserAvatar user={user} size={32}/>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            {user.global_name || user.username}
            {isYou && <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 400 }}>(you)</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            @{user.username}
            {user.lastSeen && <> · {relativeTime(new Date(user.lastSeen).getTime())}</>}
            {!user.lastSeen && <> · not logged in yet</>}
          </div>
        </div>
      </div>
      {/* One cell per permission */}
      {PERMISSIONS.map((key) => {
        const checked = user.permissions?.[key] === true;
        const isBusy = busy === user.id + key;
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 0' }}>
            {(locked || isYou) ? (
              <input type="checkbox" checked={checked} disabled style={{ accentColor: 'var(--accent)', width: 15, height: 15, opacity: locked ? 0.4 : 1 }}/>
            ) : (
              <input type="checkbox" checked={checked} disabled={isBusy}
                onChange={() => onToggle(user, key)}
                style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }}/>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Grid wrapper: user info column + 5 permission columns.
function RolesTable({ users, currentUserId, onToggle, busy }) {
  if (users.length === 0) return (
    <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '12px 0' }}>None yet.</div>
  );
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr ' + PERMISSIONS.map(() => '100px').join(' '),
      borderRadius: 10, overflow: 'hidden',
      background: 'var(--surface-2)',
    }}>
      {/* Header row */}
      <div style={{ padding: '8px 0 8px 12px', fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>User</div>
      {PERMISSIONS.map((key) => (
        <div key={key} style={{ padding: '8px 0', fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {PERM_LABELS[key]}
        </div>
      ))}
      {/* User rows */}
      {users.map((user, i) => (
        <div key={user.id} style={{ display: 'contents' }}>
          <div style={{
            gridColumn: '1 / -1', height: 1,
            background: i === 0 ? 'var(--border)' : 'var(--border)',
            opacity: 0.5,
          }}/>
          <div style={{ paddingLeft: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <UserAvatar user={user} size={30}/>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                {user.global_name || user.username}
                {user.id === currentUserId && <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 400 }}>(you)</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                @{user.username}
                {user.lastSeen && <> · {relativeTime(new Date(user.lastSeen).getTime())}</>}
                {!user.lastSeen && <> · not logged in yet</>}
              </div>
            </div>
          </div>
          {PERMISSIONS.map((key) => {
            const checked = user.permissions?.[key] === true;
            const isLocked = user.isEnvAdmin || user.id === currentUserId;
            const isBusy = busy === user.id + key;
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <input type="checkbox" checked={checked} disabled={isLocked || isBusy}
                  onChange={() => !isLocked && onToggle(user, key)}
                  style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: isLocked ? 'default' : 'pointer', opacity: isLocked ? 0.4 : 1 }}/>
              </div>
            );
          })}
        </div>
      ))}
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

  const admins = displayed.filter((u) => u.isEnvAdmin || u.permissions?.userManagement === true);
  const regularUsers = displayed.filter((u) => !u.isEnvAdmin && !u.permissions?.userManagement);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
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

      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Admin</div>
      <RolesTable users={admins} currentUserId={currentUserId} onToggle={togglePermission} busy={busy}/>

      <div style={{ marginBottom: 8, marginTop: 24, fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>User</div>
      <RolesTable users={regularUsers} currentUserId={currentUserId} onToggle={togglePermission} busy={busy}/>

      {showAddModal && (
        <AddUserModal guildId={server?.id} existingIds={existingIds} onAdd={async (u) => { await addUser(u); }} onClose={() => setShowAddModal(false)}/>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
