// Sound-Editor: eine eigene Page (gleicher Look wie Library/Files). Lädt eine
// Quelle (vorhandener Sound, Geräte-Upload, Aufnahme von Mikro/System-Sound
// oder YouTube-Link), zeigt eine Waveform mit Schnitt-Auswahl, erlaubt
// Lautstärke + Fades und speichert das Ergebnis als MP3 in die Sound-Library
// (mit Überschreib-Bestätigung). Render (Trim/Lautstärke→MP3) + YouTube laufen
// server-seitig via ffmpeg/yt-dlp.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { Icon } from '../ui/components.jsx';
import * as API from '../lib/api.js';

const cleanName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const fmtTime = (s) => {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

// ── Quellen-Auswahl für „New sound" ──────────────────────────────────────────
function SourcePicker({ onBlob, setToast }) {
  const [mode, setMode] = useState(null);            // 'youtube' | 'record' | null
  const [ytUrl, setYtUrl] = useState('');
  const [ytLoading, setYtLoading] = useState(false);
  const [recDevice, setRecDevice] = useState('mic'); // 'mic' | 'system'
  const [recording, setRecording] = useState(false);
  const recRef = useRef(null);

  const toast = (msg) => setToast?.({ msg, id: Date.now() });

  const loadYoutube = async () => {
    if (!ytUrl.trim()) return;
    setYtLoading(true);
    try {
      const blob = await API.soundTools.youtube(ytUrl.trim());
      onBlob(blob, 'YouTube');
    } catch (e) {
      toast(`YouTube import failed: ${e.message}`);
    } finally {
      setYtLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      let stream;
      if (recDevice === 'system') {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        if (!stream.getAudioTracks().length) {
          stream.getTracks().forEach((t) => t.stop());
          throw new Error('no system audio shared (enable "Share audio" in the dialog)');
        }
        stream.getVideoTracks().forEach((t) => t.stop()); // nur Audio behalten
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      const chunks = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        if (blob.size) onBlob(blob, recDevice === 'system' ? 'System recording' : 'Mic recording');
      };
      recRef.current = mr;
      mr.start();
      setRecording(true);
    } catch (e) {
      toast(`Recording failed: ${e.message}`);
      setRecording(false);
    }
  };
  const stopRecording = () => recRef.current?.state !== 'inactive' && recRef.current?.stop();
  useEffect(() => () => { try { recRef.current?.stop(); } catch {} }, []);

  return (
    <div className="sound-source-grid">
      <label className="sound-source-card" style={{ cursor: 'pointer' }}>
        <Icon name="upload" size={26}/>
        <strong>From device</strong>
        <span>Pick an audio file from this PC</span>
        <input type="file" hidden accept="audio/*"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onBlob(f, f.name); }}/>
      </label>

      <button type="button" className={'sound-source-card' + (mode === 'record' ? ' active' : '')}
        onClick={() => setMode(mode === 'record' ? null : 'record')}>
        <Icon name="mic" size={26}/>
        <strong>Record</strong>
        <span>Microphone or full Windows system sound</span>
      </button>

      <button type="button" className={'sound-source-card' + (mode === 'youtube' ? ' active' : '')}
        onClick={() => setMode(mode === 'youtube' ? null : 'youtube')}>
        <Icon name="music" size={26}/>
        <strong>From YouTube</strong>
        <span>Paste a link, grab the audio</span>
      </button>

      {mode === 'youtube' && (
        <div className="sound-source-panel">
          <input className="input" placeholder="https://youtube.com/watch?v=..." value={ytUrl}
            onChange={(e) => setYtUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') loadYoutube(); }} style={{ flex: 1, minWidth: 0 }}/>
          <button className="btn btn-primary" onClick={loadYoutube} disabled={ytLoading || !ytUrl.trim()}>
            {ytLoading ? 'Loading…' : 'Load'}
          </button>
        </div>
      )}

      {mode === 'record' && (
        <div className="sound-source-panel">
          <div className="seg">
            <button type="button" className={'seg-btn' + (recDevice === 'mic' ? ' on' : '')}
              onClick={() => setRecDevice('mic')} disabled={recording}>Microphone</button>
            <button type="button" className={'seg-btn' + (recDevice === 'system' ? ' on' : '')}
              onClick={() => setRecDevice('system')} disabled={recording}>System sound</button>
          </div>
          {!recording ? (
            <button className="btn btn-primary" onClick={startRecording}>
              <Icon name="mic" size={13}/> Start recording
            </button>
          ) : (
            <button className="btn btn-danger" onClick={stopRecording}>
              <Icon name="stop" size={13}/> Stop
            </button>
          )}
          {recording && <span className="rec-dot">● recording…</span>}
        </div>
      )}
    </div>
  );
}

// ── Haupt-Editor ──────────────────────────────────────────────────────────────
export const SoundEditorScreen = ({ initialName = null, botName, existingNames = [], onClose, onSaved, setToast }) => {
  const toast = useCallback((msg) => setToast?.({ msg, id: Date.now() }), [setToast]);
  const waveRef = useRef(null);
  const wsRef = useRef(null);
  const regionsRef = useRef(null);
  const regionRef = useRef(null);

  const [sourceBlob, setSourceBlob] = useState(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [loadingSource, setLoadingSource] = useState(!!initialName);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [trim, setTrim] = useState({ start: 0, end: 0 });

  const [gainDb, setGainDb] = useState(0);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);

  const [name, setName] = useState(cleanName(initialName) || '');
  const [saving, setSaving] = useState(false);
  const [overwriteAsk, setOverwriteAsk] = useState(false);

  // Bestehenden Sound als Quelle laden.
  useEffect(() => {
    if (!initialName) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(API.sound.previewUrl(cleanName(initialName)), { credentials: 'include' });
        if (!res.ok) throw new Error(`${res.status}`);
        const blob = await res.blob();
        if (!cancelled) { setSourceBlob(blob); setSourceLabel(`${initialName}.mp3`); }
      } catch (e) {
        if (!cancelled) toast(`Could not load sound: ${e.message}`);
      } finally {
        if (!cancelled) setLoadingSource(false);
      }
    })();
    return () => { cancelled = true; };
  }, [initialName, toast]);

  // WaveSurfer aufbauen, sobald eine Quelle da ist.
  useEffect(() => {
    if (!sourceBlob || !waveRef.current) return undefined;
    setReady(false);
    const ws = WaveSurfer.create({
      container: waveRef.current,
      height: 110,
      waveColor: '#3a4250',
      progressColor: '#9dda4f',
      cursorColor: '#e6edf3',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
    });
    const regions = ws.registerPlugin(RegionsPlugin.create());
    wsRef.current = ws;
    regionsRef.current = regions;

    ws.on('ready', () => {
      const dur = ws.getDuration();
      setDuration(dur);
      setTrim({ start: 0, end: dur });
      regionRef.current = regions.addRegion({
        start: 0, end: dur, color: 'rgba(157,218,79,0.12)', drag: true, resize: true,
      });
      setReady(true);
    });
    regions.on('region-updated', (r) => {
      regionRef.current = r;
      setTrim({ start: r.start, end: r.end });
    });
    ws.on('play', () => setPlaying(true));
    ws.on('pause', () => setPlaying(false));
    ws.on('finish', () => setPlaying(false));

    ws.loadBlob(sourceBlob).catch((e) => toast(`Decode failed: ${e.message}`));

    return () => { try { ws.destroy(); } catch {} wsRef.current = null; };
  }, [sourceBlob, toast]);

  // Vorschau-Lautstärke an Gain koppeln (Boost >0 dB nur beim Export hörbar).
  useEffect(() => {
    if (wsRef.current) wsRef.current.setVolume(Math.min(1, 10 ** (gainDb / 20)));
  }, [gainDb, ready]);

  const playAll = () => wsRef.current?.playPause();
  const playSelection = () => regionRef.current?.play();
  const resetTrim = () => {
    if (regionRef.current) { regionRef.current.setOptions({ start: 0, end: duration }); setTrim({ start: 0, end: duration }); }
  };

  const pickSource = (blob, label) => { setSourceBlob(blob); setSourceLabel(label); setLoadingSource(false); };

  const doSave = async (overwrite) => {
    const clean = cleanName(name);
    if (!clean) { toast('Please enter a name'); return; }
    setSaving(true);
    setOverwriteAsk(false);
    try {
      const mp3 = await API.soundTools.render(sourceBlob, {
        start: trim.start, end: trim.end, gain: gainDb, fadeIn, fadeOut,
      });
      const file = new File([mp3], `${clean}.mp3`, { type: 'audio/mpeg' });
      if (overwrite) await API.sound.remove(clean).catch(() => {});
      await API.sound.upload(file, clean);
      toast(`Saved ${clean}.mp3`);
      onSaved?.();
    } catch (e) {
      toast(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };
  const onSaveClick = () => {
    const clean = cleanName(name);
    if (!clean) { toast('Please enter a name'); return; }
    if (existingNames.includes(clean)) setOverwriteAsk(true);
    else doSave(false);
  };

  return (
    <div className="content-narrow sound-editor-screen">
      <div className="page-head media-page-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-icon btn-ghost" onClick={onClose} title="Back">
            <Icon name="chevron-left" size={18}/>
          </button>
          <div>
            <div className="page-title">{initialName ? 'Edit sound' : 'New sound'}</div>
            <div className="page-sub">{botName} — sound editor{sourceLabel ? ` · ${sourceLabel}` : ''}</div>
          </div>
        </div>
      </div>

      {!sourceBlob && !loadingSource && (
        <SourcePicker onBlob={pickSource} setToast={setToast}/>
      )}
      {loadingSource && <div className="empty"><div>Loading…</div></div>}

      {sourceBlob && (
        <>
          <div className="sound-wave-card">
            <div ref={waveRef} className="sound-wave"/>
            {!ready && <div className="empty" style={{ padding: 12 }}><div>Decoding…</div></div>}
            <div className="sound-transport">
              <button className="btn" onClick={playAll} disabled={!ready}>
                <Icon name={playing ? 'pause' : 'play'} size={13}/> {playing ? 'Pause' : 'Play'}
              </button>
              <button className="btn" onClick={playSelection} disabled={!ready}>
                <Icon name="play" size={13}/> Selection
              </button>
              <span className="sound-times">
                {fmtTime(trim.start)} – {fmtTime(trim.end)} <span style={{ opacity: 0.5 }}>/ {fmtTime(duration)}</span>
              </span>
              <button className="btn btn-sm btn-ghost" onClick={resetTrim} disabled={!ready} style={{ marginLeft: 'auto' }}>
                Reset trim
              </button>
            </div>
          </div>

          <div className="sound-controls">
            <label className="sound-ctrl">
              <span>Volume <strong>{gainDb > 0 ? `+${gainDb}` : gainDb} dB</strong></span>
              <input type="range" min={-20} max={12} step={1} value={gainDb}
                onChange={(e) => setGainDb(Number(e.target.value))}/>
            </label>
            <label className="sound-ctrl">
              <span>Fade in <strong>{fadeIn.toFixed(1)}s</strong></span>
              <input type="range" min={0} max={5} step={0.1} value={fadeIn}
                onChange={(e) => setFadeIn(Number(e.target.value))}/>
            </label>
            <label className="sound-ctrl">
              <span>Fade out <strong>{fadeOut.toFixed(1)}s</strong></span>
              <input type="range" min={0} max={5} step={0.1} value={fadeOut}
                onChange={(e) => setFadeOut(Number(e.target.value))}/>
            </label>
          </div>

          <div className="sound-save-row">
            <div className="sound-name-field">
              <input className="input" placeholder="sound name" value={name}
                onChange={(e) => setName(e.target.value)}/>
              <span className="sound-name-suffix">.mp3</span>
            </div>
            <button className="btn btn-primary" onClick={onSaveClick} disabled={!ready || saving || !cleanName(name)}>
              <Icon name="check" size={13}/> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          <div className="sound-hint">Lowercase a–z and 0–9 only. Volume boost above 0 dB is applied on save.</div>
        </>
      )}

      {overwriteAsk && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setOverwriteAsk(false); }}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Overwrite sound?</h3>
            <p><strong>{cleanName(name)}.mp3</strong> already exists and will be replaced.</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setOverwriteAsk(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => doSave(true)} disabled={saving}>
                <Icon name="check" size={13}/> {saving ? 'Saving…' : 'Overwrite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
