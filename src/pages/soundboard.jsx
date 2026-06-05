// Soundboard screen + tile
import React, { useState, useEffect, useMemo } from 'react';
import { Icon, Waveform, SearchField } from '../ui/components.jsx';

export const SoundboardScreen = ({ playSound, previewSound, currentSound, currentPreview, sounds, tileSize, targetChannel }) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('plays');

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    const visible = sounds.filter(s => !term || s.name.includes(term));
    const comparators = {
      plays: (a, b) => (b.plays || 0) - (a.plays || 0) || a.name.localeCompare(b.name),
      date: (a, b) => (b.addedMs || 0) - (a.addedMs || 0) || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return [...visible].sort(comparators[sortBy] || comparators.plays);
  }, [sounds, search, sortBy]);

  const targetName = targetChannel?.name || null;

  return (
    <div className="content-narrow">
      <div className="page-head media-page-head">
        <div>
          <div className="page-title">Soundboard</div>
          <div className="page-sub">
            {targetName
              ? <>Clicking a tile plays in <strong style={{ color: 'var(--text)' }}>{targetName}</strong>. Headphones icon = local preview only.</>
              : <>Join a voice channel or pick a target at the top right. Headphones previews locally only.</>}
          </div>
        </div>
        <div className="page-actions media-head-search">
          <SearchField value={search} placeholder="Search…" onChange={e => setSearch(e.target.value)}/>
        </div>
      </div>

      <div className="media-toolbar-row media-sort-row">
        {[
          { key: 'plays', label: 'plays' },
          { key: 'date', label: 'newest' },
          { key: 'name', label: 'name' },
        ].map(({ key, label }) => {
          const active = sortBy === key;
          return (
            <button
              key={key}
              type="button"
              className="btn btn-sm"
              onClick={() => setSortBy(key)}
              style={active ? { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'transparent' } : undefined}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className={'sound-grid size-' + tileSize}>
        {filtered.map(s => (
          <SoundTile key={s.id} sound={s}
                     playing={currentSound && currentSound.id === s.id}
                     previewing={currentPreview && currentPreview.id === s.id}
                     onPlay={() => playSound(s)}
                     onPreview={() => previewSound(s)}/>
        ))}
        {filtered.length === 0 && (
          <div className="empty" style={{ gridColumn: '1 / -1' }}>
            <div className="empty-icon">⚆</div>
            <div>No sounds match.</div>
          </div>
        )}
      </div>
    </div>
  );
};

const SoundTile = ({ sound, playing, previewing, onPlay, onPreview }) => {
  const [progress, setProgress] = useState(0);
  const active = playing || previewing;

  useEffect(() => {
    if (!active) { setProgress(0); return; }
    const [minutes, seconds] = sound.duration.split(':').map(Number);
    const dur = Math.max(1, (minutes || 0) * 60 + (seconds || 0));
    const start = performance.now();
    let raf;
    const tick = () => {
      const t = (performance.now() - start) / (dur * 1000);
      if (t >= 1) { setProgress(1); return; }
      setProgress(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, sound.duration]);

  return (
    <div className={'sound-tile' + (playing ? ' playing' : '') + (previewing ? ' previewing' : '')}
         onClick={onPlay}>
      <div className="sound-tile-head">
        <div>
          <div className="sound-name">{sound.name}</div>
          <div className="sound-meta">{sound.duration} · {sound.size}</div>
        </div>
        <div className="sound-tile-icons">
          <button className={previewing ? 'previewing' : ''}
                  onClick={(e) => { e.stopPropagation(); onPreview(); }}
                  title="Preview locally">
            <Icon name="headphones" size={13}/>
          </button>
        </div>
      </div>
      <Waveform sound={sound} progress={progress} bars={20}/>
      <div className="sound-tile-actions">
        <span className="sound-tag">{sound.plays} plays</span>
        <button className="sound-tile-cta"
                onClick={(e) => { e.stopPropagation(); onPlay(); }}
                title="Play in Discord voice channel">
          <Icon name="speaker" size={11}/> Play
        </button>
      </div>
    </div>
  );
};


export const page = {
  kind: 'soundboard',
  render: (c) => (
    <SoundboardScreen sounds={c.sounds} currentSound={c.currentSound} currentPreview={c.currentPreview}
      playSound={c.playSound} previewSound={c.previewSound}
      tileSize={c.tweaks.tileSize} targetChannel={c.resolveTarget(c.parentBot)}/>
  ),
};
