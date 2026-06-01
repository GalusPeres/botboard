import React, { useState, useCallback, useEffect } from 'react';
import { Icon } from './components.jsx';
import { useFetch } from './hooks.js';
import * as API from './api.js';
import { relativeTime } from './format.js';

const PERMISSIONS = ['controlBot', 'restartBot', 'soundLibrary', 'settings', 'botModules', 'userManagement'];
const PERM_LABELS = {
  controlBot:     'Control',
  restartBot:     'Restart',
  soundLibrary:   'Library',
  settings:       'Settings',
  botModules:     'Bots',
  userManagement: 'Roles',
};

function Checkbox({ checked, disabled, onChange }) {
  return (
    <div onClick={() => !disabled && onChange()} style={{
      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
      border: '1.5px solid ' + (checked ? 'var(--accent)' : 'var(--border, #444)'),
      background: checked ? 'var(--accent)' : 'var(--surface-3, #2a2a2a)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      transition: 'background 0.1s, border-color 0.1s',
    }}>
      {checked && <Icon name="check" size={10} style={{ color: '#000', pointerEvents: 'none' }}/>}
    </div>
  );
}

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

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 640);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return mobile;
}

function RolesTable({ users, currentUserId, onToggle, busy }) {
  const isMobile = useIsMobile();
  if (users.length === 0) return (
    <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '12px 0' }}>None yet.</div>
  );

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users.map((user) => {
          const isLocked = user.isEnvAdmin || user.id === currentUserId;
          return (
            <div key={user.id} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <UserAvatar user={user} size={32}/>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {user.global_name || user.username}
                    {user.id === currentUserId && <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 6 }}>(you)</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>@{user.username}{user.lastSeen && <> · {relativeTime(new Date(user.lastSeen).getTime())}</>}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                {PERMISSIONS.map((key) => {
                  const checked = user.permissions?.[key] === true;
                  const isBusy = busy === user.id + key;
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                      onClick={() => !isLocked && !isBusy && onToggle(user, key)}>
                      <Checkbox checked={checked} disabled={isLocked || isBusy} onChange={() => {}}/>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{PERM_LABELS[key]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', borderRadius: 10 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(160px, 1fr) ' + PERMISSIONS.map(() => '88px').join(' '),
        minWidth: 580,
        borderRadius: 10, overflow: 'hidden',
        background: 'var(--surface-2)',
      }}>
        <div style={{ padding: '10px 0 10px 14px', fontSize: 10, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>User</div>
        {PERMISSIONS.map((key) => (
          <div key={key} style={{ padding: '10px 0', fontSize: 10, color: 'var(--text-dim)', fontWeight: 600, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {PERM_LABELS[key]}
          </div>
        ))}
        {users.map((user) => {
          const isLocked = user.isEnvAdmin || user.id === currentUserId;
          return (
            <div key={user.id} style={{ display: 'contents' }}>
              <div style={{ gridColumn: '1 / -1', height: 1, background: 'var(--border)', opacity: 0.5 }}/>
              <div style={{ paddingLeft: 14, paddingTop: 12, paddingBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <UserAvatar user={user} size={32}/>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {user.global_name || user.username}
                    {user.id === currentUserId && <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 400 }}>(you)</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                    @{user.username}
                    {user.lastSeen && <> · {relativeTime(new Date(user.lastSeen).getTime())}</>}
                    {!user.lastSeen && <> · not logged in yet</>}
                  </div>
                </div>
              </div>
              {PERMISSIONS.map((key) => {
                const checked = user.permissions?.[key] === true;
                const isBusy = busy === user.id + key;
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Checkbox checked={checked} disabled={isLocked || isBusy} onChange={() => onToggle(user, key)}/>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AdminScreen({ currentUserId }) {
  const { data: fetchedUsers, reload } = useFetch(() => API.users.list(), []);
  const [users, setUsers] = useState(null);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);

  const displayed = users ?? fetchedUsers ?? [];
  const admins = displayed.filter((u) => u.isEnvAdmin);
  const regularUsers = displayed.filter((u) => !u.isEnvAdmin);

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

  return (
    <div className="content-narrow">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Roles</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => { setUsers(null); reload(); }}>
          <Icon name="refresh" size={13}/> Refresh
        </button>
      </div>

      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Admin</div>
      <RolesTable users={admins} currentUserId={currentUserId} onToggle={togglePermission} busy={busy}/>

      <div style={{ marginBottom: 8, marginTop: 24, fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>User</div>
      <RolesTable users={regularUsers} currentUserId={currentUserId} onToggle={togglePermission} busy={busy}/>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
