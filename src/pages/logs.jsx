// Live-Logs-Seite + Log-Level-Dropdown.
import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../ui/components.jsx';
import { useCloseOnOutside } from '../lib/hooks.js';

const LOG_LEVELS = [
  { value: 'all', label: 'All levels' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warnings' },
  { value: 'error', label: 'Errors' },
  { value: 'debug', label: 'Debug' },
];

const LevelDropdown = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useCloseOnOutside(ref, open, () => setOpen(false));
  const current = LOG_LEVELS.find((l) => l.value === value) || LOG_LEVELS[0];
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="btn" type="button" onClick={() => setOpen((o) => !o)}
        style={{ width: 150, justifyContent: 'space-between' }} aria-haspopup="menu" aria-expanded={open}>
        <span>{current.label}</span>
        <Icon name="chevron-down" size={13} style={{ color: 'var(--text-dim)' }}/>
      </button>
      {open && (
        <div className="menu" style={{ top: 'calc(100% + 6px)', right: 0, minWidth: 160 }} role="menu">
          {LOG_LEVELS.map((l) => (
            <div key={l.value} className="menu-item" role="menuitemradio" aria-checked={l.value === value}
              onClick={() => { onChange(l.value); setOpen(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1 }}>{l.label}</span>
              {l.value === value && <Icon name="check" size={12} style={{ color: 'var(--accent)' }}/>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const LogsScreen = ({ bot, botName, liveLogs, connection }) => {
  const [filter, setFilter] = useState('all');
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (paused) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [liveLogs, paused]);

  const botLogs = liveLogs.filter((line) => line.src === bot);
  const filtered = botLogs.filter((line) => filter === 'all' || line.level === filter);

  return (
    <div className="content-narrow">
      <div className="page-head">
        <div>
          <div className="page-title">Live Logs</div>
          <div className="page-sub">Streaming from this bot. <span className="dot" style={{ background: paused || connection?.state === 'error' ? 'var(--amber)' : 'var(--green)' }}/> {paused ? 'paused' : connection?.state || 'connecting'} - {botLogs.length} lines</div>
        </div>
        <div className="page-actions">
          <LevelDropdown value={filter} onChange={setFilter}/>
          <button className="btn" onClick={() => setPaused((value) => !value)}>
            {paused ? <><Icon name="play" size={13}/> Resume</> : <><Icon name="pause" size={13}/> Pause</>}
          </button>
        </div>
      </div>

      {connection?.message && <div className="settings-notice" style={{ marginBottom: 14 }}>{connection.message}</div>}
      <div className="logs" ref={scrollRef}>
        {filtered.map((line, index) => (
          <div key={index} className={'log-line src-' + line.src}>
            <span className="log-time">{line.time}</span>
            <span className={'log-level ' + line.level}>{line.level.toUpperCase()}</span>
            <span className="log-msg">
              {line.text}
            </span>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ color: 'var(--text-muted)', padding: 14 }}>No log events received yet.</div>}
      </div>
    </div>
  );
};


export const page = {
  kind: 'logs',
  render: (c) => (
    <LogsScreen bot={c.parentBot} botName={c.botName} liveLogs={c.liveLogs} connection={c.logConnection}/>
  ),
};
