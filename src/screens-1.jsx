// Login + Server-Auswahl + Overview screens
import React from 'react';
import { Icon } from './components.jsx';
import { dashboardBotName } from './botIdentity.js';

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

export const OverviewScreen = ({ openRoute, currentTrack, voiceJoined, channel, botStatus, botInfo, statusData, currentSound, sounds = [], soundsCount = 0, queueLength = 0, liveLogs = [], permissions = {} }) => {
  const totalPlays = sounds.reduce((sum, sound) => sum + (sound.plays || 0), 0);
  const topSounds = [...sounds].sort((a, b) => b.plays - a.plays).slice(0, 5);
  const mostPlays = topSounds[0]?.plays || 1;
  const soundLogs = liveLogs.filter((entry) => entry.src === 'sound').slice(-6).reverse();
  const musicLogs = liveLogs.filter((entry) => entry.src === 'music').slice(-6).reverse();

  return (
    <div className="content-narrow">
      <div className="page-head">
        <div>
          <div className="page-title">Overview</div>
        </div>
      </div>

      <div className="grid grid-2">
        <BotFocusCard
          color="sb"
          icon="soundboard"
          name={dashboardBotName('sound', botInfo)}
          avatar={botInfo?.sound?.avatar}
          status={botStatus?.sound || 'offline'}
          activity={currentSound ? `${currentSound.name}.mp3` : 'Idle'}
          activityMeta={currentSound ? `playing in ${voiceJoined ? channel.name : 'voice'}` : null}
          primary={{ label: 'Open Soundboard', icon: 'soundboard', onClick: () => openRoute('bot/sound/soundboard') }}
          secondary={[
            { label: 'Library', icon: 'library', onClick: () => openRoute('bot/sound/library') },
            ...(permissions.settings ? [{ label: 'Settings', icon: 'settings', onClick: () => openRoute('bot/sound/settings') }] : []),
          ]}
          stats={[
            { label: 'Sounds', value: soundsCount },
            { label: 'Recorded plays', value: totalPlays.toLocaleString() },
            { label: 'Status', value: botStatus?.sound || 'offline', kind: botStatus?.sound === 'online' ? 'success' : 'warn' },
          ]}
        />
        <BotFocusCard
          color="mb"
          icon="music"
          name={dashboardBotName('music', botInfo)}
          avatar={botInfo?.music?.avatar}
          status={botStatus?.music || 'offline'}
          activity={currentTrack ? currentTrack.title : 'Queue empty'}
          activityMeta={currentTrack ? `${currentTrack.artist} · ${currentTrack.source}` : null}
          primary={{ label: 'Open Music Player', icon: 'music', onClick: () => openRoute('bot/music/player') }}
          secondary={[
            ...(permissions.settings ? [{ label: 'Settings', icon: 'settings', onClick: () => openRoute('bot/music/settings') }] : []),
          ]}
          stats={[
            { label: 'Queue', value: queueLength },
            { label: 'Lavalink', value: statusData?.music?.lavalink?.connected ? 'connected' : 'offline', kind: statusData?.music?.lavalink?.connected ? 'success' : 'warn' },
            { label: 'Status', value: botStatus?.music || 'offline', kind: botStatus?.music === 'online' ? 'success' : 'warn' },
          ]}
        />
      </div>
    </div>
  );
};

const ActivityCard = ({ title, logs, openLabel, onOpen }) => (
  <div className="card">
    <div className="card-header">
      <div className="card-title">{title}</div>
      <button className="btn btn-ghost btn-sm" onClick={onOpen}>{openLabel} <Icon name="chevron-right" size={12}/></button>
    </div>
    <div className="activity-list">
      {logs.map((entry, i) => (
        <div key={i} className="activity-item">
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <span style={{ color: 'var(--text-muted)' }}>{entry.text}</span>
          </div>
          <span className="activity-time">{entry.time}</span>
        </div>
      ))}
      {logs.length === 0 && <div style={{ color: 'var(--text-muted)', padding: '10px 0' }}>No live events received in this dashboard session.</div>}
    </div>
  </div>
);

const BotFocusCard = ({ color, icon, name, avatar, status, activity, activityMeta, primary, secondary, stats }) => (
  <div className={'bot-focus-card focus-' + color}>
    <div className="bot-focus-head">
      <div className={'bot-mark ' + color} style={{ width: 38, height: 38, borderRadius: 9 }}>
        {avatar
          ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'cover' }}/>
          : <Icon name={icon} size={17}/>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>{name}</div>
        <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13 }}>
          <span className={'dot dot-' + (status === 'online' ? 'on' : status === 'restarting' ? 'restarting' : 'off')}/>
          <span>{status}</span>
        </div>
      </div>
    </div>
    <div className="bot-focus-now">
      <div className="bot-focus-now-label">Now</div>
      <div className="bot-focus-now-value">{activity}</div>
      {activityMeta && <div className="bot-focus-now-meta">{activityMeta}</div>}
    </div>
    <div className="bot-focus-stats">
      {stats.map(s => (
        <div key={s.label} className="bot-focus-stat">
          <div className="bot-focus-stat-label">{s.label}</div>
          <div className={'bot-focus-stat-value' + (s.kind ? ' kind-' + s.kind : '')}>{s.value}</div>
        </div>
      ))}
    </div>
    <div className="bot-focus-actions">
      <button className="btn btn-primary btn-sm" onClick={primary.onClick}>
        <Icon name={primary.icon} size={13}/> {primary.label}
      </button>
      {secondary.map(b => (
        <button key={b.label} className="btn btn-sm" onClick={b.onClick}>
          <Icon name={b.icon} size={13}/> {b.label}
        </button>
      ))}
    </div>
  </div>
);
