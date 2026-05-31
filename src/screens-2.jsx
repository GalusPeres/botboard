// Soundboard + Music Player + Library screens
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Icon, Waveform, Tag, fmtDur } from './components.jsx';
import { useCloseOnOutside } from './hooks.js';
import * as API from './api.js';

export const SoundboardScreen = ({ playSound, previewSound, currentSound, currentPreview, sounds, tileSize, targetChannel }) => {
  const [search, setSearch] = useState('');

  const filtered = sounds.filter(s => !search || s.name.includes(search.toLowerCase()));

  const targetName = targetChannel?.name || null;

  return (
    <div className="content-narrow">
      <div className="page-head">
        <div>
          <div className="page-title">Soundboard</div>
          <div className="page-sub">
            {targetName
              ? <>Clicking a tile plays in <strong style={{ color: 'var(--text)' }}>{targetName}</strong>. Headphones icon = local preview only.</>
              : <>Join a voice channel or pick a target at the top right. Headphones previews locally only.</>}
          </div>
        </div>
        <div className="page-actions">
          <div className="lib-search" style={{ width: 240, minWidth: 0 }}>
            <Icon name="search" size={13} style={{ color: 'var(--text-dim)' }}/>
            <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        <span className="btn btn-sm" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'transparent' }}>
          all
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>{sounds.length}</span>
        </span>
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
      <div className="lib-search" style={{ width: 260, minWidth: 0 }}>
        <Icon name="search" size={13} style={{ color: 'var(--text-dim)' }}/>
        <input value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => { if (event.key === 'Enter') submit(); }}
          placeholder="Search track or paste a URL…"/>
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
  const cur = queue[currentIdx];
  const [dur, durFmt] = useMemo(() => {
    if (!cur) return [0, '0:00'];
    const [m, s] = cur.duration.split(':').map(Number);
    return [m * 60 + s, cur.duration];
  }, [cur?.duration]);

  if (!cur) {
    return (
      <div className="content-narrow">
        <div className="page-head">
          <div>
            <div className="page-title">Music Player</div>
          </div>
          <div className="page-actions">
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
      <div className="page-head">
        <div>
          <div className="page-title">Music Player</div>
        </div>
        <div className="page-actions">
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
            <button className="btn-icon btn-ghost btn-sm" onClick={() => dispatch({ type: 'shuffle' })} title="Shuffle queue">
              <Icon name="shuffle" size={13}/>
            </button>
            <button className="btn-icon btn-ghost btn-sm" onClick={() => dispatch({ type: 'clear' })} title="Clear">
              <Icon name="trash" size={13}/>
            </button>
          </div>
        </div>
        <div className="queue-list">
          {queue.map((t, i) => (
            <div key={t.id} className={'queue-item' + (i === currentIdx ? ' current' : '')}
                 onClick={() => i > currentIdx && dispatch({ type: 'jump', idx: i - currentIdx - 1 })}>
              <div className="queue-num">
                {i === currentIdx ? (isPlaying ? <Icon name="play" size={11} style={{ color: 'var(--accent)' }}/> : <Icon name="pause" size={11} style={{ color: 'var(--accent)' }}/>) : i + 1}
              </div>
              <div className="queue-info">
                <div className="queue-title">{t.title}</div>
                <div className="queue-sub">
                  <span>{t.artist}</span><span>·</span><span>{t.duration}</span><span>·</span>
                  <Tag kind={t.source === 'Spotify' ? 'success' : 'info'}>{t.source}</Tag>
                </div>
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
                    <button className="btn-icon btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'remove', idx: i - currentIdx - 1 }); }} title="Remove">
                      <Icon name="x" size={12}/>
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
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
      <div className="page-head">
        <div>
          <div className="page-title">Music Player</div>
        </div>
        <div className="page-actions">
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

export const LibraryScreen = ({ sounds, addSound, deleteSound, renameSound, playSound, permissions = {} }) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('plays');
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [uploadName, setUploadName] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [showUpload, setShowUpload] = useState(false);

  const sorted = useMemo(() => {
    const filtered = sounds.filter(s => !search || s.name.includes(search.toLowerCase()));
    const cmp = {
      plays: (a, b) => b.plays - a.plays,
      name: (a, b) => a.name.localeCompare(b.name),
      added: (a, b) => parseInt(a.added) - parseInt(b.added),
      size: (a, b) => parseInt(b.size) - parseInt(a.size),
    }[sortBy];
    return filtered.sort(cmp);
  }, [sounds, search, sortBy]);

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

  return (
    <div className="content-narrow">
      <div className="page-head">
        <div>
          <div className="page-title">Sound Library</div>
          <div className="page-sub">Manage your MP3 files. Configured upload limits are enforced by the connected bot.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-sm" onClick={() => playSound && playSound(sorted[0])}>
            <Icon name="play" size={12}/> Test play
          </button>
          {permissions.soundLibrary && (
            <a className="btn btn-sm btn-ghost" href={API.sound.downloadAllUrl()} download="sounds.zip">
              <Icon name="download" size={13}/> Download All
            </a>
          )}
          {permissions.soundLibrary && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowUpload(true)}>
              <Icon name="upload" size={13}/> Upload
            </button>
          )}
        </div>
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

      <div className="lib-toolbar">
        <div className="lib-search">
          <Icon name="search" size={14} style={{ color: 'var(--text-dim)' }}/>
          <input placeholder="Filter sounds…" value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <select className="select" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ width: 160 }}>
          <option value="plays">Sort: Most plays</option>
          <option value="name">Sort: Name (a-z)</option>
          <option value="added">Sort: Newest</option>
          <option value="size">Sort: File size</option>
        </select>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 40 }}></th>
            <th>Filename</th>
            <th style={{ width: 80 }}>Length</th>
            <th style={{ width: 80 }}>Size</th>
            <th style={{ width: 80 }}>Plays</th>
            <th style={{ width: 80 }}>Added</th>
            <th style={{ width: 140 }} className="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(s => (
            <tr key={s.name}>
              <td>
                <button className="btn-icon btn-ghost btn-sm" onClick={() => playSound && playSound(s)} title="Play">
                  <Icon name="play" size={12} style={{ color: 'var(--accent)' }}/>
                </button>
              </td>
              <td>
                {editing === s.name ? (
                  <input className="input" autoFocus value={editVal}
                         onChange={e => setEditVal(e.target.value)}
                         onBlur={commitEdit}
                         onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null); }}
                         style={{ width: 160 }}/>
                ) : (
                  <span className="col-mono" style={{ fontWeight: 600 }}>{s.name}.mp3</span>
                )}
              </td>
              <td className="col-mono col-dim">{s.duration}</td>
              <td className="col-mono col-dim">{s.size}</td>
              <td className="col-mono">{s.plays}</td>
              <td className="col-mono col-dim">{s.added}</td>
              <td className="col-actions">
                <div style={{ display: 'inline-flex', gap: 4 }}>
                  {permissions.soundLibrary && (
                    <a className="btn-icon btn-ghost btn-sm" href={API.sound.downloadUrl(s.name)} download={`${s.name}.mp3`} title="Download">
                      <Icon name="download" size={12}/>
                    </a>
                  )}
                  {permissions.soundLibrary && (
                    <button className="btn-icon btn-ghost btn-sm" onClick={() => startEdit(s)} title="Rename">
                      <Icon name="edit" size={12}/>
                    </button>
                  )}
                  {permissions.soundLibrary && (
                    <button className="btn-icon btn-ghost btn-sm" onClick={() => deleteSound(s.name)} title="Delete">
                      <Icon name="trash" size={12} style={{ color: 'var(--red)' }}/>
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
