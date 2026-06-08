// Generischer Filebrowser für ein Modul (Datenordner). Browsen, öffnen/ansehen,
// Text/Config/JSON editieren, Upload, Download, Umbenennen, Löschen, Ordner.
// Abgesichert per Library-Recht (Server-seitig); Schreib-Aktionen nur mit canWrite.
import React, { useState, useEffect, useRef } from 'react';
import { Icon, SearchField } from '../ui/components.jsx';
import { ImageViewer } from '../ui/image-viewer.jsx';
import { useFetch } from '../lib/hooks.js';
import * as API from '../lib/api.js';

const TEXT_EXT = new Set([
  'txt', 'json', 'yml', 'yaml', 'conf', 'cfg', 'config', 'properties', 'ini', 'log',
  'env', 'md', 'xml', 'toml', 'js', 'ts', 'mjs', 'cjs', 'sh', 'bat', 'csv', 'html',
  'css', 'lua', 'py', 'json5', 'list', 'cmd', 'sk',
]);
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus', 'webm']);
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif']);

function fileExtension(name) {
  const lower = name.toLowerCase();
  return lower.includes('.') ? lower.split('.').pop() : '';
}
function isTextFile(name) {
  const lower = name.toLowerCase();
  if (!lower.includes('.')) return ['dockerfile', 'readme', 'license', 'gitignore'].includes(lower);
  return TEXT_EXT.has(fileExtension(lower));
}
function isAudioFile(name) {
  return AUDIO_EXT.has(fileExtension(name));
}
function isImageFile(name) {
  return IMAGE_EXT.has(fileExtension(name));
}
function fmtSize(b) {
  if (b == null) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}
function fmtDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function joinPath(dir, name) {
  return dir ? `${dir.replace(/\/+$/, '')}/${name}` : name;
}

// Ziel-Ordner-Auswahl fürs Verschieben: navigiert nur durch Ordner.
function MovePicker({ bot, value, onChange }) {
  const { data } = useFetch(() => API.files.list(bot, value), [bot, value]);
  const segs = value ? value.split('/').filter(Boolean) : [];
  const folders = (data?.entries || []).filter((e) => e.type === 'dir');
  return (
    <div>
      <div className="media-toolbar-row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <button className="btn btn-sm" type="button" onClick={() => onChange('')} disabled={!value}>
          <Icon name="home" size={12}/> root
        </button>
        {segs.map((s, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="chevron-right" size={10} style={{ color: 'var(--text-dim)' }}/>
            <button className="btn btn-sm" type="button"
              onClick={() => onChange(segs.slice(0, i + 1).join('/'))} disabled={i === segs.length - 1}>{s}</button>
          </span>
        ))}
      </div>
      <div className="filebrowser-list" style={{ height: '320px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
        {folders.length === 0 && (
          <div className="empty" style={{ padding: 14, color: 'var(--text-dim)', fontSize: 13 }}>No subfolders here.</div>
        )}
        {folders.map((f) => (
          <div key={f.name} className="filebrowser-row" style={{ cursor: 'pointer', gridTemplateColumns: '22px minmax(0,1fr)' }}
            onClick={() => onChange(joinPath(value, f.name))}>
            <Icon name="folder" size={15} style={{ color: 'var(--accent)', flexShrink: 0 }}/>
            <span className="filebrowser-name">{f.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function fileBackend(bot) {
  return {
    list: (value) => API.files.list(bot, value),
    info: (rel) => API.files.info(bot, rel),
    read: (rel) => API.files.read(bot, rel),
    write: (rel, content) => API.files.write(bot, rel, content),
    rename: (rel, name) => API.files.rename(bot, rel, name),
    remove: (rel) => API.files.remove(bot, rel),
    mkdir: (value, name) => API.files.mkdir(bot, value, name),
    move: (paths, dest) => API.files.move(bot, paths, dest),
    upload: (value, file) => API.files.upload(bot, value, file),
    downloadUrl: (rel) => API.files.downloadUrl(bot, rel),
    archiveUrl: (paths) => API.files.archiveUrl(bot, paths),
  };
}

export const FileBrowserScreen = ({
  bot,
  botName,
  canWrite,
  setToast,
  active = true,
  backend,
  title = 'Files',
  subtitle = `${botName} — files`,
  allowFolders = true,
  allowMove = true,
  allowTextEdit = true,
  allowDownload = true,
  uploadAccept,
  onEditAudio,   // (name) => void — wenn gesetzt: Audio-Zeilen bieten Play + Edit statt Open
  onNewSound,    // () => void — wenn gesetzt: „New sound"-Button in der Toolbar
}) => {
  const storage = React.useMemo(() => backend || fileBackend(bot), [backend, bot]);
  const [path, setPath] = useState('');
  const { data, error, reload, loading } = useFetch(() => storage.list(path), [storage, path]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');   // 'name' | 'added'
  const [sortDir, setSortDir] = useState('asc');   // 'asc' | 'desc'
  const [editing, setEditing] = useState(null);   // { path, name }
  const [editVal, setEditVal] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [renaming, setRenaming] = useState(null);  // { rel, name }
  const [renameVal, setRenameVal] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { rel, name, type }
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [mkdirVal, setMkdirVal] = useState('');
  const [uploading, setUploading] = useState(false);
  const [menu, setMenu] = useState(null); // { x, y, entry|null }
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set()); // ausgewählte Namen im aktuellen Ordner
  const [bulkDelete, setBulkDelete] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [movePath, setMovePath] = useState('');
  const [moveItems, setMoveItems] = useState([]); // rel-Pfade die verschoben werden (Auswahl ODER Einzeldatei)
  const [moveConfirming, setMoveConfirming] = useState(false);
  const [moving, setMoving] = useState(false);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const previewAudioRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(reload, 2000);
    return () => clearInterval(id);
  }, [active, reload]);

  // Move-Dialog öffnen (für die aktuelle Auswahl oder eine Einzeldatei).
  const openMove = (rels) => {
    setMoveItems(rels);
    setMovePath(path);
    setMoveConfirming(false);
    setMoveOpen(true);
  };

  // Kontextmenü bei Escape schließen.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  // Auswahl beim Ordner-/Modulwechsel zurücksetzen.
  useEffect(() => { setSelected(new Set()); }, [path, bot]);
  useEffect(() => {
    previewAudioRef.current?.pause();
    if (previewAudioRef.current?.objectUrl) URL.revokeObjectURL(previewAudioRef.current.objectUrl);
    previewAudioRef.current = null;
    setImagePreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }, [path, bot]);
  useEffect(() => () => {
    previewAudioRef.current?.pause();
    if (previewAudioRef.current?.objectUrl) URL.revokeObjectURL(previewAudioRef.current.objectUrl);
    previewAudioRef.current = null;
  }, []);
  useEffect(() => () => {
    if (imagePreview?.url) URL.revokeObjectURL(imagePreview.url);
  }, [imagePreview]);

  const toggleSelect = (name) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  const clearSelect = () => setSelected(new Set());
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };
  const allSelected = (data?.entries?.length || 0) > 0 && (data?.entries || []).every((e) => selected.has(e.name));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set((data?.entries || []).map((e) => e.name)));

  // Angezeigten Ordner aus den GELADENEN Daten ableiten (nicht aus dem sofort
  // gesetzten path). So wechseln Breadcrumb, „..“ und Liste atomar, sobald die
  // neuen Daten da sind — kein kurzes Blinken/Diskrepanz beim Navigieren.
  const dir = data?.path ?? path;
  const segments = dir ? dir.split('/').filter(Boolean) : [];
  const entries = (data?.entries || []).filter((e) => !search || e.name.toLowerCase().includes(search.toLowerCase()));
  // Sortierung (Ordner immer oben), nach Name oder Hinzugefügt, auf-/absteigend.
  const sortedEntries = React.useMemo(() => {
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...entries].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      if (sortBy === 'added') return mul * ((a.mtime || 0) - (b.mtime || 0));
      return mul * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }, [entries, sortBy, sortDir]);
  const toggleSort = (key) => {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(key); setSortDir(key === 'added' ? 'desc' : 'asc'); }
  };
  const sortArrow = (key) => (sortBy === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');
  const imageEntries = (data?.entries || []).filter((entry) => entry.type === 'file' && isImageFile(entry.name));
  const imagePreviewIndex = imagePreview
    ? imageEntries.findIndex((entry) => entry.name === imagePreview.name)
    : -1;

  const toast = (msg) => setToast?.({ msg, id: Date.now() });
  const goTo = (p) => { setPath(p); setSearch(''); };

  const triggerDownload = (rel, name) => {
    const a = document.createElement('a');
    a.href = storage.downloadUrl(rel);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  };
  const triggerArchive = (rels, name = 'download.zip') => {
    const a = document.createElement('a');
    a.href = storage.archiveUrl(rels);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  };
  const openMenuAt = (x, y, entry) => setMenu({
    x: Math.max(8, Math.min(x, window.innerWidth - 184)),
    y: Math.min(y, window.innerHeight - 240),
    entry,
  });
  // Rechtsklick (Maus).
  const openContext = (event, entry) => { event.preventDefault(); openMenuAt(event.clientX, event.clientY, entry); };
  // ⋮-Button (funktioniert auch auf Touch) — Menü unter dem Button verankern.
  const openMenuButton = (event, entry) => {
    event.stopPropagation();
    const r = event.currentTarget.getBoundingClientRect();
    openMenuAt(r.right - 176, r.bottom + 4, entry);
  };
  const closeMenu = () => setMenu(null);
  const openDetails = async (rel) => {
    closeMenu();
    setDetailsLoading(true);
    try {
      setDetails(await storage.info(rel));
    } catch (e) {
      toast(`Details failed: ${e.message}`);
    } finally {
      setDetailsLoading(false);
    }
  };

  const openFile = async (name) => {
    const rel = joinPath(path, name);
    try {
      const r = await storage.read(rel);
      setEditing({ path: rel, name });
      setEditVal(r.content);
    } catch (e) {
      toast(`Open failed: ${e.message}`);
    }
  };
  const previewAudio = async (rel) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      if (previewAudioRef.current.objectUrl) URL.revokeObjectURL(previewAudioRef.current.objectUrl);
      previewAudioRef.current = null;
    }
    try {
      const response = await fetch(storage.previewUrl?.(rel) || storage.downloadUrl(rel), { credentials: 'include' });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const objectUrl = URL.createObjectURL(await response.blob());
      const audio = new Audio(objectUrl);
      audio.objectUrl = objectUrl;
      previewAudioRef.current = audio;
      const clear = () => {
        URL.revokeObjectURL(objectUrl);
        if (previewAudioRef.current === audio) previewAudioRef.current = null;
      };
      audio.onended = clear;
      audio.onerror = () => {
        clear();
        toast('Preview playback failed');
      };
      await audio.play();
      toast(`Previewing ${rel.split('/').pop()} locally`);
    } catch (e) {
      if (previewAudioRef.current?.objectUrl) URL.revokeObjectURL(previewAudioRef.current.objectUrl);
      previewAudioRef.current = null;
      toast(`Preview failed: ${e.message}`);
    }
  };
  const closeImagePreview = () => {
    setImagePreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  };
  const previewImage = async (rel) => {
    try {
      const response = await fetch(storage.previewUrl?.(rel) || storage.downloadUrl(rel), { credentials: 'include' });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const url = URL.createObjectURL(await response.blob());
      setImagePreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return { name: rel.split('/').pop(), url };
      });
    } catch (e) {
      toast(`Preview failed: ${e.message}`);
    }
  };
  const saveEdit = async () => {
    setSavingEdit(true);
    try {
      await storage.write(editing.path, editVal);
      toast('Saved');
      setEditing(null);
      reload();
    } catch (e) {
      toast(`Save failed: ${e.message}`);
    } finally {
      setSavingEdit(false);
    }
  };
  const doUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      await storage.upload(path, file);
      toast(`Uploaded ${file.name}`);
      reload();
    } catch (e) {
      toast(`Upload failed: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };
  const doRename = async () => {
    const name = renameVal.trim();
    if (!name) return;
    try {
      await storage.rename(renaming.rel, name);
      toast('Renamed');
      setRenaming(null);
      reload();
    } catch (e) {
      toast(`Rename failed: ${e.message}`);
    }
  };
  const doDelete = async () => {
    try {
      await storage.remove(deleteConfirm.rel);
      toast('Deleted');
      reload();
    } catch (e) {
      toast(`Delete failed: ${e.message}`);
    } finally {
      setDeleteConfirm(null);
    }
  };
  const doMkdir = async () => {
    const name = mkdirVal.trim();
    if (!name) return;
    try {
      await storage.mkdir(path, name);
      toast('Folder created');
      setMkdirOpen(false);
      setMkdirVal('');
      reload();
    } catch (e) {
      toast(`Create failed: ${e.message}`);
    }
  };
  const doBulkDelete = async () => {
    const rels = [...selected].map((n) => joinPath(path, n));
    try {
      for (const rel of rels) await storage.remove(rel);
      toast(`Deleted ${rels.length}`);
    } catch (e) {
      toast(`Delete failed: ${e.message}`);
    } finally {
      setBulkDelete(false);
      clearSelect();
      reload();
    }
  };
  const doBulkDownload = () => {
    const sel = (data?.entries || []).filter((e) => selected.has(e.name));
    if (!sel.length) return;
    if (sel.length === 1 && sel[0].type === 'file') {
      triggerDownload(joinPath(path, sel[0].name), sel[0].name);
      return;
    }
    triggerArchive(sel.map((entry) => joinPath(path, entry.name)),
      sel.length === 1 ? `${sel[0].name}.zip` : 'download.zip');
  };
  const doMove = async () => {
    setMoving(true);
    try {
      await storage.move(moveItems, movePath);
      toast(`Moved ${moveItems.length}`);
      setMoveOpen(false);
      setMoveConfirming(false);
      clearSelect();
      reload();
    } catch (e) {
      toast(`Move failed: ${e.message}`);
    } finally {
      setMoving(false);
    }
  };

  return (
    <div className="content-narrow filebrowser-screen">
      <div className="page-head media-page-head">
        <div>
          <div className="page-title">{title}</div>
          {subtitle && <div className="page-sub">{subtitle}</div>}
        </div>
        <div className="page-actions media-head-search">
          <SearchField value={search} placeholder="Search in folder..." onChange={(e) => setSearch(e.target.value)}/>
        </div>
      </div>

      {/* Ein Container-Rahmen für beide Modi → gleiche Größe. Im Select-Modus
          nur eine leicht andere Hintergrundfarbe. */}
      <div className={'fb-toolbar' + (selectMode ? ' fb-toolbar-active' : '')}>
        {!selectMode ? (
          <>
            <div className="fb-toolbar-line">
              <button className="btn btn-sm" type="button" onClick={() => goTo('')} disabled={!dir}>
                <Icon name="home" size={13}/> root
              </button>
              {segments.map((seg, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="chevron-right" size={11} style={{ color: 'var(--text-dim)' }}/>
                  <button className="btn btn-sm" type="button"
                    onClick={() => goTo(segments.slice(0, i + 1).join('/'))}
                    disabled={i === segments.length - 1}>{seg}</button>
                </span>
              ))}
            </div>
            <div className="fb-toolbar-line fb-toolbar-actions">
              <button className="btn" type="button" onClick={() => setSelectMode(true)}>
                <Icon name="check" size={13}/> Select
              </button>
              {canWrite && onNewSound && (
                <button className="btn" type="button" onClick={onNewSound}>
                  <Icon name="plus" size={13}/> New sound
                </button>
              )}
              {canWrite && allowFolders && (
                <button className="btn" type="button" onClick={() => { setMkdirVal(''); setMkdirOpen(true); }}>
                  <Icon name="plus" size={13}/> New folder
                </button>
              )}
              {canWrite && (
                <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
                  <Icon name="upload" size={13}/> {uploading ? 'Uploading...' : 'Upload'}
                  <input type="file" hidden disabled={uploading} accept={uploadAccept}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; doUpload(f); }}/>
                </label>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="fb-toolbar-line">
              <button className="btn btn-sm" type="button" onClick={toggleAll} disabled={!(data?.entries?.length)}>
                <Icon name="check" size={13}/> {allSelected ? 'None' : 'All'}
              </button>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{selected.size} selected</span>
              <button className="btn btn-sm" type="button" onClick={exitSelect} style={{ marginLeft: 'auto' }}>
                <Icon name="x" size={13}/> Cancel
              </button>
            </div>
            <div className="fb-toolbar-line fb-toolbar-actions">
              {allowDownload && (
                <button className="btn" type="button" onClick={doBulkDownload} disabled={!selected.size}>
                  <Icon name="download" size={13}/> Download
                </button>
              )}
              {canWrite && allowMove && (
                <button className="btn" type="button" onClick={() => openMove([...selected].map((n) => joinPath(path, n)))} disabled={!selected.size}>
                  <Icon name="folder" size={13}/> Move
                </button>
              )}
              {canWrite && (
                <button className="btn btn-danger" type="button" onClick={() => setBulkDelete(true)} disabled={!selected.size}>
                  <Icon name="trash" size={13}/> Delete
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {error && <div className="settings-notice registry-error">{error.message}</div>}
      {loading && !data && <div className="empty"><div>Loading…</div></div>}

      {data && (
        <div className="library-table-wrap">
          {/* Dezenter Sortier-Kopf (Desktop) + kleines Dropdown (Mobil). */}
          {!selectMode && (
            <>
              <div className="filebrowser-head">
                <span/>
                <button className="fb-sort" type="button" onClick={() => toggleSort('name')}>Name{sortArrow('name')}</button>
                <span/>
                <button className="fb-sort" type="button" onClick={() => toggleSort('added')}>Added{sortArrow('added')}</button>
                <span/>
              </div>
              <div className="filebrowser-sort-mobile">
                <label>Sort</label>
                <select className="select" value={`${sortBy}-${sortDir}`}
                  onChange={(e) => { const [k, d] = e.target.value.split('-'); setSortBy(k); setSortDir(d); }}>
                  <option value="name-asc">Name A–Z</option>
                  <option value="name-desc">Name Z–A</option>
                  <option value="added-desc">Newest</option>
                  <option value="added-asc">Oldest</option>
                </select>
              </div>
            </>
          )}
          <div className={'filebrowser-list' + (selectMode ? ' selecting' : '')} style={{ minHeight: 80 }}
            onContextMenu={(ev) => { if (ev.target === ev.currentTarget) openContext(ev, null); }}>
            {dir && (
              <div className="filebrowser-row" onClick={() => goTo(segments.slice(0, -1).join('/'))} style={{ cursor: 'pointer' }}>
                {selectMode && <span/>}
                <Icon name="folder" size={16} style={{ color: 'var(--text-dim)', flexShrink: 0 }}/>
                <div className="filebrowser-namecell">
                  <span className="filebrowser-name" style={{ color: 'var(--text-dim)' }}>..</span>
                  <span className="filebrowser-submeta">{' '}</span>
                </div>
                <span className="filebrowser-meta"/>
                <span className="filebrowser-meta"/>
                <div className="filebrowser-actions"/>
              </div>
            )}
            {entries.length === 0 && !dir && (
              <div className="empty" style={{ color: 'var(--text-dim)', fontSize: 13, padding: '16px 0' }}>Empty folder.</div>
            )}
            {sortedEntries.map((e) => {
              const rel = joinPath(dir, e.name);
              const isDir = e.type === 'dir';
              const isAudio = !isDir && isAudioFile(e.name);
              const isImage = !isDir && isImageFile(e.name);
              const canOpen = isDir || (allowTextEdit && isTextFile(e.name)) || isAudio || isImage;
              const sel = selected.has(e.name);
              return (
                <div key={e.name}
                  className={'filebrowser-row' + (sel ? ' selected' : '') + (menu?.entry?.name === e.name ? ' menu-open' : '')}
                  onContextMenu={(ev) => openContext(ev, e)}>
                  {selectMode && (
                    <span className={'fb-check' + (sel ? ' on' : '')} title="Select"
                      onClick={(ev) => { ev.stopPropagation(); toggleSelect(e.name); }}>
                      {sel && <Icon name="check" size={11}/>}
                    </span>
                  )}
                  <Icon name={isDir ? 'folder' : isAudio ? 'music' : isImage ? 'image' : 'file'} size={16}
                    style={{ color: isDir || isAudio || isImage ? 'var(--accent)' : 'var(--text-dim)', flexShrink: 0 }}/>
                  <div className="filebrowser-namecell"
                    style={{ cursor: canOpen ? 'pointer' : 'default' }}
                    onClick={() => { if (isDir) goTo(rel); else if (isAudio) previewAudio(rel); else if (isImage) previewImage(rel); else if (allowTextEdit && isTextFile(e.name)) openFile(e.name); }}>
                    <span className="filebrowser-name" style={{ fontWeight: isDir ? 600 : 400 }} title={e.name}>{e.name}</span>
                    <span className="filebrowser-submeta">{isDir ? 'Folder' : fmtSize(e.size)}{e.mtime ? ` · ${fmtDate(e.mtime)}` : ''}</span>
                  </div>
                  <span className="filebrowser-meta">{isDir ? '' : fmtSize(e.size)}</span>
                  <span className="filebrowser-meta">{fmtDate(e.mtime)}</span>
                  <div className="filebrowser-actions">
                    <button className="btn btn-icon btn-ghost btn-sm" title="Actions"
                      onClick={(ev) => openMenuButton(ev, e)}>
                      <Icon name="more" size={16}/>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: 'min(900px, 92vw)', maxWidth: '92vw' }}>
            <h3 style={{ fontFamily: 'var(--font-mono)' }}>{editing.name}</h3>
            <textarea className="input file-editor-input" value={editVal} onChange={(e) => setEditVal(e.target.value)}
              spellCheck={false}
              style={{ width: '100%', height: '55vh', fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.5, resize: 'vertical', whiteSpace: 'pre', overflowWrap: 'normal' }}/>
            <div className="modal-actions">
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={savingEdit}>
                <Icon name="check" size={13}/> {savingEdit ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen image viewer */}
      {imagePreview && (
        <ImageViewer src={imagePreview.url} name={imagePreview.name}
          canDownload={allowDownload}
          canPrevious={imagePreviewIndex > 0}
          canNext={imagePreviewIndex >= 0 && imagePreviewIndex < imageEntries.length - 1}
          onPrevious={() => {
            if (imagePreviewIndex > 0) previewImage(joinPath(path, imageEntries[imagePreviewIndex - 1].name));
          }}
          onNext={() => {
            if (imagePreviewIndex >= 0 && imagePreviewIndex < imageEntries.length - 1) {
              previewImage(joinPath(path, imageEntries[imagePreviewIndex + 1].name));
            }
          }}
          onDownload={() => triggerDownload(joinPath(path, imagePreview.name), imagePreview.name)}
          onClose={closeImagePreview}/>
      )}

      {/* Rename modal */}
      {renaming && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setRenaming(null); }}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Rename</h3>
            <input className="input" autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doRename(); }} style={{ width: '100%' }}/>
            <div className="modal-actions">
              <button className="btn" onClick={() => setRenaming(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={doRename}>Rename</button>
            </div>
          </div>
        </div>
      )}

      {/* New folder modal */}
      {mkdirOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setMkdirOpen(false); }}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <h3>New folder</h3>
            <input className="input" autoFocus value={mkdirVal} placeholder="folder name"
              onChange={(e) => setMkdirVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doMkdir(); }} style={{ width: '100%' }}/>
            <div className="modal-actions">
              <button className="btn" onClick={() => setMkdirOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={doMkdir}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Rechtsklick-Kontextmenü */}
      {menu && (
        <>
          <div className="ctx-backdrop"
            onClick={closeMenu}
            onContextMenu={(e) => { e.preventDefault(); closeMenu(); }}/>
          <div className="ctx-menu" style={{ top: menu.y, left: menu.x }}>
            {menu.entry ? (() => {
              const e = menu.entry;
              const rel = joinPath(dir, e.name);
              const isDir = e.type === 'dir';
              const isAudio = !isDir && isAudioFile(e.name);
              const isImage = !isDir && isImageFile(e.name);
              return (
                <>
                  {isDir && (
                    <button className="ctx-item" onClick={() => { goTo(rel); closeMenu(); }}>
                      <Icon name="folder" size={13}/> Open
                    </button>
                  )}
                  {!isDir && allowTextEdit && isTextFile(e.name) && (
                    <button className="ctx-item" onClick={() => { openFile(e.name); closeMenu(); }}>
                      <Icon name="file" size={13}/> Open
                    </button>
                  )}
                  {isAudio && (
                    <button className="ctx-item" onClick={() => { previewAudio(rel); closeMenu(); }}>
                      <Icon name="play" size={13}/> Play
                    </button>
                  )}
                  {isAudio && onEditAudio && (
                    <button className="ctx-item" onClick={() => { onEditAudio(e.name); closeMenu(); }}>
                      <Icon name="edit" size={13}/> Edit
                    </button>
                  )}
                  {isImage && (
                    <button className="ctx-item" onClick={() => { previewImage(rel); closeMenu(); }}>
                      <Icon name="image" size={13}/> Open
                    </button>
                  )}
                  {allowDownload && <button className="ctx-item" onClick={() => {
                      if (isDir) triggerArchive([rel], `${e.name}.zip`);
                      else triggerDownload(rel, e.name);
                      closeMenu();
                    }}>
                      <Icon name="download" size={13}/> Download
                  </button>}
                  <button className="ctx-item" onClick={() => openDetails(rel)} disabled={detailsLoading}>
                    <Icon name="info" size={13}/> Details
                  </button>
                  {canWrite && (
                    <button className="ctx-item" onClick={() => { setRenaming({ rel, name: e.name }); setRenameVal(e.name); closeMenu(); }}>
                      <Icon name="edit" size={13}/> Rename
                    </button>
                  )}
                  {canWrite && allowMove && (
                    <button className="ctx-item" onClick={() => { openMove([rel]); closeMenu(); }}>
                      <Icon name="folder" size={13}/> Move
                    </button>
                  )}
                  {canWrite && (
                    <button className="ctx-item ctx-danger" onClick={() => { setDeleteConfirm({ rel, name: e.name, type: e.type }); closeMenu(); }}>
                      <Icon name="trash" size={13}/> Delete
                    </button>
                  )}
                </>
              );
            })() : (
              canWrite ? (
                <>
                  {allowFolders && (
                    <button className="ctx-item" onClick={() => { setMkdirVal(''); setMkdirOpen(true); closeMenu(); }}>
                      <Icon name="plus" size={13}/> New folder
                    </button>
                  )}
                  <label className="ctx-item" style={{ cursor: 'pointer' }}>
                    <Icon name="upload" size={13}/> Upload
                    <input type="file" hidden accept={uploadAccept}
                      onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ''; closeMenu(); doUpload(f); }}/>
                  </label>
                </>
              ) : (
                <div className="ctx-item" style={{ opacity: 0.5, cursor: 'default' }}>No actions</div>
              )
            )}
          </div>
        </>
      )}

      {/* File/folder details */}
      {details && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetails(null); }}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Details</h3>
            <div className="file-details">
              <div><span>Name</span><strong>{details.name}</strong></div>
              <div><span>Type</span><strong>{details.type}</strong></div>
              <div><span>Path</span><strong>/{details.path}</strong></div>
              <div>
                <span>{details.type === 'Folder' ? 'Items' : 'Size'}</span>
                <strong>{details.type === 'Folder' ? details.itemCount : fmtSize(details.size)}</strong>
              </div>
              <div><span>Created</span><strong>{fmtDate(details.createdAt) || '-'}</strong></div>
              <div><span>Modified</span><strong>{fmtDate(details.modifiedAt) || '-'}</strong></div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setDetails(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteConfirm(null); }}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Delete {deleteConfirm.type === 'dir' ? 'folder' : 'file'}?</h3>
            <p><strong>{deleteConfirm.name}</strong>{deleteConfirm.type === 'dir' ? ' and everything inside it' : ''} will be permanently deleted.</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={doDelete}>
                <Icon name="trash" size={13}/> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirm */}
      {bulkDelete && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setBulkDelete(false); }}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Delete {selected.size} item{selected.size > 1 ? 's' : ''}?</h3>
            <p>The selected items (including any folders and their contents) will be permanently deleted.</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setBulkDelete(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={doBulkDelete}>
                <Icon name="trash" size={13}/> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move modal */}
      {moveOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) { setMoveOpen(false); setMoveConfirming(false); } }}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: 'min(560px, 92vw)' }}>
            {!moveConfirming ? (
              <>
                <h3>Move {moveItems.length} item{moveItems.length > 1 ? 's' : ''}</h3>
                <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: -4 }}>Pick the destination folder:</p>
                <MovePicker bot={bot} value={movePath} onChange={setMovePath}/>
                <div className="modal-actions" style={{ marginTop: 20 }}>
                  <button className="btn" onClick={() => setMoveOpen(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={() => setMoveConfirming(true)} disabled={movePath === path}>
                    <Icon name="folder" size={13}/> Move here
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3>Move {moveItems.length} item{moveItems.length > 1 ? 's' : ''}?</h3>
                <p>Destination: <strong>/{movePath || ''}</strong></p>
                <div className="modal-actions" style={{ marginTop: 20 }}>
                  <button className="btn" onClick={() => setMoveConfirming(false)}>Back</button>
                  <button className="btn btn-primary" onClick={doMove} disabled={moving}>
                    <Icon name="check" size={13}/> {moving ? 'Moving...' : 'Confirm move'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const page = {
  kind: 'files',
  render: (c) => (
    <FileBrowserScreen bot={c.parentBot} botName={c.botName} canWrite={!!c.perms.fileBrowser}
      setToast={c.setToast} active={c.active}/>
  ),
};
