// Generischer Filebrowser für ein Modul (Datenordner). Browsen, öffnen/ansehen,
// Text/Config/JSON editieren, Upload, Download, Umbenennen, Löschen, Ordner.
// Abgesichert per Library-Recht (Server-seitig); Schreib-Aktionen nur mit canWrite.
import React, { useState, useEffect } from 'react';
import { Icon, SearchField } from '../ui/components.jsx';
import { useFetch } from '../lib/hooks.js';
import * as API from '../lib/api.js';

const TEXT_EXT = new Set([
  'txt', 'json', 'yml', 'yaml', 'conf', 'cfg', 'config', 'properties', 'ini', 'log',
  'env', 'md', 'xml', 'toml', 'js', 'ts', 'mjs', 'cjs', 'sh', 'bat', 'csv', 'html',
  'css', 'lua', 'py', 'json5', 'list', 'cmd', 'sk',
]);
function isTextFile(name) {
  const lower = name.toLowerCase();
  if (!lower.includes('.')) return ['dockerfile', 'readme', 'license', 'gitignore'].includes(lower);
  return TEXT_EXT.has(lower.split('.').pop());
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

const ICON_BTN = { textDecoration: 'none' };

const FileBrowserScreen = ({ bot, botName, canWrite, setToast }) => {
  const [path, setPath] = useState('');
  const { data, error, reload, loading } = useFetch(() => API.files.list(bot, path), [bot, path]);
  const [search, setSearch] = useState('');
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

  // Kontextmenü bei Escape schließen.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  const segments = path ? path.split('/').filter(Boolean) : [];
  const entries = (data?.entries || []).filter((e) => !search || e.name.toLowerCase().includes(search.toLowerCase()));

  const toast = (msg) => setToast?.({ msg, id: Date.now() });
  const goTo = (p) => { setPath(p); setSearch(''); };

  const triggerDownload = (rel, name) => {
    const a = document.createElement('a');
    a.href = API.files.downloadUrl(bot, rel);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  };
  const openContext = (event, entry) => {
    event.preventDefault();
    setMenu({ x: Math.min(event.clientX, window.innerWidth - 190), y: Math.min(event.clientY, window.innerHeight - 230), entry });
  };
  const closeMenu = () => setMenu(null);

  const openFile = async (name) => {
    const rel = joinPath(path, name);
    try {
      const r = await API.files.read(bot, rel);
      setEditing({ path: rel, name });
      setEditVal(r.content);
    } catch (e) {
      toast(`Open failed: ${e.message}`);
    }
  };
  const saveEdit = async () => {
    setSavingEdit(true);
    try {
      await API.files.write(bot, editing.path, editVal);
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
      await API.files.upload(bot, path, file);
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
      await API.files.rename(bot, renaming.rel, name);
      toast('Renamed');
      setRenaming(null);
      reload();
    } catch (e) {
      toast(`Rename failed: ${e.message}`);
    }
  };
  const doDelete = async () => {
    try {
      await API.files.remove(bot, deleteConfirm.rel);
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
      await API.files.mkdir(bot, path, name);
      toast('Folder created');
      setMkdirOpen(false);
      setMkdirVal('');
      reload();
    } catch (e) {
      toast(`Create failed: ${e.message}`);
    }
  };

  return (
    <div className="content-narrow library-screen">
      <div className="page-head media-page-head">
        <div>
          <div className="page-title">Files</div>
          <div className="page-sub">{botName} — files</div>
        </div>
        <div className="page-actions media-head-search">
          <SearchField value={search} placeholder="Search in folder..." onChange={(e) => setSearch(e.target.value)}/>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="media-toolbar-row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-sm" type="button" onClick={() => goTo('')} disabled={!path}>
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

      {canWrite && (
        <div className="media-toolbar-row media-action-row">
          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            <Icon name="upload" size={13}/> {uploading ? 'Uploading...' : 'Upload'}
            <input type="file" hidden disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; doUpload(f); }}/>
          </label>
          <button className="btn btn-ghost" type="button" onClick={() => { setMkdirVal(''); setMkdirOpen(true); }}>
            <Icon name="plus" size={13}/> New folder
          </button>
        </div>
      )}

      {error && <div className="settings-notice registry-error">{error.message}</div>}
      {loading && !data && <div className="empty"><div>Loading…</div></div>}

      {data && (
        <div className="library-table-wrap">
          <div className="filebrowser-list" style={{ minHeight: 80 }}
            onContextMenu={(ev) => { if (ev.target === ev.currentTarget) openContext(ev, null); }}>
            {path && (
              <div className="filebrowser-row" onClick={() => goTo(segments.slice(0, -1).join('/'))} style={{ cursor: 'pointer' }}>
                <Icon name="folder" size={16} style={{ color: 'var(--text-dim)', flexShrink: 0 }}/>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>..</span>
                <span/><span/><span/>
              </div>
            )}
            {entries.length === 0 && !path && (
              <div className="empty" style={{ color: 'var(--text-dim)', fontSize: 13, padding: '16px 0' }}>Empty folder.</div>
            )}
            {entries.map((e) => {
              const rel = joinPath(path, e.name);
              const isDir = e.type === 'dir';
              const canOpen = isDir || isTextFile(e.name);
              return (
                <div key={e.name} className="filebrowser-row" onContextMenu={(ev) => openContext(ev, e)}>
                  <Icon name={isDir ? 'folder' : 'file'} size={16}
                    style={{ color: isDir ? 'var(--accent)' : 'var(--text-dim)', flexShrink: 0 }}/>
                  <span
                    className="filebrowser-name"
                    style={{ cursor: canOpen ? 'pointer' : 'default', fontWeight: isDir ? 600 : 400 }}
                    onClick={() => { if (isDir) goTo(rel); else if (isTextFile(e.name)) openFile(e.name); }}
                    title={e.name}>
                    {e.name}
                  </span>
                  <span className="filebrowser-meta">{isDir ? '' : fmtSize(e.size)}</span>
                  <span className="filebrowser-meta">{fmtDate(e.mtime)}</span>
                  <div className="filebrowser-actions">
                    {!isDir && (
                      <a className="btn btn-icon btn-ghost btn-sm" style={ICON_BTN}
                        href={API.files.downloadUrl(bot, rel)} download={e.name} title="Download">
                        <Icon name="download" size={13}/>
                      </a>
                    )}
                    {canWrite && (
                      <button className="btn btn-icon btn-ghost btn-sm"
                        onClick={() => { setRenaming({ rel, name: e.name }); setRenameVal(e.name); }} title="Rename">
                        <Icon name="edit" size={13}/>
                      </button>
                    )}
                    {canWrite && (
                      <button className="btn btn-icon btn-ghost btn-sm" style={{ color: 'var(--red)' }}
                        onClick={() => setDeleteConfirm({ rel, name: e.name, type: e.type })} title="Delete">
                        <Icon name="trash" size={13}/>
                      </button>
                    )}
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
            <textarea className="input" value={editVal} onChange={(e) => setEditVal(e.target.value)}
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
              const rel = joinPath(path, e.name);
              const isDir = e.type === 'dir';
              return (
                <>
                  {isDir && (
                    <button className="ctx-item" onClick={() => { goTo(rel); closeMenu(); }}>
                      <Icon name="folder" size={13}/> Open
                    </button>
                  )}
                  {!isDir && isTextFile(e.name) && (
                    <button className="ctx-item" onClick={() => { openFile(e.name); closeMenu(); }}>
                      <Icon name="edit" size={13}/> Edit
                    </button>
                  )}
                  {!isDir && (
                    <button className="ctx-item" onClick={() => { triggerDownload(rel, e.name); closeMenu(); }}>
                      <Icon name="download" size={13}/> Download
                    </button>
                  )}
                  {canWrite && (
                    <button className="ctx-item" onClick={() => { setRenaming({ rel, name: e.name }); setRenameVal(e.name); closeMenu(); }}>
                      <Icon name="edit" size={13}/> Rename
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
                  <button className="ctx-item" onClick={() => { setMkdirVal(''); setMkdirOpen(true); closeMenu(); }}>
                    <Icon name="plus" size={13}/> New folder
                  </button>
                  <label className="ctx-item" style={{ cursor: 'pointer' }}>
                    <Icon name="upload" size={13}/> Upload
                    <input type="file" hidden onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ''; closeMenu(); doUpload(f); }}/>
                  </label>
                </>
              ) : (
                <div className="ctx-item" style={{ opacity: 0.5, cursor: 'default' }}>No actions</div>
              )
            )}
          </div>
        </>
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
    </div>
  );
};

export const page = {
  kind: 'files',
  render: (c) => (
    <FileBrowserScreen bot={c.parentBot} botName={c.botName} canWrite={!!c.perms.fileBrowser} setToast={c.setToast}/>
  ),
};
