// Shared icons + UI primitives. Icons are minimal line/shape SVGs.
import React, { useMemo } from 'react';

export const Icon = ({ name, size = 16, className = '', style = {} }) => {
  const props = {
    width: size, height: size,
    viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.75,
    strokeLinecap: 'round', strokeLinejoin: 'round',
    className, style,
  };
  switch (name) {
    case 'home': return <svg {...props}><path d="M3 12 12 4l9 8"/><path d="M5 10v10h14V10"/></svg>;
    case 'soundboard': return <svg {...props}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
    case 'music': return <svg {...props}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>;
    case 'library': return <svg {...props}><path d="M4 5h16M4 12h16M4 19h10"/></svg>;
    case 'stats': return <svg {...props}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>;
    case 'settings': return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>;
    case 'logs': return <svg {...props}><polyline points="4 7 7 10 4 13"/><line x1="11" y1="13" x2="20" y2="13"/><line x1="4" y1="18" x2="20" y2="18"/></svg>;
    case 'play': return <svg {...props} strokeWidth="0" fill="currentColor"><path d="M6 4l14 8-14 8z"/></svg>;
    case 'pause': return <svg {...props} strokeWidth="0" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>;
    case 'skip': return <svg {...props} strokeWidth="0" fill="currentColor"><path d="M5 4l10 8-10 8z"/><rect x="16" y="4" width="3" height="16" rx="1"/></svg>;
    case 'prev': return <svg {...props} strokeWidth="0" fill="currentColor"><path d="M19 4l-10 8 10 8z"/><rect x="5" y="4" width="3" height="16" rx="1"/></svg>;
    case 'stop': return <svg {...props} strokeWidth="0" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="1.5"/></svg>;
    case 'shuffle': return <svg {...props}><polyline points="16 3 21 3 21 8"/><path d="M4 20l17-17"/><polyline points="21 16 21 21 16 21"/><path d="M15 15l6 6M4 4l5 5"/></svg>;
    case 'repeat': return <svg {...props}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>;
    case 'volume': return <svg {...props}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19" fill="currentColor" strokeWidth="0"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/></svg>;
    case 'volume-off': return <svg {...props}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19" fill="currentColor" strokeWidth="0"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>;
    case 'search': return <svg {...props}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
    case 'plus': return <svg {...props}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
    case 'upload': return <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
    case 'trash': return <svg {...props}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>;
    case 'edit': return <svg {...props}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>;
    case 'eye': return <svg {...props}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>;
    case 'eye-off': return <svg {...props}><path d="M3 3l18 18"/><path d="M10.6 6.2A11.8 11.8 0 0 1 12 6c6.5 0 10 6 10 6a17.2 17.2 0 0 1-3 3.7"/><path d="M6.6 6.7C3.6 8.5 2 12 2 12s3.5 6 10 6a10.8 10.8 0 0 0 4.1-.8"/><path d="M10.2 10.2a2.5 2.5 0 0 0 3.6 3.6"/></svg>;
    case 'star': return <svg {...props}><polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9"/></svg>;
    case 'star-fill': return <svg {...props} fill="currentColor"><polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9"/></svg>;
    case 'chevron-down': return <svg {...props}><polyline points="6 9 12 15 18 9"/></svg>;
    case 'chevron-up': return <svg {...props}><polyline points="6 15 12 9 18 15"/></svg>;
    case 'chevron-right': return <svg {...props}><polyline points="9 6 15 12 9 18"/></svg>;
    case 'menu': return <svg {...props}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
    case 'more': return <svg {...props}><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></svg>;
    case 'mic': return <svg {...props}><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 19v3"/></svg>;
    case 'headphones': return <svg {...props}><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 18a2 2 0 0 1-2 2h-1v-6h3zM3 18a2 2 0 0 0 2 2h1v-6H3z"/></svg>;
    case 'logout': return <svg {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
    case 'login': return <svg {...props}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>;
    case 'discord': return <svg {...props} viewBox="0 0 24 24" fill="currentColor" strokeWidth="0"><path d="M20 4.5a18.3 18.3 0 0 0-4.5-1.4l-.2.4a16.8 16.8 0 0 0-5.1 0l-.2-.4A18.3 18.3 0 0 0 5.5 4.5C2.5 9 1.8 13.3 2.1 17.5a18.5 18.5 0 0 0 5.6 2.8l.5-.8a12.5 12.5 0 0 1-2-.9l.5-.4a13 13 0 0 0 10.5 0l.5.4a12.4 12.4 0 0 1-2 .9l.5.8a18.4 18.4 0 0 0 5.6-2.8c.4-4.8-.7-9.1-3.3-13zM9 15.3c-1.1 0-2-1-2-2.3s.9-2.3 2-2.3 2 1 2 2.3-.9 2.3-2 2.3zm6 0c-1.1 0-2-1-2-2.3s.9-2.3 2-2.3 2 1 2 2.3-.9 2.3-2 2.3z"/></svg>;
    case 'check': return <svg {...props}><polyline points="20 6 9 17 4 12"/></svg>;
    case 'x': return <svg {...props}><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>;
    case 'refresh': return <svg {...props}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9A9 9 0 0 1 18 5.3L23 10M1 14l5 4.7A9 9 0 0 0 20.5 15"/></svg>;
    case 'download': return <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
    case 'send': return <svg {...props}><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9z"/></svg>;
    case 'speaker': return <svg {...props}><rect x="6" y="3" width="12" height="18" rx="2"/><circle cx="12" cy="14" r="3"/><circle cx="12" cy="7" r="0.5" fill="currentColor"/></svg>;
    case 'grid': return <svg {...props}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
    case 'users': return <svg {...props}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case 'bot': return <svg {...props}><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M8 9V6a4 4 0 0 1 8 0v3"/><circle cx="9" cy="14" r="1.5" fill="currentColor" strokeWidth="0"/><circle cx="15" cy="14" r="1.5" fill="currentColor" strokeWidth="0"/><line x1="9" y1="18" x2="15" y2="18"/></svg>;
    case 'list': return <svg {...props}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>;
    case 'queue': return <svg {...props}><line x1="3" y1="6" x2="13" y2="6"/><line x1="3" y1="12" x2="13" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/><polygon points="17 6 22 9 17 12" fill="currentColor" strokeWidth="0"/></svg>;
    case 'drag': return <svg {...props}><circle cx="9" cy="6" r="1" fill="currentColor"/><circle cx="15" cy="6" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="18" r="1" fill="currentColor"/><circle cx="15" cy="18" r="1" fill="currentColor"/></svg>;
    case 'lavalink': return <svg {...props}><path d="M3 3v18h18"/><path d="M21 9l-7 6-4-3-4 4"/></svg>;
    case 'server': return <svg {...props}><rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><line x1="6.5" y1="7.5" x2="6.51" y2="7.5"/><line x1="6.5" y1="16.5" x2="6.51" y2="16.5"/></svg>;
    case 'power': return <svg {...props}><path d="M12 2v9"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/></svg>;
    default: return <svg {...props}><circle cx="12" cy="12" r="9"/></svg>;
  }
};

function genWaveform(seed, bars = 24) {
  const out = [];
  let h = seed * 9301 + 49297;
  for (let i = 0; i < bars; i++) {
    h = (h * 9301 + 49297) % 233280;
    const v = (h / 233280);
    out.push(0.25 + v * 0.75);
  }
  return out;
}

export const Waveform = ({ sound, progress = 0, bars = 22 }) => {
  const seed = sound.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const heights = useMemo(() => genWaveform(seed, bars), [seed, bars]);
  return (
    <div className="waveform">
      {heights.map((h, i) => {
        const played = i / bars <= progress;
        return (
          <div
            key={i}
            className={'waveform-bar' + (played ? ' played' : '')}
            style={{ height: `${h * 100}%` }}
          />
        );
      })}
    </div>
  );
};

export const Tag = ({ children, kind = '' }) => <span className={'tag ' + kind}>{children}</span>;

export const Toggle = ({ on, onClick }) => (
  <div className={'toggle' + (on ? ' on' : '')} onClick={onClick} role="switch" aria-checked={on} />
);

export const LineChart = ({ data, height = 160, color = 'var(--accent)' }) => {
  const w = 600, pad = 16;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (data.length - 1);
  const points = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (height - pad * 2) * (1 - (v - min) / range);
    return [x, y];
  });
  const path = points.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ');
  const area = path + ` L${points[points.length - 1][0]},${height - pad} L${points[0][0]},${height - pad} Z`;
  return (
    <svg className="chart-svg" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((t, i) => (
        <line key={i} x1={pad} x2={w - pad} y1={pad + (height - pad * 2) * t} y2={pad + (height - pad * 2) * t}
              stroke="var(--border)" strokeDasharray="2 4" strokeWidth="1"/>
      ))}
      <path d={area} fill="url(#cg)"/>
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
      {points.map(([x, y], i) => (
        i === points.length - 1 ? <circle key={i} cx={x} cy={y} r="4" fill={color} stroke="var(--surface)" strokeWidth="2"/> : null
      ))}
    </svg>
  );
};

export const BarChart = ({ data, height = 160, color = 'var(--accent)' }) => {
  const w = 600, pad = 16;
  const max = Math.max(...data.map(d => d.value));
  const barW = (w - pad * 2) / data.length - 8;
  return (
    <svg className="chart-svg" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
      {data.map((d, i) => {
        const h = ((height - pad * 2 - 20) * d.value) / max;
        const x = pad + i * ((w - pad * 2) / data.length) + 4;
        const y = height - pad - 20 - h;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} fill={color} rx="3" opacity={0.4 + (d.value/max)*0.6}/>
            <text x={x + barW/2} y={height - pad - 6} fontSize="10" fill="var(--text-dim)"
                  textAnchor="middle" fontFamily="var(--font-mono)">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
};

export const fmtDur = (s) => {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
};

// Einheitliches Such-Feld (Lupe + Input). Einzige Quelle der Wahrheit für die
// Lupengröße (flexShrink) und den Bündel an Autocomplete-/Passwort-Manager-aus-
// Attributen, die sonst an jeder Call-Site kopiert wurden.
export const SearchField = ({
  value, onChange, placeholder = 'Search…',
  type = 'search', onFocus, onKeyDown, className = '', inputProps = {},
}) => (
  <div className={'lib-search' + (className ? ' ' + className : '')}>
    <Icon name="search" size={13} style={{ color: 'var(--text-dim)', flexShrink: 0 }}/>
    <input
      type={type}
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck="false"
      aria-autocomplete="none"
      data-lpignore="true"
      data-1p-ignore="true"
      data-bwignore="true"
      data-form-type="other"
      {...inputProps}
    />
  </div>
);

// Labeled settings/detail row (label + help + control).
export const Row = ({ label, help, children }) => (
  <div className="settings-row">
    <div className="settings-label-col">
      <div className="settings-label">{label}</div>
      {help && <div className="settings-help">{help}</div>}
    </div>
    <div className="settings-control">{children}</div>
  </div>
);
