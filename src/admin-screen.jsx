import React, { useState, useCallback } from 'react';
import { Icon } from './components.jsx';
import { useFetch } from './hooks.js';
import * as API from './api.js';
import { relativeTime } from './format.js';

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

export function AdminScreen({ currentUserId }) {
  const { data: fetchedUsers, reload } = useFetch(() => API.users.list(), []);
  const [users, setUsers] = useState(null);
  const [busy, setBusy] = useState(null); // userId currently being acted on
  const [toast, setToast] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);

  // Use local state when available (after mutations), fall back to fetched data.
  const displayed = users ?? fetchedUsers ?? [];

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const toggleAdmin = useCallback(async (user) => {
    setBusy(user.id);
    try {
      const updated = await API.users.setAdmin(user.id, !user.isAdmin);
      setUsers((prev) => (prev ?? fetchedUsers ?? []).map((u) => u.id === user.id ? { ...u, ...updated } : u));
      showToast(`${user.global_name || user.username} is now ${updated.isAdmin ? 'Admin' : 'User'}`);
    } catch (err) {
      showToast(err.message || 'Failed to update');
    } finally {
      setBusy(null);
    }
  }, [fetchedUsers]);

  const removeUser = useCallback(async (user) => {
    setConfirmRemove(null);
    setBusy(user.id);
    try {
      await API.users.remove(user.id);
      setUsers((prev) => (prev ?? fetchedUsers ?? []).filter((u) => u.id !== user.id));
      showToast(`${user.global_name || user.username} removed`);
    } catch (err) {
      showToast(err.message || 'Failed to remove');
    } finally {
      setBusy(null);
    }
  }, [fetchedUsers]);

  return (
    <div className="content-narrow">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>User Management</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-dim)', fontSize: 13 }}>
            Everyone who logs in via Discord appears here — you can then grant or revoke admin rights.
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { setUsers(null); reload(); }}>
          <Icon name="refresh" size={13}/> Refresh
        </button>
      </div>

      {displayed.length === 0 && (
        <div className="empty" style={{ padding: '48px 0' }}>
          <div>No users have logged in yet.</div>
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
                  {isYou && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>(you)</span>}
                  {user.isAdmin && <AdminBadge fixed={user.isAdminFixed}/>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                  @{user.username}
                  {user.lastSeen && <> · Last seen {relativeTime(new Date(user.lastSeen).getTime())}</>}
                </div>
              </div>

              {!user.isAdminFixed && !isYou && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    className={'btn btn-sm ' + (user.isAdmin ? 'btn-ghost' : '')}
                    onClick={() => toggleAdmin(user)}
                    disabled={isBusy}
                    title={user.isAdmin ? 'Remove admin rights' : 'Grant admin rights'}
                  >
                    <Icon name={user.isAdmin ? 'x' : 'check'} size={12}/>
                    {user.isAdmin ? 'Revoke Admin' : 'Make Admin'}
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => setConfirmRemove(user)}
                    disabled={isBusy}
                    title="Remove this user (they can log in again)"
                    style={{ color: 'var(--red, #f87171)' }}
                  >
                    <Icon name="x" size={12}/> Remove
                  </button>
                </div>
              )}

              {user.isAdminFixed && !isYou && (
                <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
                  Managed via ENV
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Remove confirmation */}
      {confirmRemove && (
        <div className="modal-backdrop" onClick={() => setConfirmRemove(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <span className="modal-title">Remove user?</span>
              <button className="btn-icon btn-ghost btn-sm" onClick={() => setConfirmRemove(null)}>
                <Icon name="x" size={14}/>
              </button>
            </div>
            <div style={{ padding: '0 20px 16px', color: 'var(--text-dim)', fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0' }}>
                <UserAvatar user={confirmRemove} size={28}/>
                <strong>{confirmRemove.global_name || confirmRemove.username}</strong>
              </div>
              This removes them from the user list. They can still log in again if they have access.
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmRemove(null)}>Cancel</button>
              <button className="btn btn-sm" style={{ background: 'var(--red, #f87171)', color: '#fff' }}
                onClick={() => removeUser(confirmRemove)}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
