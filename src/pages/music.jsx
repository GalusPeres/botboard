// Music player: full + compact, track search, sortable queue
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Icon, Tag, fmtDur, SearchField } from '../ui/components.jsx';
import { useCloseOnOutside } from '../lib/hooks.js';

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
      <SearchField
        type="text"
        value={query}
        placeholder="Search or URL..."
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => { if (event.key === 'Enter') submit(); }}/>
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
    <div className="player-wrap">
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

export const page = {
  kind: 'music-player',
  render: (c) => (
    <MusicScreen playerState={c.playerState} dispatch={c.dispatchPlayer} addTrack={c.addMusic} searchTracks={c.searchMusic}
      playerStyle={c.tweaks.playerStyle} playerError={c.playerError}/>
  ),
};
