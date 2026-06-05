// Sidebar + topbar + mobile navigation.
// All bots come from the manifest API (modules prop) — nothing hardcoded.
// Route format for all bots: bot/:moduleId/:pageId
// Topbar always shows the BOT name; page screens show their own content title.
import React, { useRef, useState } from 'react';
import { Icon } from '../ui/components.jsx';
import { dashboardBotName, moduleAvatar, moduleDisplayName } from '../lib/botIdentity.js';
import { useCloseOnOutside } from '../lib/hooks.js';

// Only truly static routes (no bot association)
export const ROUTES = {
  overview:        { title: 'Overview',    group: 'gen' },
  'bot-modules':   { title: 'Modules',     group: 'manage' },
  'admin':         { title: 'Roles',       group: 'manage' },
  'botboard-logs': { title: 'Live Logs',   group: 'gen' },
  'manage-settings':   { title: 'Settings',   group: 'manage' },
};

// CSS accent class from manifest type
function groupCls(module) {
  const type = module?.manifest?.type;
  if (type === 'soundboard')   return 'sb';
  if (type === 'music-player') return 'mb';
  return 'mod';
}

// All pages from manifest are eligible
function modulePages(module) {
  return module?.manifest?.pages || [];
}

export function routeMeta(route, modules = []) {
  if (ROUTES[route]) return ROUTES[route];
  const match = String(route || '').match(/^bot\/([^/]+)\/([^/]+)$/);
  if (!match) return { title: 'Overview', group: 'gen' };
  const [, botId, pageId] = match;
  const module = modules.find((m) => m.id === botId);
  const page = module?.manifest?.pages?.find((p) => p.id === pageId);
  return {
    title: page?.label || pageId,
    group: groupCls(module),
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
        onClick={() => setOpen((v) => !v)}>
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

export const Sidebar = ({
  route, setRoute, server, servers, onChangeServer,
  user, soundsCount = null, onLogout,
  modules = [], restartEnabled, onRestart, onStop, onStart, permissions = {},
}) => {
  const displayName = user?.global_name || user?.username || 'Discord user';
  const userHandle = user?.username ? `@${user.username}` : '';
  const userInitial = displayName.charAt(0).toUpperCase();

  const serverBotIds = Array.isArray(server?.bots) ? new Set(server.bots) : null;
  const botVisibleOnServer = (id) => !serverBotIds || serverBotIds.has(id);
  const visibleModules = modules.filter((m) => botVisibleOnServer(m.id));

  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try { return JSON.parse(localStorage.getItem('botboard:collapsed-groups') || '{}'); } catch { return {}; }
  });
  const toggleGroup = (key) => setCollapsedGroups((prev) => {
    const next = { ...prev, [key]: !prev[key] };
    try { localStorage.setItem('botboard:collapsed-groups', JSON.stringify(next)); } catch {}
    return next;
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">B</div>
        <div className="brand-name">Botboard</div>
      </div>

      <ServerDropdown server={server} servers={servers} onChangeServer={onChangeServer}/>

      <SidebarSection name="General" fixed>
        <NavItem id="overview" route={route} setRoute={setRoute} icon="home" label="Overview"/>
        {permissions.userManagement && <NavItem id="botboard-logs" route={route} setRoute={setRoute} icon="logs" label="Live Logs"/>}
      </SidebarSection>

      <SidebarSeparator/>

      <div className="sidebar-bots-scroll">
        {visibleModules.map((module) => {
          const pages = permissions.settings
            ? modulePages(module)
            : modulePages(module).filter((p) => (p.kind || p.id) !== 'settings');
          if (pages.length === 0) return null;
          const cls = groupCls(module);
          return (
            <BotGroup
              key={module.id}
              botKey={module.id}
              groupCls={cls}
              botIcon={module.manifest?.icon || 'grid'}
              name={moduleDisplayName(module, module.id)}
              avatar={moduleAvatar(module)}
              status={module.online ? 'online' : 'offline'}
              collapsed={!!collapsedGroups[module.id]}
              onToggle={() => toggleGroup(module.id)}
              restartEnabled={restartEnabled && !!permissions.restartBot}
              onRestart={() => onRestart(module.id)}
              onStop={onStop} onStart={onStart}
            >
              {pages.map((page) => (
                <NavItem
                  key={page.id}
                  id={`bot/${module.id}/${page.id}`}
                  route={route}
                  setRoute={setRoute}
                  icon={page.icon || 'grid'}
                  label={page.label || page.id}
                  group={cls}
                  badge={page.kind === 'soundboard' ? soundsCount : undefined}
                />
              ))}
            </BotGroup>
          );
        })}
      </div>

      <SidebarSeparator/>

      {(permissions.botModules || permissions.userManagement) && (
        <SidebarSection
          name="Manage"
          fixed
          collapsed={!!collapsedGroups.__manage}
          onToggle={() => toggleGroup('__manage')}
        >
          {permissions.botModules && <NavItem id="bot-modules" route={route} setRoute={setRoute} icon="bot" label="Bots"/>}
          {permissions.userManagement && <NavItem id="admin" route={route} setRoute={setRoute} icon="users" label="Roles"/>}
          {permissions.userManagement && <NavItem id="manage-settings" route={route} setRoute={setRoute} icon="settings" label="Settings"/>}
        </SidebarSection>
      )}

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

const SidebarSeparator = () => <div className="sidebar-separator" aria-hidden="true"/>;

export const SidebarSection = ({ name, fixed = false, collapsed = false, onToggle, children }) => {
  const collapsible = typeof onToggle === 'function';
  const sectionKey = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <div className={'sidebar-section-group section-' + sectionKey + (fixed ? ' fixed' : '') + (collapsed ? ' collapsed' : '')}>
      <div
        className={'sidebar-section-head' + (collapsible ? ' collapsible' : '')}
        onClick={collapsible ? onToggle : undefined}
      >
        <div className="sidebar-section-name">{name}</div>
        {collapsible && (
          <button className="bot-collapse-btn" type="button"
                  onClick={(e) => { e.stopPropagation(); onToggle(); }}
                  title={collapsed ? `Expand ${name}` : `Collapse ${name}`}>
            <Icon name="chevron-down" size={12}/>
          </button>
        )}
      </div>
      <div className="sidebar-section-nav" hidden={collapsed}>
        {children}
      </div>
    </div>
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
      {badge != null && badge > 0 && <span className="nav-badge">{badge}</span>}
    </div>
  );
};

export const BotGroup = ({ botKey, groupCls, botIcon, name, avatar, status, collapsed, onToggle, restartEnabled, onRestart, onStop, onStart, children }) => {
  const dotKind = status === 'online' ? 'on' : status === 'restarting' ? 'restarting' : 'off';
  return (
    <div className={'bot-group bot-group-' + groupCls + (collapsed ? ' collapsed' : '')}>
      <div className="bot-group-head" onClick={onToggle}>
        <div className="bot-mark-wrap">
          <div className={'bot-mark ' + groupCls}>
            {avatar
              ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'cover' }}/>
              : <Icon name={botIcon} size={13}/>}
          </div>
          <span className={'bot-status-dot ' + dotKind}/>
        </div>
        <div className="bot-group-info">
          <div className="bot-group-name">{name}</div>
        </div>
        <button className="bot-collapse-btn" type="button"
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

export const Topbar = ({
  route, server, voiceChannels = [], voiceTargets = {}, setVoiceTarget,
  userVoiceChannel, botVoiceChannelId = {}, voiceControls = {},
  onOpenMenu, modules = [],
}) => {
  const meta = routeMeta(route, modules);
  const [chanOpen, setChanOpen] = useState(false);
  const channelRef = useRef(null);
  useCloseOnOutside(channelRef, chanOpen, () => setChanOpen(false));
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  const voiceMenuRef = useRef(null);
  useCloseOnOutside(voiceMenuRef, voiceMenuOpen, () => setVoiceMenuOpen(false));

  // Always show the BOT name in the topbar (page title lives in the content area)
  const sectionTitle = meta.module
    ? moduleDisplayName(meta.module, meta.parentBot)
    : meta.group === 'manage' ? 'Manage' : 'General';

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
      {botKey && hasVoiceControls && (<>
        {/* Desktop: volle Voice-Controls + Channel-Chip-Dropdown */}
        <div className="topbar-actions topbar-voice-full">
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
                    type="button" onClick={() => setChanOpen((o) => !o)}>
              <span className="voice-actor">Channel</span>
              <span className="voice-dot"/>
              <Icon name="speaker" size={13} style={{ color: connected ? 'var(--green)' : 'var(--text-muted)' }}/>
              <span>{chipLabel}</span>
              <Icon name="chevron-down" size={11} style={{ color: 'var(--text-dim)' }}/>
            </button>
            {chanOpen && (
              <div className="menu" style={{ top: '110%', right: 0, minWidth: 240 }}>
                <div style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Target channel for {sectionTitle}
                </div>
                <div className="menu-item" onClick={() => { setVoiceTarget(botKey, 'auto'); setChanOpen(false); }}
                     style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name="headphones" size={12} style={{ color: 'var(--text-dim)' }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>Where I am (Auto)</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      {userVoiceChannel ? userVoiceChannel.name : "you're not in a channel"}
                    </div>
                  </div>
                  {isAuto && <Icon name="check" size={12}/>}
                </div>
                {voiceChannels.length === 0 && (
                  <div style={{ padding: '8px 10px', color: 'var(--text-dim)', fontSize: 12 }}>No voice channels found.</div>
                )}
                {voiceChannels.map((c) => (
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

        {/* Mobile: kompakter Speaker-Button → Dropdown mit allem */}
        <div className="topbar-voice-compact" ref={voiceMenuRef}>
          <button className={'topbar-voice-compact-btn' + (connected ? ' connected' : '')}
                  type="button" onClick={() => setVoiceMenuOpen((o) => !o)}
                  title="Voice controls">
            <span className="voice-dot"/>
            <Icon name="speaker" size={16}/>
            <Icon name="chevron-down" size={11}/>
          </button>
          {voiceMenuOpen && (
            <div className="menu topbar-voice-compact-menu" style={{ top: '110%', right: 0, minWidth: 220 }}>
              <div style={{ padding: '6px 10px 4px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Voice · {sectionTitle}
              </div>
              <div className="menu-item" onClick={() => { voiceControls[botKey]?.onJoin(); setVoiceMenuOpen(false); }}
                   style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="speaker" size={13} style={{ color: 'var(--text-dim)' }}/>
                <span>Join</span>
              </div>
              <div className="menu-item" onClick={() => { voiceControls[botKey]?.onStop(); setVoiceMenuOpen(false); }}
                   style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="stop" size={13} style={{ color: 'var(--text-dim)' }}/>
                <span>Stop</span>
              </div>
              <div className="menu-item" onClick={() => { voiceControls[botKey]?.onDisconnect(); setVoiceMenuOpen(false); }}
                   style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="x" size={13} style={{ color: 'var(--text-dim)' }}/>
                <span>Disconnect</span>
              </div>
              <div style={{ margin: '4px 10px', borderTop: '1px solid var(--border)' }}/>
              <div style={{ padding: '4px 10px 4px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Channel
              </div>
              <div className="menu-item" onClick={() => setVoiceTarget(botKey, 'auto')}
                   style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="headphones" size={12} style={{ color: 'var(--text-dim)' }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>Auto</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    {userVoiceChannel ? userVoiceChannel.name : 'not in a channel'}
                  </div>
                </div>
                {isAuto && <Icon name="check" size={12}/>}
              </div>
              {voiceChannels.map((c) => (
                <div key={c.id} className="menu-item"
                     onClick={() => setVoiceTarget(botKey, c.id)}
                     style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name="speaker" size={12} style={{ color: 'var(--text-dim)', flexShrink: 0 }}/>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: selection === c.id ? 'var(--accent)' : 'var(--text-dim)', flexShrink: 0 }}>
                    {selection === c.id ? '✓' : (c.users ?? '')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </>)}
    </header>
  );
};

export const MobileMoreSheet = ({
  onClose, route, setRoute, server, servers, onChangeServer,
  user, modules = [], soundsCount = null, restartEnabled, onRestart, onStop, onStart, onLogout, permissions = {},
}) => {
  const go = (r) => { setRoute(r); onClose(); };
  return (
    <div className="mobile-sidebar-backdrop" onClick={onClose}>
      <div className="mobile-sidebar-drawer" onClick={(e) => e.stopPropagation()}>
        <button className="mobile-drawer-close" type="button" onClick={onClose} title="Schließen">
          <Icon name="x" size={16}/>
        </button>
        <Sidebar
          route={route} setRoute={go}
          server={server} servers={servers} onChangeServer={onChangeServer}
          user={user} soundsCount={soundsCount} onLogout={onLogout}
          modules={modules} restartEnabled={restartEnabled} onRestart={onRestart} onStop={onStop} onStart={onStart}
          permissions={permissions}
        />
      </div>
    </div>
  );
};
