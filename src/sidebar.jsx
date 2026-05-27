// Sidebar + topbar + mobile navigation. Bot identity per route ('sb', 'mb', 'gen')
// drives the accent stripe and crumb color.
import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './components.jsx';

export const ROUTES = {
  overview:     { title: 'Overview',              group: 'gen' },
  'sb/board':   { title: 'Soundboard',            group: 'sb',  parent: 'SoundBot' },
  'sb/library': { title: 'Sound Library',         group: 'sb',  parent: 'SoundBot' },
  'sb/stats':   { title: 'Statistics',            group: 'sb',  parent: 'SoundBot' },
  'sb/logs':    { title: 'Live Logs',             group: 'sb',  parent: 'SoundBot' },
  'sb/settings':{ title: 'SoundBot Settings',     group: 'sb',  parent: 'SoundBot' },
  'mb/player':  { title: 'Music Player',          group: 'mb',  parent: 'NewiMusicBot' },
  'mb/stats':   { title: 'Statistics',            group: 'mb',  parent: 'NewiMusicBot' },
  'mb/logs':    { title: 'Live Logs',             group: 'mb',  parent: 'NewiMusicBot' },
  'mb/settings':{ title: 'NewiMusicBot Settings', group: 'mb',  parent: 'NewiMusicBot' },
};

const BOT_MODULES = [
  {
    key: 'soundbot', group: 'sb', icon: 'soundboard', fallbackName: 'SoundBot',
    pages: [
      { id: 'sb/board', icon: 'soundboard', label: 'Soundboard', badge: 'sounds' },
      { id: 'sb/library', icon: 'library', label: 'Sound Library' },
      { id: 'sb/stats', icon: 'stats', label: 'Statistics' },
      { id: 'sb/logs', icon: 'logs', label: 'Live Logs' },
      { id: 'sb/settings', icon: 'settings', label: 'Settings' },
    ],
  },
  {
    key: 'newibot', group: 'mb', icon: 'music', fallbackName: 'NewiMusicBot',
    pages: [
      { id: 'mb/player', icon: 'music', label: 'Music Player' },
      { id: 'mb/stats', icon: 'stats', label: 'Statistics' },
      { id: 'mb/logs', icon: 'logs', label: 'Live Logs' },
      { id: 'mb/settings', icon: 'settings', label: 'Settings' },
    ],
  },
];

function guildInitials(name) {
  return (name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
function guildColor(id) {
  const h = (id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `oklch(0.65 0.18 ${h})`;
}

const ServerDropdown = ({ server, servers = [], onChangeServer }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const options = (servers.length ? servers : [server]).filter(Boolean);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className="server-selector-wrap" ref={wrapRef}>
      <button className="server-switcher server-selector" type="button" aria-label="Select server"
        aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((value) => !value)}>
        {server?.icon
          ? <img src={server.icon} alt="" className="server-icon" style={{ objectFit: 'cover' }}/>
          : <div className="server-icon" style={{ background: guildColor(server?.id) }}>{guildInitials(server?.name)}</div>}
        <div className="server-info">
          <div className="server-name">{server?.name || 'No server'}</div>
          <div className="server-meta">{server?.members ?? '?'} members</div>
        </div>
        <Icon name="chevron-down" size={12} style={{ color: 'var(--text-dim)' }}/>
      </button>
      {open && (
        <div className="server-menu" role="menu">
          {options.map((item) => (
            <button key={item.id} className={'server-menu-item' + (item.id === server?.id ? ' active' : '')}
              type="button" onClick={() => { setOpen(false); onChangeServer(item); }}>
              {item.icon
                ? <img src={item.icon} alt="" className="server-menu-icon"/>
                : <span className="server-menu-icon fallback" style={{ background: guildColor(item.id) }}>{guildInitials(item.name)}</span>}
              <span>{item.name}</span>
              {item.id === server?.id && <Icon name="check" size={12}/>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const Sidebar = ({ route, setRoute, server, servers, onChangeServer, user, soundsCount = 0, onLogout, botStatus, botInfo, restartEnabled, onRestart }) => {
  const displayName = user?.global_name || user?.username || 'Discord user';
  const userHandle = user?.username ? `@${user.username}` : '';
  const userInitial = displayName.charAt(0).toUpperCase();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">B</div>
        <div className="brand-name">Botboard</div>
      </div>

      <ServerDropdown server={server} servers={servers} onChangeServer={onChangeServer}/>

      <div className="nav-section">
        <div className="nav-label">General</div>
        <NavItem id="overview" route={route} setRoute={setRoute} icon="home" label="Overview"/>
      </div>

      {BOT_MODULES.map((bot) => (
        <BotGroup
          key={bot.key}
          botKey={bot.key}
          groupCls={bot.group}
          botIcon={bot.icon}
          name={botInfo?.[bot.key]?.tag || bot.fallbackName}
          avatar={botInfo?.[bot.key]?.avatar}
          status={botStatus[bot.key]}
          restartEnabled={restartEnabled}
          onRestart={() => onRestart(bot.key)}
        >
          {bot.pages.map((page) => (
            <NavItem key={page.id} id={page.id} route={route} setRoute={setRoute}
              icon={page.icon} label={page.label}
              badge={page.badge === 'sounds' ? soundsCount : undefined}/>
          ))}
        </BotGroup>
      ))}

      <div className="sidebar-spacer"/>

      <div className="sidebar-user">
        {user?.avatar
          ? <img src={user.avatar} alt="" className="user-avatar" style={{ objectFit: 'cover' }}/>
          : <div className="user-avatar">{userInitial}</div>}
        <div className="user-info">
          <div className="user-name">{displayName}</div>
          <div className="user-status">{userHandle}</div>
        </div>
        <button className="btn-icon btn-ghost btn-sm" onClick={onLogout} title="Logout">
          <Icon name="logout" size={14}/>
        </button>
      </div>
    </aside>
  );
};

export const NavItem = ({ id, route, setRoute, icon, label, badge }) => {
  const active = route === id;
  const cat = ROUTES[id]?.group || 'gen';
  return (
    <div className={'nav-item nav-' + cat + (active ? ' active' : '')}
         onClick={() => setRoute(id)}>
      <Icon name={icon} className="nav-icon"/>
      <span>{label}</span>
      {badge !== undefined && <span className="nav-badge">{badge}</span>}
    </div>
  );
};

export const BotGroup = ({ botKey, groupCls, botIcon, name, avatar, status, restartEnabled, onRestart, children }) => {
  const dotKind = status === 'online' ? 'on' : status === 'restarting' ? 'restarting' : 'off';
  return (
    <div className={'bot-group bot-group-' + groupCls}>
      <div className="bot-group-head">
        <div className={'bot-mark ' + groupCls}>
          {avatar
            ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'cover' }}/>
            : <Icon name={botIcon} size={13}/>}
        </div>
        <div className="bot-group-info">
          <div className="bot-group-name">{name}</div>
          <div className={'bot-group-status ' + dotKind}>
            <span className="dot"/>
            <span>{status}</span>
          </div>
        </div>
        {restartEnabled && (
          <button className={'bot-restart-btn' + (status === 'restarting' ? ' spinning' : '')}
                  onClick={(e) => { e.stopPropagation(); onRestart(); }}
                  title={'Restart ' + name}
                  disabled={status === 'restarting'}>
            <Icon name="refresh" size={13}/>
          </button>
        )}
      </div>
      <div className="bot-group-nav">
        {children}
      </div>
    </div>
  );
};

export const Topbar = ({ route, server, channel, setChannel, voiceJoined, setVoiceJoined, userChannel, setUserChannel, voiceChannels = [], onOpenMenu }) => {
  const meta = ROUTES[route] || { title: '—' };
  const [chanOpen, setChanOpen] = useState(false);

  return (
    <header className="topbar">
      <button className="mobile-menu-button" type="button" aria-label="Open navigation" onClick={onOpenMenu}>
        <Icon name="menu" size={20}/>
      </button>
      {meta.parent && (
        <>
          <span className={'topbar-crumb crumb-' + meta.group}>{meta.parent}</span>
          <Icon name="chevron-right" size={11} style={{ color: 'var(--text-dim)' }}/>
        </>
      )}
      <span className="topbar-title">{meta.title}</span>

      <div className="topbar-spacer"/>

      <div className="topbar-actions">
        <div style={{ position: 'relative' }} className="voice-chip-bot">
          <button className={'voice-chip' + (voiceJoined ? ' connected' : '')}
                  onClick={() => setChanOpen(o => !o)}>
            <span className="voice-actor">Channel</span>
            <span className="voice-dot"/>
            <Icon name="speaker" size={13} style={{ color: voiceJoined ? 'var(--green)' : 'var(--text-muted)' }}/>
            <span>{channel?.name || 'Pick channel'}</span>
            <Icon name="chevron-down" size={11} style={{ color: 'var(--text-dim)' }}/>
          </button>
          {chanOpen && (
            <div className="menu" style={{ top: '110%', right: 0, minWidth: 220 }}>
              <div style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Target Voice Channel</div>
              {voiceChannels.length === 0 && (
                <div style={{ padding: '8px 10px', color: 'var(--text-dim)', fontSize: 12 }}>No voice channels found.</div>
              )}
              {voiceChannels.map(c => (
                <div key={c.id} className="menu-item"
                     onClick={() => { setChannel(c); setUserChannel(c); setChanOpen(false); }}
                     style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name="speaker" size={12} style={{ color: 'var(--text-dim)' }}/>
                  <span style={{ flex: 1 }}>{c.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{c.users}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export const MobileMoreSheet = ({ onClose, route, setRoute, server, servers, onChangeServer, user, botStatus, botInfo, soundsCount = 0, restartEnabled, onRestart, onLogout }) => {
  const go = (nextRoute) => { setRoute(nextRoute); onClose(); };
  return (
    <div className="mobile-sidebar-backdrop" onClick={onClose}>
      <div className="mobile-sidebar-drawer" onClick={(event) => event.stopPropagation()}>
        <Sidebar
          route={route}
          setRoute={go}
          server={server}
          servers={servers}
          onChangeServer={onChangeServer}
          user={user}
          soundsCount={soundsCount}
          onLogout={onLogout}
          botStatus={botStatus}
          botInfo={botInfo}
          restartEnabled={restartEnabled}
          onRestart={onRestart}
        />
      </div>
    </div>
  );
};
