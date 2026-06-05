// Login + Server-Auswahl.
import React from 'react';
import { Icon } from '../ui/components.jsx';

function guildColor(id) {
  const h = (id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `oklch(0.65 0.18 ${h})`;
}
function guildInitials(name) {
  return (name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export const LoginScreen = ({ onLogin }) => (
  <div className="login-wrap">
    <div className="login-card">
      <div className="login-mark">B</div>
      <h1 className="login-title">Botboard</h1>
      <p className="login-sub">Dashboard for your Discord soundboard &amp; music bots</p>
      <button className="login-btn" onClick={onLogin}>
        <Icon name="discord" size={18}/>
        Continue with Discord
      </button>
      <div className="login-foot">
        Self-hosted dashboard for connected bot instances
      </div>
    </div>
  </div>
);

export const ServerSelectScreen = ({ servers = [], loading, error, onPick, onLogout }) => (
  <div className="login-wrap">
    <div style={{ width: '100%', maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div className="brand-mark" style={{ width: 32, height: 32 }}>B</div>
            <span className="brand-name" style={{ fontSize: 16 }}>Botboard</span>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Select a server</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>The bots are present on these servers. Pick one to manage.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>
          <Icon name="logout" size={13}/> Sign out
        </button>
      </div>
      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
      {error && <p style={{ color: 'var(--red)' }}>Failed to load servers: {error.message}</p>}
      {!loading && servers.length === 0 && !error && (
        <p style={{ color: 'var(--text-muted)' }}>Neither bot is in a server you share. Invite a bot or sign in with another account.</p>
      )}
      <div className="server-grid">
        {servers.map(s => (
          <div key={s.id} className="server-card" onClick={() => onPick(s)}>
            {s.icon
              ? <img src={s.icon} alt="" className="server-card-icon" style={{ objectFit: 'cover' }}/>
              : <div className="server-card-icon" style={{ background: guildColor(s.id) }}>{guildInitials(s.name)}</div>}
            <div className="server-card-info">
              <div className="server-card-name">{s.name}</div>
              <div className="server-card-meta">
                {s.members ?? '?'} members
                {s.bots?.length ? ` · ${s.bots.join(' + ')}` : ''}
              </div>
            </div>
            <Icon name="chevron-right" size={14} style={{ color: 'var(--text-dim)' }}/>
          </div>
        ))}
      </div>
    </div>
  </div>
);

