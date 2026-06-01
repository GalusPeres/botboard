// Sidebar + topbar + mobile navigation. Bot identity per route ('sb', 'mb', 'gen')
// drives the accent stripe and crumb color.
import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './components.jsx';
import { dashboardBotName, moduleAvatar, moduleDisplayName } from './botIdentity.js';
import { useCloseOnOutside } from './hooks.js';

export const ROUTES = {
  overview:          { title: 'Overview',     group: 'gen' },
  'bot-modules':     { title: 'Bot Modules',  group: 'gen' },
  'admin':           { title: 'Roles',        group: 'gen' },
  'botboard-logs':   { title: 'Live Logs',    group: 'gen' },
  'sb/board':   { title: 'Soundboard',            group: 'sb',  parentBot: 'soundbot' },
  'sb/library': { title: 'Sound Library',         group: 'sb',  parentBot: 'soundbot' },
  'sb/stats':   { title: 'Statistics',            group: 'sb',  parentBot: 'soundbot' },
  'sb/logs':    { title: 'Live Logs',             group: 'sb',  parentBot: 'soundbot' },
  'sb/settings':{ title: 'Settings',              group: 'sb',  parentBot: 'soundbot' },
  'mb/player':  { title: 'Music Player',          group: 'mb',  parentBot: 'newibot' },
  'mb/stats':   { title: 'Statistics',            group: 'mb',  parentBot: 'newibot' },
  'mb/logs':    { title: 'Live Logs',             group: 'mb',  parentBot: 'newibot' },
  'mb/settings':{ title: 'Settings',              group: 'mb',  parentBot: 'newibot' },
};

const BOT_MODULES = [
  {
    key: 'soundbot', group: 'sb', icon: 'soundboard', fallbackName: 'Sound Bot',
    pages: [
      { id: 'sb/board', icon: 'soundboard', label: 'Soundboard', badge: 'sounds' },
      { id: 'sb/library', icon: 'library', label: 'Sound Library' },
      { id: 'sb/stats', icon: 'stats', label: 'Statistics' },
      { id: 'sb/logs', icon: 'logs', label: 'Live Logs' },
      { id: 'sb/settings', icon: 'settings', label: 'Settings' },
    ],
  },
  {
    key: 'newibot', group: 'mb', icon: 'music', fallbackName: 'Music Bot',
    pages: [
      { id: 'mb/player', icon: 'music', label: 'Music Player' },
      { id: 'mb/stats', icon: 'stats', label: 'Statistics' },
      { id: 'mb/logs', icon: 'logs', label: 'Live Logs' },
      { id: 'mb/settings', icon: 'settings', label: 'Settings' },
    ],
  },
];

const FIXED_MODULE_BY_ID = {
  sound: 'soundbot',
  music: 'newibot',
};

const FIXED_ID_BY_KEY = {
  soundbot: 'sound',
  newibot: 'music',
};

function supportedGenericPages(module) {
  const pages = module?.manifest?.pages || [];
  return pages.filter((page) => ['patch-watcher', 'stats', 'logs', 'settings'].includes(page.kind || page.id));
}

export function routeMeta(route, modules = []) {
  if (ROUTES[route]) return ROUTES[route];
  const match = String(route || '').match(/^bot\/([^/]+)\/([^/]+)$/);
  if (!match) return { title: 'Overview', group: 'gen' };
  const [, botId, pageId] = match;
  const module = modules.find((item) => item.id === botId);
  const page = module?.manifest?.pages?.find((item) => item.id === pageId);
  return {
    title: page?.label || pageId,
    group: 'mod',
    parentBot: botId,
    module,
    page,
  };
}

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

  useCloseOnOutside(wrapRef, open, () => setOpen(false));

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

export const Sidebar = ({ route, setRoute, server, servers, onChangeServer, user, soundsCount = 0, onLogout, botStatus, botInfo, modules = [], restartEnabled, onRestart, permissions = {} }) => {
  const displayName = user?.global_name || user?.username || 'Discord user';
  const userHandle = user?.username ? `@${user.username}` : '';
  const userInitial = displayName.charAt(0).toUpperCase();
  const moduleById = new Map((modules || []).map((item) => [item.id, item]));
  const extraModules = (modules || []).filter((module) => !FIXED_MODULE_BY_ID[module.id] && supportedGenericPages(module).length);
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try { return JSON.parse(localStorage.getItem('botboard:collapsed-groups') || '{}'); } catch { return {}; }
  });
  const setCollapsed = (updater) => {
    setCollapsedGroups((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { localStorage.setItem('botboard:collapsed-groups', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const toggleGroup = (key) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  useEffect(() => {
    const meta = routeMeta(route, modules);
    if (!meta.parentBot) return;
    setCollapsed((prev) => prev[meta.parentBot] ? { ...prev, [meta.parentBot]: false } : prev);
  }, [route]);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">B</div>
        <div className="brand-name">Botboard</div>
      </div>

      <ServerDropdown server={server} servers={servers} onChangeServer={onChangeServer}/>

      <div className="nav-section sidebar-general">
        <div className="nav-label">General</div>
        <NavItem id="overview" route={route} setRoute={setRoute} icon="home" label="Overview"/>
        {permissions.botModules && <NavItem id="bot-modules" route={route} setRoute={setRoute} icon="bot" label="Bots"/>}
        {permissions.userManagement && <NavItem id="admin" route={route} setRoute={setRoute} icon="users" label="Roles"/>}
        {permissions.userManagement && <NavItem id="botboard-logs" route={route} setRoute={setRoute} icon="logs" label="Live Logs"/>}
      </div>

      <div className="sidebar-bots-scroll">
        {BOT_MODULES.map((bot) => {
          const visiblePages = permissions.settings ? bot.pages : bot.pages.filter((page) => !page.id.endsWith('/settings'));
          return (
            <BotGroup
              key={bot.key}
              botKey={bot.key}
              groupCls={bot.group}
              botIcon={bot.icon}
              name={moduleDisplayName(moduleById.get(FIXED_ID_BY_KEY[bot.key]), dashboardBotName(bot.key, botInfo) || bot.fallbackName)}
              avatar={moduleAvatar(moduleById.get(FIXED_ID_BY_KEY[bot.key])) || botInfo?.[bot.key]?.avatar}
              status={botStatus[bot.key]}
              collapsed={!!collapsedGroups[bot.key]}
              onToggle={() => toggleGroup(bot.key)}
              restartEnabled={restartEnabled && !!permissions.restartBot}
              onRestart={() => onRestart(bot.key)}
            >
              {visiblePages.map((page) => (
                <NavItem key={page.id} id={page.id} route={route} setRoute={setRoute}
                  icon={page.icon} label={page.label}
                  badge={page.badge === 'sounds' ? soundsCount : undefined}/>
              ))}
            </BotGroup>
          );
        })}

        {extraModules.map((module) => {
          const visiblePages = permissions.settings
            ? supportedGenericPages(module)
            : supportedGenericPages(module).filter((page) => (page.kind || page.id) !== 'settings');
          if (visiblePages.length === 0) return null;
          return (
            <BotGroup
              key={module.id}
              botKey={module.id}
              groupCls="mod"
              botIcon={module.manifest?.icon || 'grid'}
              name={moduleDisplayName(module, module.id)}
              avatar={moduleAvatar(module)}
              status={module.online ? 'online' : 'offline'}
              collapsed={!!collapsedGroups[module.id]}
              onToggle={() => toggleGroup(module.id)}
              restartEnabled={restartEnabled && !!permissions.restartBot}
              onRestart={() => onRestart(module.id)}
            >
              {visiblePages.map((page) => (
                <NavItem key={page.id} id={`bot/${module.id}/${page.id}`} route={route} setRoute={setRoute}
                  icon={page.icon || 'grid'} label={page.label || page.id} group="mod"/>
              ))}
            </BotGroup>
          );
        })}
      </div>

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

export const NavItem = ({ id, route, setRoute, icon, label, badge, group }) => {
  const active = route === id;
  const cat = group || ROUTES[id]?.group || 'gen';
  return (
    <div className={'nav-item nav-' + cat + (active ? ' active' : '')}
         onClick={() => setRoute(id)}>
      <Icon name={icon} className="nav-icon"/>
      <span>{label}</span>
      {badge !== undefined && <span className="nav-badge">{badge}</span>}
    </div>
  );
};

export const BotGroup = ({ botKey, groupCls, botIcon, name, avatar, status, collapsed, onToggle, restartEnabled, onRestart, children }) => {
  const dotKind = status === 'online' ? 'on' : status === 'restarting' ? 'restarting' : 'off';
  return (
    <div className={'bot-group bot-group-' + groupCls + (collapsed ? ' collapsed' : '')}>
      <div className="bot-group-head" onClick={onToggle}>
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
        <button className="bot-collapse-btn"
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                title={collapsed ? 'Expand bot' : 'Collapse bot'}>
          <Icon name="chevron-down" size={12}/>
        </button>
        {restartEnabled && (
          <button className={'bot-restart-btn' + (status === 'restarting' ? ' spinning' : '')}
                  onClick={(e) => { e.stopPropagation(); onRestart(); }}
                  title={'Restart ' + name}
                  disabled={status === 'restarting'}>
            <Icon name="refresh" size={13}/>
          </button>
        )}
      </div>
      <div className="bot-group-nav" hidden={collapsed}>
        {children}
      </div>
    </div>
  );
};

export const Topbar = ({ route, server, voiceChannels = [], voiceTargets = {}, setVoiceTarget, userVoiceChannel, botVoiceChannelId = {}, voiceControls = {}, onOpenMenu, botInfo, modules = [] }) => {
  const meta = routeMeta(route, modules);
  const [chanOpen, setChanOpen] = useState(false);
  const channelRef = useRef(null);
  const sectionTitle = meta.module
    ? moduleDisplayName(meta.module, meta.parentBot)
    : meta.parentBot
      ? dashboardBotName(meta.parentBot, botInfo)
      : 'General';
  useCloseOnOutside(channelRef, chanOpen, () => setChanOpen(false));

  const botKey = meta.parentBot;
  const hasVoiceControls = !!(botKey && voiceControls[botKey]);
  const selection = botKey ? (voiceTargets[botKey] || 'auto') : 'auto';
  const isAuto = selection === 'auto';
  const pinned = isAuto ? null : voiceChannels.find((c) => c.id === selection);
  const connected = !!(botKey && botVoiceChannelId[botKey]);
  const chipLabel = isAuto
    ? (userVoiceChannel ? `Auto · ${userVoiceChannel.name}` : 'Auto · no channel')
    : (pinned?.name || 'Pick channel');

  return (
    <header className="topbar">
      <button className="mobile-menu-button" type="button" aria-label="Open navigation" onClick={onOpenMenu}>
        <Icon name="menu" size={20}/>
      </button>
      <span className="topbar-title">{sectionTitle}</span>

      <div className="topbar-spacer"/>

      {botKey && hasVoiceControls && (
      <div className="topbar-actions">
        <div className="topbar-voice-actions">
          <button className="btn btn-sm topbar-voice-btn" type="button" onClick={voiceControls[botKey]?.onJoin}>
            <Icon name="speaker" size={12}/> <span>Join</span>
          </button>
          <button className="btn btn-sm topbar-voice-btn" type="button" onClick={voiceControls[botKey]?.onStop}>
            <Icon name="stop" size={12}/> <span>Stop</span>
          </button>
          <button className="btn btn-sm topbar-voice-btn" type="button" onClick={voiceControls[botKey]?.onDisconnect}>
            <Icon name="x" size={12}/> <span>Disconnect</span>
          </button>
        </div>
        <div style={{ position: 'relative' }} className="voice-chip-bot" ref={channelRef}>
          <button className={'voice-chip' + (connected ? ' connected' : '')}
                  type="button"
                  onClick={() => setChanOpen(o => !o)}>
            <span className="voice-actor">Channel</span>
            <span className="voice-dot"/>
            <Icon name="speaker" size={13} style={{ color: connected ? 'var(--green)' : 'var(--text-muted)' }}/>
            <span>{chipLabel}</span>
            <Icon name="chevron-down" size={11} style={{ color: 'var(--text-dim)' }}/>
          </button>
          {chanOpen && (
            <div className="menu" style={{ top: '110%', right: 0, minWidth: 240 }}>
              <div style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Target channel for {sectionTitle}</div>
              <div className="menu-item"
                   onClick={() => { setVoiceTarget(botKey, 'auto'); setChanOpen(false); }}
                   style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="headphones" size={12} style={{ color: 'var(--text-dim)' }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>Where I am (Auto)</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{userVoiceChannel ? userVoiceChannel.name : "you're not in a channel"}</div>
                </div>
                {isAuto && <Icon name="check" size={12}/>}
              </div>
              {voiceChannels.length === 0 && (
                <div style={{ padding: '8px 10px', color: 'var(--text-dim)', fontSize: 12 }}>No voice channels found.</div>
              )}
              {voiceChannels.map(c => (
                <div key={c.id} className="menu-item"
                     onClick={() => { setVoiceTarget(botKey, c.id); setChanOpen(false); }}
                     style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name="speaker" size={12} style={{ color: 'var(--text-dim)' }}/>
                  <span style={{ flex: 1 }}>{c.name}</span>
                  {selection === c.id
                    ? <Icon name="check" size={12}/>
                    : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{c.users}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}
    </header>
  );
};

export const MobileMoreSheet = ({ onClose, route, setRoute, server, servers, onChangeServer, user, botStatus, botInfo, modules = [], soundsCount = 0, restartEnabled, onRestart, onLogout, permissions = {} }) => {
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
          modules={modules}
          restartEnabled={restartEnabled}
          onRestart={onRestart}
          permissions={permissions}
        />
      </div>
    </div>
  );
};
