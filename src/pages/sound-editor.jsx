// Sound-Editor: eine eigene Page (gleicher Look wie Library/Files). Die Quellen
// (vorhandener Sound, Geräte-Upload, Aufnahme von Mikro/System-Sound, YouTube)
// sind direkt im Editor integriert. Aufnahmen zeigen eine LIVE-Waveform; danach
// gibt es eine Waveform mit Schnitt-Auswahl, Lautstärke + Fades. Gespeichert
// wird als MP3 in die Sound-Library (mit Überschreib-Bestätigung). Render
// (Trim/Lautstärke→MP3) + YouTube laufen server-seitig via ffmpeg/yt-dlp.
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
// Aufnahme ohne Sprach-„Aufbereitung" (sonst klingt System-/Discord-Audio blechern).
const RAW_AUDIO = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

export const SoundEditorScreen = ({ initialName = null, botName, existingNames = [], onClose, onSaved, setToast }) => {
  const toast = useCallback((msg) => setToast?.({ msg, id: Date.now() }), [setToast]);
  const waveRef = useRef(null);
  const wsRef = useRef(null);
  const regionsRef = useRef(null);
  const regionRef = useRef(null);
  const selEndRef = useRef(null);   // Endzeit beim Abspielen der Auswahl

  // Live-Aufnahme
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const historyRef = useRef([]);

  const [sourceBlob, setSourceBlob] = useState(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [loadingSource, setLoadingSource] = useState(!!initialName);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [trim, setTrim] = useState({ start: 0, end: 0 });

  const [recMode, setRecMode] = useState('mic'); // 'mic' | 'system'
  const [recording, setRecording] = useState(false);
  const [ytUrl, setYtUrl] = useState('');
  const [ytLoading, setYtLoading] = useState(false);

  const [gainDb, setGainDb] = useState(0);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);

  const [name, setName] = useState(cleanName(initialName) || '');
  const [saving, setSaving] = useState(false);
  const [overwriteAsk, setOverwriteAsk] = useState(false);

  const pickSource = useCallback((blob, label) => {
    setSourceBlob(blob); setSourceLabel(label); setLoadingSource(false);
  }, []);

  // Bestehenden Sound als Quelle laden.
  useEffect(() => {
    if (!initialName) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(API.sound.previewUrl(cleanName(initialName)), { credentials: 'include' });
        if (!res.ok) throw new Error(`${res.status}`);
        const blob = await res.blob();
        if (!cancelled) pickSource(blob, `${initialName}.mp3`);
      } catch (e) {
        if (!cancelled) { toast(`Could not load sound: ${e.message}`); setLoadingSource(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [initialName, toast, pickSource]);

  // WaveSurfer (Bearbeiten) aufbauen, sobald eine Quelle da ist und NICHT aufgenommen wird.
  useEffect(() => {
    if (!sourceBlob || recording || !waveRef.current) return undefined;
    setReady(false);
    const ws = WaveSurfer.create({
      container: waveRef.current,
      height: 110,
      waveColor: '#3a4250',
      progressColor: '#9dda4f',
      cursorColor: '#e6edf3',
      barWidth: 2, barGap: 1, barRadius: 2,
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
    regions.on('region-updated', (r) => { regionRef.current = r; setTrim({ start: r.start, end: r.end }); });
    ws.on('play', () => setPlaying(true));
    ws.on('pause', () => { setPlaying(false); selEndRef.current = null; });
    ws.on('finish', () => { setPlaying(false); selEndRef.current = null; });
    // Auswahl-Wiedergabe am Auswahl-Ende stoppen.
    ws.on('timeupdate', (t) => { if (selEndRef.current != null && t >= selEndRef.current) { ws.pause(); } });

    ws.loadBlob(sourceBlob).catch((e) => toast(`Decode failed: ${e.message}`));
    return () => { try { ws.destroy(); } catch {} wsRef.current = null; };
  }, [sourceBlob, recording, toast]);

  // Vorschau-Lautstärke an Gain koppeln (Boost >0 dB nur beim Export hörbar).
  useEffect(() => { if (wsRef.current) wsRef.current.setVolume(Math.min(1, 10 ** (gainDb / 20))); }, [gainDb, ready]);

  // ── Aufnahme ────────────────────────────────────────────────────────────────
  const stopTracks = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  const cleanupRecording = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    historyRef.current = [];
    stopTracks();
  }, []);

  const drawLive = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i] - 128) / 128; if (v > peak) peak = v; }
    const step = 4; // 3px Balken + 1px Lücke
    const maxBars = Math.floor(canvas.width / step);
    const hist = historyRef.current;
    hist.push(peak);
    if (hist.length > maxBars) hist.splice(0, hist.length - maxBars);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#9dda4f';
    const mid = canvas.height / 2;
    for (let i = 0; i < hist.length; i++) {
      const h = Math.max(2, hist[i] * canvas.height * 0.92);
      ctx.fillRect(i * step, mid - h / 2, 3, h);
    }
    rafRef.current = requestAnimationFrame(drawLive);
  }, []);

  const startRecording = async (mode) => {
    try {
      let stream;
      if (mode === 'system') {
        try { stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: RAW_AUDIO }); }
        catch { stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); }
        if (!stream.getAudioTracks().length) {
          stream.getTracks().forEach((t) => t.stop());
          throw new Error('no system audio shared (tick "Share audio" in the dialog)');
        }
        stream.getVideoTracks().forEach((t) => t.stop()); // nur Audio behalten
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: RAW_AUDIO });
      }
      streamRef.current = stream;

      // Live-Visualizer (Analyser nicht an die Ausgabe hängen → kein Echo).
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      historyRef.current = [];

      // Recorder (hohe Bitrate → weniger blechern).
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const chunks = [];
      const mr = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 192000 });
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        cleanupRecording();
        setRecording(false);
        const blob = new Blob(chunks, { type: mime });
        if (blob.size) pickSource(blob, mode === 'system' ? 'System recording' : 'Mic recording');
      };
      recorderRef.current = mr;

      setSourceBlob(null);  // alte Bearbeitung verwerfen, Canvas zeigen
      setReady(false);
      setRecording(true);
      mr.start();
      // Canvas-Größe setzen + Loop starten (nach Render).
      requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (canvas) { canvas.width = canvas.offsetWidth; canvas.height = 110; }
        rafRef.current = requestAnimationFrame(drawLive);
      });
    } catch (e) {
      cleanupRecording();
      setRecording(false);
      toast(`Recording failed: ${e.message}`);
    }
  };
  const stopRecording = () => { try { recorderRef.current?.stop(); } catch {} };
  useEffect(() => () => { stopRecording(); cleanupRecording(); }, [cleanupRecording]);

  const loadYoutube = async () => {
    if (!ytUrl.trim()) return;
    setYtLoading(true);
    try { pickSource(await API.soundTools.youtube(ytUrl.trim()), 'YouTube'); setYtUrl(''); }
    catch (e) { toast(`YouTube import failed: ${e.message}`); }
    finally { setYtLoading(false); }
  };

  // ── Transport / Save ─────────────────────────────────────────────────────────
  const playAll = () => { selEndRef.current = null; wsRef.current?.playPause(); };
  const playSelection = () => {
    const ws = wsRef.current, r = regionRef.current;
    if (!ws || !r) return;
    selEndRef.current = r.end;
    ws.setTime(r.start);
    ws.play();
  };
  const resetTrim = () => {
    if (regionRef.current) { regionRef.current.setOptions({ start: 0, end: duration }); setTrim({ start: 0, end: duration }); }
  };

  const doSave = async (overwrite) => {
    const clean = cleanName(name);
    if (!clean) { toast('Please enter a name'); return; }
    setSaving(true); setOverwriteAsk(false);
    try {
      const mp3 = await API.soundTools.render(sourceBlob, { start: trim.start, end: trim.end, gain: gainDb, fadeIn, fadeOut });
      const file = new File([mp3], `${clean}.mp3`, { type: 'audio/mpeg' });
      if (overwrite) await API.sound.remove(clean).catch(() => {});
      await API.sound.upload(file, clean);
      toast(`Saved ${clean}.mp3`);
      onSaved?.();
    } catch (e) {
      toast(`Save failed: ${e.message}`);
    } finally { setSaving(false); }
  };
  const onSaveClick = () => {
    const clean = cleanName(name);
    if (!clean) { toast('Please enter a name'); return; }
    if (existingNames.includes(clean)) setOverwriteAsk(true);
    else doSave(false);
  };

  const hasSource = !!sourceBlob && !recording;

  return (
    <div className="content-narrow sound-editor-screen">
      <div className="page-head media-page-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-icon btn-ghost" onClick={onClose} title="Back to Sound Library">
            <Icon name="chevron-left" size={18}/>
          </button>
          <div>
            <div className="page-title">Sound Editor</div>
            <div className="page-sub">{botName} — Sound Library{sourceLabel ? ` · ${sourceLabel}` : ''}</div>
          </div>
        </div>
      </div>

      {/* Quellen direkt im Editor */}
      <div className="sound-source-bar">
        <label className="btn" style={{ cursor: 'pointer' }}>
          <Icon name="upload" size={13}/> From device
          <input type="file" hidden accept="audio/*"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pickSource(f, f.name); }}/>
        </label>

        <div className="sound-source-rec">
          <div className="seg">
            <button type="button" className={'seg-btn' + (recMode === 'mic' ? ' on' : '')}
              onClick={() => setRecMode('mic')} disabled={recording}>Mic</button>
            <button type="button" className={'seg-btn' + (recMode === 'system' ? ' on' : '')}
              onClick={() => setRecMode('system')} disabled={recording}>System</button>
          </div>
          {!recording ? (
            <button className="btn" onClick={() => startRecording(recMode)}>
              <Icon name="mic" size={13}/> Record
            </button>
          ) : (
            <button className="btn btn-danger" onClick={stopRecording}>
              <Icon name="stop" size={13}/> Stop
            </button>
          )}
        </div>

        <div className="sound-source-yt">
          <input className="input" placeholder="YouTube link…" value={ytUrl}
            onChange={(e) => setYtUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') loadYoutube(); }} disabled={recording}/>
          <button className="btn" onClick={loadYoutube} disabled={ytLoading || !ytUrl.trim() || recording}>
            {ytLoading ? 'Loading…' : 'Load'}
          </button>
        </div>
      </div>

      {/* Waveform / Live-Aufnahme */}
      <div className="sound-wave-card">
        {recording ? (
          <>
            <canvas ref={canvasRef} className="sound-rec-canvas"/>
            <div className="sound-transport">
              <span className="rec-dot">● recording…</span>
              <button className="btn btn-danger" onClick={stopRecording} style={{ marginLeft: 'auto' }}>
                <Icon name="stop" size={13}/> Stop
              </button>
            </div>
          </>
        ) : hasSource ? (
          <>
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
          </>
        ) : loadingSource ? (
          <div className="empty"><div>Loading…</div></div>
        ) : (
          <div className="empty" style={{ padding: '28px 0', color: 'var(--text-dim)' }}>
            <div>Pick a file, record, or load a YouTube link above to start.</div>
          </div>
        )}
      </div>

      <div className="sound-controls">
        <label className="sound-ctrl">
          <span>Volume <strong>{gainDb > 0 ? `+${gainDb}` : gainDb} dB</strong></span>
          <input type="range" min={-20} max={12} step={1} value={gainDb}
            onChange={(e) => setGainDb(Number(e.target.value))} disabled={!hasSource}/>
        </label>
        <label className="sound-ctrl">
          <span>Fade in <strong>{fadeIn.toFixed(1)}s</strong></span>
          <input type="range" min={0} max={5} step={0.1} value={fadeIn}
            onChange={(e) => setFadeIn(Number(e.target.value))} disabled={!hasSource}/>
        </label>
        <label className="sound-ctrl">
          <span>Fade out <strong>{fadeOut.toFixed(1)}s</strong></span>
          <input type="range" min={0} max={5} step={0.1} value={fadeOut}
            onChange={(e) => setFadeOut(Number(e.target.value))} disabled={!hasSource}/>
        </label>
      </div>

      <div className="sound-save-row">
        <div className="sound-name-field">
          <input className="input" placeholder="sound name" value={name} onChange={(e) => setName(e.target.value)}/>
          <span className="sound-name-suffix">.mp3</span>
        </div>
        <button className="btn btn-primary" onClick={onSaveClick} disabled={!ready || saving || !cleanName(name)}>
          <Icon name="check" size={13}/> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="sound-hint">Lowercase a–z and 0–9 only. Volume boost above 0 dB is applied on save.</div>

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
