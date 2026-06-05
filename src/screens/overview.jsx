// Overview / Dashboard.
import React from 'react';
import { Icon } from '../ui/components.jsx';
import { dashboardBotName } from '../lib/botIdentity.js';

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
