// Soundboard + Music Player + Library screens
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Icon, Waveform, Tag, fmtDur } from './components.jsx';
import { useCloseOnOutside } from './hooks.js';
import * as API from './api.js';

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
          <div className="lib-search">
            <Icon name="search" size={13} style={{ color: 'var(--text-dim)' }}/>
            <input placeholder="Search…" value={search} autoComplete="off" onChange={e => setSearch(e.target.value)}/>
          </div>
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

const AddTrack = ({ addTrack, searchTracks }) => {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useCloseOnOutside(wrapRef, open, () => setOpen(false));

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2 || /^https?:\/\//.test(term)) {
      setResults([]);
      setSearchError('');
      return undefined;
    }
    const timeout = setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      try {
        setResults(await searchTracks(term));
      } catch (err) {
        setResults([]);
        setSearchError(err.message);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, searchTracks]);

  const selectTrack = async (track) => {
    setAdding(true);
    const added = await addTrack(track.uri || track.title);
    if (added) { setQuery(''); setResults([]); setOpen(false); }
    setAdding(false);
  };

  const submit = async () => {
    if (!query.trim() || adding) return;
    setAdding(true);
    const added = await addTrack(query.trim());
    if (added) { setQuery(''); setResults([]); setOpen(false); }
    setAdding(false);
  };

  const showPop = open && (searching || !!searchError || results.length > 0);

  return (
    <div className="track-search-inline" ref={wrapRef}>
      <div className="lib-search">
        <Icon name="search" size={13} style={{ color: 'var(--text-dim)' }}/>
        <input value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => { if (event.key === 'Enter') submit(); }}
          placeholder="Search track or paste a URL…" autoComplete="off"/>
      </div>
      {showPop && (
        <div className="track-results-pop">
          {searching && <div className="track-search-hint">Searching…</div>}
          {searchError && <div className="track-search-hint error">Search failed: {searchError}</div>}
          {results.map((track) => (
            <button key={track.id || track.uri} type="button" className="track-result" onClick={() => selectTrack(track)} disabled={adding}>
              <div className="track-result-cover">
                {track.artwork ? <img src={track.artwork} alt="" /> : <Icon name="music" size={15}/>}
              </div>
              <div className="track-result-info">
                <div className="track-result-title">{track.title}</div>
                <div className="track-result-sub">{track.author} · {fmtDur(Math.floor((track.duration || 0) / 1000))}</div>
              </div>
              <Icon name="plus" size={14}/>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const MusicScreen = ({ playerState, dispatch, addTrack, searchTracks, playerStyle, playerError }) => {
  const { queue, currentIdx, isPlaying, position, volume, shuffle, repeat } = playerState;
  const queueSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const serverFutureQueue = queue.slice(currentIdx + 1);

  // Optimistischer lokaler State — wird sofort gesetzt, vom Server überschrieben
  const [localFutureQueue, setLocalFutureQueue] = useState(null);
  // Wenn Server neue Daten liefert: lokalen Override zurücksetzen
  useEffect(() => { setLocalFutureQueue(null); }, [queue]);
  const futureQueue = localFutureQueue ?? serverFutureQueue;

  const handleQueueDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIdx = futureQueue.findIndex(t => t.id === active.id);
    const newIdx = futureQueue.findIndex(t => t.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    // Sofort lokal umsortieren — kein Warten auf Server
    setLocalFutureQueue(arrayMove(futureQueue, oldIdx, newIdx));
    // Dann Server-Call (async, im Hintergrund)
    dispatch({ type: 'move', from: oldIdx, to: newIdx });
  };
  const cur = queue[currentIdx];
  const [dur, durFmt] = useMemo(() => {
    if (!cur) return [0, '0:00'];
    const [m, s] = cur.duration.split(':').map(Number);
    return [m * 60 + s, cur.duration];
  }, [cur?.duration]);

  if (!cur) {
    return (
      <div className="content-narrow">
        <div className="page-head media-page-head">
          <div>
            <div className="page-title">Music Player</div>
          </div>
          <div className="page-actions media-head-search">
            <AddTrack addTrack={addTrack} searchTracks={searchTracks}/>
          </div>
        </div>
        {playerError && <div className="settings-notice registry-error" style={{ marginBottom: 16 }}>Player refresh failed: {playerError.message}</div>}
        <div className="empty" style={{ padding: 80 }}>
          <div className="empty-icon">♪</div>
          <div style={{ fontSize: 15, marginBottom: 8 }}>Queue is empty</div>
          <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>Search above or paste a supported URL.</div>
        </div>
      </div>
    );
  }

  const progress = dur ? position / dur : 0;

  if (playerStyle === 'compact') return <MusicCompact playerState={playerState} dispatch={dispatch} addTrack={addTrack} searchTracks={searchTracks} playerError={playerError}/>;

  return (
    <>
    <div className="content-narrow">
      <div className="page-head media-page-head">
        <div>
          <div className="page-title">Music Player</div>
        </div>
        <div className="page-actions media-head-search">
          <AddTrack addTrack={addTrack} searchTracks={searchTracks}/>
        </div>
      </div>
      {playerError && <div className="settings-notice registry-error" style={{ marginBottom: 16 }}>Player refresh failed: {playerError.message}</div>}
    </div>
    <div className="player">
      <div className="now-playing">
        <div className="cover-art">
          {cur.artwork ? <img src={cur.artwork} alt="" /> : <div className="cover-art-glyph">{cur.cover}</div>}
        </div>
        <div className="now-playing-meta">
          <div className="np-title">{cur.title}</div>
          <div className="np-artist">{cur.artist}</div>
          <div className="np-source">{cur.source}{cur.requestedBy ? ` · queued by ${cur.requestedBy}` : ''}</div>
        </div>
        <div className="progress">
          <div className="progress-bar" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const t = (e.clientX - rect.left) / rect.width;
            dispatch({ type: 'seek', pos: Math.max(0, Math.min(1, t)) * dur });
          }}>
            <div className="progress-fill" style={{ width: `${progress * 100}%` }}/>
          </div>
          <div className="progress-times">
            <span>{fmtDur(position)}</span>
            <span>{durFmt}</span>
          </div>
        </div>
        <div className="player-controls">
          <button className={'control-btn' + (shuffle ? ' active' : '')} onClick={() => dispatch({ type: 'shuffle' })} title="Shuffle">
            <Icon name="shuffle" size={16}/>
          </button>
          <button className="control-btn" onClick={() => dispatch({ type: 'prev' })} title="Previous">
            <Icon name="prev" size={18}/>
          </button>
          <button className="control-btn primary" onClick={() => dispatch({ type: 'toggle' })}>
            <Icon name={isPlaying ? 'pause' : 'play'} size={22}/>
          </button>
          <button className="control-btn" onClick={() => dispatch({ type: 'next' })} title="Next">
            <Icon name="skip" size={18}/>
          </button>
          <button className={'control-btn' + (repeat ? ' active' : '')} onClick={() => dispatch({ type: 'repeat' })} title="Repeat">
            <Icon name="repeat" size={16}/>
          </button>
        </div>
        <div className="volume-row">
          <button className="control-btn" onClick={() => dispatch({ type: 'volume', value: volume > 0 ? 0 : 40 })}>
            <Icon name={volume === 0 ? 'volume-off' : 'volume'} size={15}/>
          </button>
          <input className="slider" type="range" min="0" max="100" value={volume}
                 onChange={e => dispatch({ type: 'volume', value: Number(e.target.value) })}/>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', width: 30 }}>{volume}</span>
        </div>
      </div>

      <div className="queue-panel">
        <div className="card-header">
          <div>
            <div className="card-title">Queue</div>
            <div className="card-eyebrow" style={{ marginTop: 3 }}>{queue.length} tracks</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-icon btn-sm" onClick={() => dispatch({ type: 'shuffle' })} title="Shuffle queue">
              <Icon name="shuffle" size={13}/>
            </button>
            <button className="btn btn-icon btn-sm btn-danger" onClick={() => {
              if (window.confirm('Clear the entire queue?')) dispatch({ type: 'clear' });
            }} title="Clear queue">
              <Icon name="trash" size={13}/>
            </button>
          </div>
        </div>
        <div className="queue-list">
          {/* Aktueller Track — nicht verschiebbar */}
          {queue[currentIdx] && (
            <div className="queue-item current">
              <div className="queue-drag-handle queue-drag-handle-placeholder"/>
              <div className="queue-num">
                {isPlaying ? <Icon name="play" size={11} style={{ color: 'var(--accent)' }}/> : <Icon name="pause" size={11} style={{ color: 'var(--accent)' }}/>}
              </div>
              <div className="queue-info">
                <div className="queue-title">{queue[currentIdx].title}</div>
                <div className="queue-sub">
                  <span>{queue[currentIdx].artist}</span><span>·</span><span>{queue[currentIdx].duration}</span>
                </div>
              </div>
            </div>
          )}
          {/* Nächste Tracks — drag & drop */}
          <DndContext sensors={queueSensors} collisionDetection={closestCenter} onDragEnd={handleQueueDragEnd}>
            <SortableContext items={futureQueue.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {futureQueue.map((t, i) => (
                <SortableQueueItem
                  key={t.id}
                  track={t}
                  num={currentIdx + 2 + i}
                  onJump={() => dispatch({ type: 'jump', idx: i })}
                  onRemove={() => dispatch({ type: 'remove', idx: i })}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
    </>
  );
};

const MusicCompact = ({ playerState, dispatch, addTrack, searchTracks, playerError }) => {
  const { queue, currentIdx, isPlaying, position, volume, previous = [] } = playerState;
  const cur = queue[currentIdx];
  const [m, s] = cur.duration.split(':').map(Number);
  const dur = m * 60 + s;
  const progress = position / dur;
  return (
    <div className="content-narrow">
      <div className="page-head media-page-head">
        <div>
          <div className="page-title">Music Player</div>
        </div>
        <div className="page-actions media-head-search">
          <AddTrack addTrack={addTrack} searchTracks={searchTracks}/>
        </div>
      </div>
      {playerError && <div className="settings-notice registry-error" style={{ marginBottom: 16 }}>Player refresh failed: {playerError.message}</div>}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 60, height: 60, borderRadius: 10, background: 'var(--bg-deeper)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0, overflow: 'hidden' }}>
            {cur.artwork ? <img src={cur.artwork} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : cur.cover}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{cur.title}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{cur.artist} · {cur.source}</div>
            <div className="progress" style={{ marginTop: 8 }}>
              <div className="progress-bar" onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const t = (e.clientX - rect.left) / rect.width;
                dispatch({ type: 'seek', pos: Math.max(0, Math.min(1, t)) * dur });
              }}>
                <div className="progress-fill" style={{ width: `${progress * 100}%` }}/>
              </div>
              <div className="progress-times">
                <span>{fmtDur(position)}</span><span>{cur.duration}</span>
              </div>
            </div>
          </div>
          <div className="player-controls" style={{ gap: 8 }}>
            <button className="control-btn" onClick={() => dispatch({ type: 'prev' })}><Icon name="prev" size={16}/></button>
            <button className="control-btn primary" onClick={() => dispatch({ type: 'toggle' })}>
              <Icon name={isPlaying ? 'pause' : 'play'} size={20}/>
            </button>
            <button className="control-btn" onClick={() => dispatch({ type: 'next' })}><Icon name="skip" size={16}/></button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 140 }}>
            <Icon name="volume" size={14} style={{ color: 'var(--text-muted)' }}/>
            <input className="slider" type="range" min="0" max="100" value={volume}
                   onChange={e => dispatch({ type: 'volume', value: Number(e.target.value) })}/>
          </div>
        </div>
      </div>

      <div className="grid grid-21">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Queue · {queue.length} tracks</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn-icon btn-ghost btn-sm" onClick={() => dispatch({ type: 'shuffle' })}><Icon name="shuffle" size={13}/></button>
              <button className="btn-icon btn-ghost btn-sm" onClick={() => dispatch({ type: 'clear' })}><Icon name="trash" size={13}/></button>
            </div>
          </div>
          <div>
            {queue.map((t, i) => (
              <div key={t.id} className={'queue-item' + (i === currentIdx ? ' current' : '')}
                   onClick={() => i > currentIdx && dispatch({ type: 'jump', idx: i - currentIdx - 1 })}>
                <div className="queue-num">{i === currentIdx ? <Icon name="play" size={11} style={{ color: 'var(--accent)' }}/> : i + 1}</div>
                <div className="queue-info">
                  <div className="queue-title">{t.title} <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>— {t.artist}</span></div>
                  <div className="queue-sub"><Tag kind={t.source === 'Spotify' ? 'success' : 'info'}>{t.source}</Tag><span>{t.duration}</span></div>
                </div>
                <div className="queue-actions">
                  {i > currentIdx && (
                    <>
                      <button className="btn-icon btn-ghost btn-sm" disabled={i === currentIdx + 1}
                        onClick={(e) => { e.stopPropagation(); dispatch({ type: 'move', from: i - currentIdx - 1, to: i - currentIdx - 2 }); }} title="Move up">
                        <Icon name="chevron-up" size={12}/>
                      </button>
                      <button className="btn-icon btn-ghost btn-sm" disabled={i === queue.length - 1}
                        onClick={(e) => { e.stopPropagation(); dispatch({ type: 'move', from: i - currentIdx - 1, to: i - currentIdx }); }} title="Move down">
                        <Icon name="chevron-down" size={12}/>
                      </button>
                      <button className="btn-icon btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'remove', idx: i - currentIdx - 1 }); }} title="Remove"><Icon name="x" size={12}/></button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Recently played</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {previous.map((h, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 0' }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--bg-deeper)', flexShrink: 0 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>{h.artist} · {h.duration}</div>
                </div>
              </div>
            ))}
            {previous.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No recently played tracks reported.</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

function fmtDate(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function SortHeader({ col, label, sortBy, sortDir, onSort, style }) {
  const active = sortBy === col;
  return (
    <div onClick={() => onSort(col)} style={{
      padding: '10px 8px', fontSize: 10, fontWeight: 600,
      color: active ? 'var(--text)' : 'var(--text-dim)',
      textTransform: 'uppercase', letterSpacing: '0.07em',
      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
      userSelect: 'none', whiteSpace: 'nowrap', ...style,
    }}>
      {label}
      <span style={{ fontSize: 10, opacity: active ? 1 : 0 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
    </div>
  );
}

const ICON_BTN = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 26, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer',
  background: 'transparent', color: 'var(--text-dim)',
  transition: 'background 0.1s, color 0.1s',
};

export const LibraryScreen = ({ sounds, addSound, deleteSound, renameSound, previewSound, permissions = {} }) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('plays');
  const [sortDir, setSortDir] = useState('desc');
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [uploadName, setUploadName] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 640);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const handleSort = (col) => {
    // plays + added: immer nur desc, kein Toggle
    if (col === 'plays' || col === 'added') {
      setSortBy(col); setSortDir('desc'); return;
    }
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir(col === 'name' ? 'asc' : 'desc');
    }
  };

  const sorted = useMemo(() => {
    const filtered = sounds.filter(s => !search || s.name.includes(search.toLowerCase()));
    const mult = sortDir === 'asc' ? 1 : -1;
    const cmp = {
      plays:    (a, b) => mult * (a.plays - b.plays),
      name:     (a, b) => mult * a.name.localeCompare(b.name),
      added:    (a, b) => mult * ((a.addedMs || 0) - (b.addedMs || 0)),
      size:     (a, b) => mult * ((a.sizeBytes || 0) - (b.sizeBytes || 0)),
      duration: (a, b) => mult * ((a.durationSec || 0) - (b.durationSec || 0)),
    }[sortBy] || (() => 0);
    return [...filtered].sort(cmp);
  }, [sounds, search, sortBy, sortDir]);

  const startEdit = (s) => { setEditing(s.name); setEditVal(s.name); };
  const commitEdit = () => {
    if (editVal && editing) renameSound(editing, editVal.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10));
    setEditing(null);
  };
  const doUpload = async () => {
    if (!uploadFile) return;
    const name = uploadName ? uploadName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) : null;
    await addSound(uploadFile, name);
    setUploadName(''); setUploadFile(null); setShowUpload(false);
  };

  const gridCols = isMobile
    ? `32px minmax(100px,1fr) 52px ${permissions.soundLibrary ? '88px' : '32px'}`
    : `40px minmax(160px,1fr) 70px 72px 68px 84px ${permissions.soundLibrary ? '92px' : '36px'}`;

  return (
    <div className="content-narrow">
      <div className="page-head media-page-head">
        <div className="page-title">Sound Library</div>
        <div className="page-actions media-head-search">
          <div className="lib-search">
            <Icon name="search" size={13} style={{ color: 'var(--text-dim)', flexShrink: 0 }}/>
            <input placeholder="Filter…" value={search} autoComplete="off"
              onChange={e => setSearch(e.target.value)}/>
          </div>
        </div>
      </div>

      {permissions.soundLibrary && (
        <div className="media-toolbar-row media-action-row">
          <a className="btn btn-ghost" href={API.sound.downloadAllUrl()} download="sounds.zip">
            <Icon name="download" size={13}/> Download All
          </a>
          <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
            <Icon name="upload" size={13}/> Upload
          </button>
        </div>
      )}

      <div className="media-toolbar-row media-sort-row">
        {[
          { key: 'plays', label: 'plays', canToggle: false },
          { key: 'added', label: 'newest', canToggle: false },
          { key: 'name', label: 'name', canToggle: true },
          { key: 'duration', label: 'length', canToggle: true },
          { key: 'size', label: 'size', canToggle: true },
        ].map(({ key, label, canToggle }) => {
          const active = sortBy === key;
          const arrow = active && canToggle ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
          return (
            <button key={key} type="button" className="btn btn-sm"
              onClick={() => handleSort(key)}
              style={active ? { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'transparent' } : undefined}>
              {label}{arrow}
            </button>
          );
        })}
      </div>
      {showUpload && permissions.soundLibrary && (
        <div className="upload-zone" style={{ marginBottom: 16 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
            <Icon name="upload" size={18}/>
            <input type="file" accept="audio/mpeg,.mp3" onChange={e => setUploadFile(e.target.files?.[0] || null)}/>
            <input className="input" placeholder="custom name" value={uploadName} onChange={e => setUploadName(e.target.value)} style={{ width: 180 }}/>
            <button className="btn btn-sm btn-primary" onClick={doUpload} disabled={!uploadFile}>Upload</button>
            <button className="btn btn-sm btn-ghost" onClick={() => { setShowUpload(false); setUploadFile(null); }}>Cancel</button>
          </div>
          <div className="upload-hint">MP3 only - lowercase a-z and 0-9; configured bot limits apply</div>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteConfirm(null); }}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Sound löschen?</h3>
            <p><strong>{deleteConfirm}.mp3</strong> wird unwiderruflich gelöscht.</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setDeleteConfirm(null)}>Abbrechen</button>
              <button className="btn btn-danger" onClick={() => { deleteSound(deleteConfirm); setDeleteConfirm(null); }}>
                <Icon name="trash" size={13}/> Löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MOBILE: List ===== */}
      {isMobile && (() => {
        const extraVal = (s) => {
          switch (sortBy) {
            case 'plays':    return s.plays;
            case 'added':    return fmtDate(s.addedMs);
            case 'size':     return s.size;
            case 'duration': return s.duration;
            default:         return null;
          }
        };
        return (
          <>
            <div style={{ borderRadius: 10, overflow: 'hidden', background: 'var(--surface-2)' }}>
              {sorted.map((s, i) => {
                const extra = extraVal(s);
                return (
                  <div key={s.name}>
                    {i > 0 && <div style={{ height: 1, background: 'var(--border)', opacity: 0.4 }}/>}
                    <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr auto auto', alignItems: 'center', gap: 6, padding: '9px 10px 9px 0' }}>
                      <button className="btn btn-icon btn-ghost btn-sm" style={{ color: 'var(--accent)' }}
                        onClick={() => previewSound && previewSound(s)} title="Preview">
                        <Icon name="headphones" size={13}/>
                      </button>
                      <div style={{ minWidth: 0 }}>
                        {editing === s.name ? (
                          <input className="input" autoFocus value={editVal}
                            onChange={e => setEditVal(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null); }}/>
                        ) : (
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                            {s.name}.mp3
                          </span>
                        )}
                      </div>
                      {/* Immer rendern damit Buttons konsistent in Spalte 4 bleiben */}
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                        {extra ?? ''}
                      </span>
                      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        {permissions.soundLibrary && (
                          <a className="btn btn-icon btn-ghost btn-sm" style={{ textDecoration: 'none' }}
                            href={API.sound.downloadUrl(s.name)} download={`${s.name}.mp3`} title="Download">
                            <Icon name="download" size={12}/>
                          </a>
                        )}
                        {permissions.soundLibrary && (
                          <button className="btn btn-icon btn-ghost btn-sm" onClick={() => startEdit(s)} title="Rename">
                            <Icon name="edit" size={12}/>
                          </button>
                        )}
                        {permissions.soundLibrary && (
                          <button className="btn btn-icon btn-ghost btn-sm" style={{ color: 'var(--red)' }}
                            onClick={() => setDeleteConfirm(s.name)} title="Delete">
                            <Icon name="trash" size={12}/>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* ===== DESKTOP: volle Tabelle ===== */}
      {!isMobile && (
        <div style={{ overflowX: 'auto', borderRadius: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: gridCols, minWidth: 520, borderRadius: 10, overflow: 'hidden', background: 'var(--surface-2)' }}>
            <div/>
            <SortHeader col="name"     label="Filename" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ paddingLeft: 4 }}/>
            <SortHeader col="duration" label="Length"   sortBy={sortBy} sortDir={sortDir} onSort={handleSort}/>
            <SortHeader col="size"     label="Size"     sortBy={sortBy} sortDir={sortDir} onSort={handleSort}/>
            <SortHeader col="plays"    label="Plays"    sortBy={sortBy} sortDir={sortDir} onSort={handleSort}/>
            <SortHeader col="added"    label="Added"    sortBy={sortBy} sortDir={sortDir} onSort={handleSort}/>
            <div/>
            {sorted.map(s => (
              <div key={s.name} style={{ display: 'contents' }}>
                <div style={{ gridColumn: '1 / -1', height: 1, background: 'var(--border)', opacity: 0.5 }}/>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 0' }}>
                  <button className="btn btn-icon btn-ghost btn-sm" style={{ color: 'var(--accent)' }} onClick={() => previewSound && previewSound(s)} title="Preview">
                    <Icon name="headphones" size={13}/>
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 4px' }}>
                  {editing === s.name ? (
                    <input className="input" autoFocus value={editVal}
                      onChange={e => setEditVal(e.target.value)} onBlur={commitEdit}
                      onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null); }}
                      style={{ width: 150 }}/>
                  ) : (
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13 }}>{s.name}.mp3</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 8px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>{s.duration}</div>
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 8px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>{s.size}</div>
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 8px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{s.plays}</div>
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 8px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>{fmtDate(s.addedMs)}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2, padding: '10px 8px' }}>
                  {permissions.soundLibrary && (
                    <a className="btn btn-icon btn-ghost btn-sm" style={{ textDecoration: 'none' }} href={API.sound.downloadUrl(s.name)} download={`${s.name}.mp3`} title="Download">
                      <Icon name="download" size={12}/>
                    </a>
                  )}
                  {permissions.soundLibrary && (
                    <button className="btn btn-icon btn-ghost btn-sm" onClick={() => startEdit(s)} title="Rename">
                      <Icon name="edit" size={12}/>
                    </button>
                  )}
                  {permissions.soundLibrary && (
                    <button className="btn btn-icon btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => setDeleteConfirm(s.name)} title="Delete">
                      <Icon name="trash" size={12}/>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

function SortableQueueItem({ track, num, onJump, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id: track.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    // Kein transition — verhindert dass dnd-kit den Reset nochmal animiert
    opacity: isDragging ? 0.4 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="queue-item" onClick={onJump}>
      <div className="queue-drag-handle" title="Drag to reorder" {...attributes} {...listeners}
           onClick={(e) => e.stopPropagation()}>
        <svg width="8" height="13" viewBox="0 0 10 16" fill="currentColor">
          <circle cx="2.5" cy="3" r="1.5"/><circle cx="7.5" cy="3" r="1.5"/>
          <circle cx="2.5" cy="8" r="1.5"/><circle cx="7.5" cy="8" r="1.5"/>
          <circle cx="2.5" cy="13" r="1.5"/><circle cx="7.5" cy="13" r="1.5"/>
        </svg>
      </div>
      <div className="queue-num">{num}</div>
      <div className="queue-info">
        <div className="queue-title">{track.title}</div>
        <div className="queue-sub">
          <span>{track.artist}</span><span>·</span><span>{track.duration}</span><span>·</span>
          <Tag kind={track.source === 'Spotify' ? 'success' : 'info'}>{track.source}</Tag>
        </div>
      </div>
      <button className="btn btn-icon btn-sm queue-remove-btn"
              onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove">
        <Icon name="x" size={12}/>
      </button>
    </div>
  );
}
