// Sound library: sortable table (desktop) + compact list (mobile)
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Icon, SearchField } from '../ui/components.jsx';
import * as API from '../lib/api.js';

function fmtDate(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function SortHeader({ col, label, sortBy, sortDir, onSort, style }) {
  const active = sortBy === col;
  return (
    <div onClick={() => onSort(col)} style={{
      padding: '10px 12px',
      fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700,
      color: active ? 'var(--text)' : 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.06em',
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

const LIBRARY_COMPACT_WIDTH = 600;
const initialLibraryCompact = () => typeof window !== 'undefined' && window.innerWidth <= 1300;

export const LibraryScreen = ({ sounds, addSound, deleteSound, renameSound, previewSound, permissions = {} }) => {
  const libraryRef = useRef(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('plays');
  const [sortDir, setSortDir] = useState('desc');
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [uploadName, setUploadName] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isMobile, setIsMobile] = useState(initialLibraryCompact);
  useEffect(() => {
    const measure = () => {
      const width = libraryRef.current?.getBoundingClientRect().width || window.innerWidth;
      setIsMobile(width < LIBRARY_COMPACT_WIDTH);
    };
    measure();
    const node = libraryRef.current;
    const observer = node && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (node && observer) observer.observe(node);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
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
    <div ref={libraryRef} className={`content-narrow library-screen ${isMobile ? 'library-screen-compact' : 'library-screen-full'}`}>
      <div className="page-head media-page-head">
        <div>
          <div className="page-title">Sound Library</div>
        </div>
        <div className="page-actions media-head-search">
          <SearchField value={search} placeholder="Search..." onChange={e => setSearch(e.target.value)}/>
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
        const extraLabel = {
          plays: 'Plays',
          added: 'Added',
          size: 'Size',
          duration: 'Length',
        }[sortBy] || '';
        return (
          <>
            <div className="library-mobile-list">
              <div className="library-mobile-head">
                <span/>
                <span>Filename</span>
                <span>{extraLabel}</span>
                <span/>
              </div>
              {sorted.map((s, i) => {
                const extra = extraVal(s);
                return (
                  <div key={s.name}>
                    {i > 0 && <div style={{ height: 1, background: 'var(--border)', opacity: 0.4 }}/>}
                    <div className="library-mobile-row">
                      <button className="btn btn-icon btn-ghost btn-sm" style={{ color: 'var(--accent)' }}
                        onClick={() => previewSound && previewSound(s)} aria-label="Preview">
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
                      <div className="library-mobile-actions">
                        {permissions.soundLibrary && (
                          <a className="btn btn-icon btn-ghost btn-sm" style={{ textDecoration: 'none' }}
                            href={API.sound.downloadUrl(s.name)} download={`${s.name}.mp3`} aria-label="Download">
                            <Icon name="download" size={12}/>
                          </a>
                        )}
                        {permissions.soundLibrary && (
                          <button className="btn btn-icon btn-ghost btn-sm" onClick={() => startEdit(s)} aria-label="Rename">
                            <Icon name="edit" size={12}/>
                          </button>
                        )}
                        {permissions.soundLibrary && (
                          <button className="btn btn-icon btn-ghost btn-sm" style={{ color: 'var(--red)' }}
                            onClick={() => setDeleteConfirm(s.name)} aria-label="Delete">
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
        <div className="library-table-wrap">
          <div className="library-table-grid" style={{ gridTemplateColumns: gridCols }}>
            <div/>
            <SortHeader col="name"     label="Filename" sortBy={sortBy} sortDir={sortDir} onSort={handleSort}/>
            <SortHeader col="duration" label="Length"   sortBy={sortBy} sortDir={sortDir} onSort={handleSort}/>
            <SortHeader col="size"     label="Size"     sortBy={sortBy} sortDir={sortDir} onSort={handleSort}/>
            <SortHeader col="plays"    label="Plays"    sortBy={sortBy} sortDir={sortDir} onSort={handleSort}/>
            <SortHeader col="added"    label="Added"    sortBy={sortBy} sortDir={sortDir} onSort={handleSort}/>
            <div/>
            <div style={{ gridColumn: '1 / -1', height: 1, background: 'var(--border)' }}/>
            {sorted.map(s => (
              <div key={s.name} style={{ display: 'contents' }}>
                <div style={{ gridColumn: '1 / -1', height: 1, background: 'var(--border)', opacity: 0.5 }}/>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '10px 12px' }}>
                  <button className="btn btn-icon btn-ghost btn-sm" style={{ color: 'var(--accent)' }} onClick={() => previewSound && previewSound(s)} title="Preview">
                    <Icon name="headphones" size={13}/>
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px' }}>
                  {editing === s.name ? (
                    <input className="input" autoFocus value={editVal}
                      onChange={e => setEditVal(e.target.value)} onBlur={commitEdit}
                      onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null); }}
                      style={{ width: 150 }}/>
                  ) : (
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13 }}>{s.name}.mp3</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>{s.duration}</div>
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>{s.size}</div>
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{s.plays}</div>
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>{fmtDate(s.addedMs)}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2, padding: '10px 12px' }}>
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


export const page = {
  kind: 'file-library',
  render: (c) => (
    <LibraryScreen sounds={c.sounds}
      addSound={c.addSound} deleteSound={c.deleteSound} renameSound={c.renameSound} previewSound={c.previewSound} permissions={c.perms}/>
  ),
};
