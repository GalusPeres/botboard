// Sound-Editor: eine eigene Page (gleicher Look wie Library/Files). Die Quellen
// (Upload, Aufnahme von Mikro/System-Sound, YouTube) sind direkt im Editor
// integriert. Aufnahmen bauen eine LIVE-Waveform auf (wie Audacity); danach gibt
// es eine Waveform mit Schnitt-Auswahl + Timeline, Lautstärke + Fades. Trim
// läuft lokal im Browser (sofort, mit Undo). Gespeichert wird als MP3 in die
// Sound-Library (mit Bestätigungs-/Überschreib-Modal). Der finale Render
// (Trim/Lautstärke→MP3) + YouTube laufen server-seitig via ffmpeg/yt-dlp.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import { Icon, SearchField } from '../ui/components.jsx';
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

// Audio-Blob lokal in einen AudioBuffer dekodieren.
async function blobToAudioBuffer(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    ctx.close().catch(() => {});
  }
}
// Ausschnitt [start,end] eines AudioBuffers herauskopieren.
function sliceBuffer(buf, start, end) {
  const rate = buf.sampleRate;
  const s = Math.max(0, Math.floor(start * rate));
  const e = Math.min(buf.length, Math.floor(end * rate));
  const len = Math.max(1, e - s);
  const out = new AudioBuffer({ length: len, numberOfChannels: buf.numberOfChannels, sampleRate: rate });
  for (let ch = 0; ch < buf.numberOfChannels; ch++) out.copyToChannel(buf.getChannelData(ch).subarray(s, e), ch);
  return out;
}
// AudioBuffer → 16-bit PCM WAV-Blob (verlustfrei, fürs lokale Bearbeiten).
function audioBufferToWav(buffer) {
  const numCh = buffer.numberOfChannels, rate = buffer.sampleRate;
  const dataLen = buffer.length * numCh * 2;
  const ab = new ArrayBuffer(44 + dataLen);
  const view = new DataView(ab);
  let p = 0;
  const str = (s) => { for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i)); };
  const u32 = (v) => { view.setUint32(p, v, true); p += 4; };
  const u16 = (v) => { view.setUint16(p, v, true); p += 2; };
  str('RIFF'); u32(36 + dataLen); str('WAVE'); str('fmt '); u32(16); u16(1); u16(numCh);
  u32(rate); u32(rate * numCh * 2); u16(numCh * 2); u16(16); str('data'); u32(dataLen);
  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(p, v < 0 ? v * 0x8000 : v * 0x7fff, true); p += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

export const SoundEditorScreen = ({ initialName = null, botName, existingNames = [], onClose, onSaved, setToast }) => {
  const toast = useCallback((msg) => setToast?.({ msg, id: Date.now() }), [setToast]);
  const waveRef = useRef(null);
  const wsRef = useRef(null);
  const regionsRef = useRef(null);
  const regionRef = useRef(null);
  const selTimerRef = useRef(null);  // stoppt die Auswahl-Wiedergabe am Ende
  const undoRef = useRef([]);        // vorherige Quellen (für Undo nach Trim)

  // Live-Aufnahme
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const historyRef = useRef([]);
  const recTimerRef = useRef(null);

  const [sourceBlob, setSourceBlob] = useState(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [loadingSource, setLoadingSource] = useState(!!initialName);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [trim, setTrim] = useState({ start: 0, end: 0 });
  const [canUndo, setCanUndo] = useState(false);

  const [recMode, setRecMode] = useState('mic'); // 'mic' | 'system'
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [ytUrl, setYtUrl] = useState('');
  const [ytLoading, setYtLoading] = useState(false);
  const [trimming, setTrimming] = useState(false);

  const [gainDb, setGainDb] = useState(0);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);

  const [name, setName] = useState(cleanName(initialName) || '');
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(null); // null | { clean, exists }
  const [dirty, setDirty] = useState(false);            // ungespeicherte Änderungen
  const [confirmClose, setConfirmClose] = useState(false);

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
      height: 120,
      normalize: true,           // füllt die Höhe wie die Live-Aufnahme
      waveColor: '#9dda4f',
      progressColor: '#9dda4f',
      cursorColor: '#e6edf3',
      barWidth: 2, barGap: 1, barRadius: 2,
    });
    ws.registerPlugin(TimelinePlugin.create({ height: 16, style: { color: '#7a8595', fontSize: '10px' } }));
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
      clearTimeout(selTimerRef.current);
      if (ws.isPlaying()) ws.pause(); // beim Ändern nicht weiterlaufen
    });
    ws.on('play', () => setPlaying(true));
    ws.on('pause', () => { setPlaying(false); clearTimeout(selTimerRef.current); });
    ws.on('finish', () => setPlaying(false));

    ws.loadBlob(sourceBlob).catch((e) => toast(`Decode failed: ${e.message}`));
    return () => { clearTimeout(selTimerRef.current); try { ws.destroy(); } catch {} wsRef.current = null; };
  }, [sourceBlob, recording, toast]);

  // Vorschau-Lautstärke an Gain koppeln (Boost >0 dB nur beim Export hörbar).
  useEffect(() => { if (wsRef.current) wsRef.current.setVolume(Math.min(1, 10 ** (gainDb / 20))); }, [gainDb, ready]);

  // ── Aufnahme ────────────────────────────────────────────────────────────────
  const stopTracks = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  const cleanupRecording = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    recTimerRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    historyRef.current = [];
    stopTracks();
  }, []);

  // Live-Waveform: ganze Aufnahme sichtbar, baut sich auf und staucht sich dann.
  const drawLive = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i] - 128) / 128; if (v > peak) peak = v; }
    historyRef.current.push(peak);

    const W = canvas.width, H = canvas.height, mid = H / 2;
    const step = 3; // 2px Balken + 1px Lücke (wie WaveSurfer barWidth/barGap)
    const maxBars = Math.max(1, Math.floor(W / step));
    const hist = historyRef.current;
    const n = hist.length;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#9dda4f';
    // Balken wie im Editor: Amplitude (0..1) → volle Höhe, von der Mitte aus,
    // 2px breit mit 1px Radius. Skalierung fest → sieht immer gleich aus.
    const bar = (x, p) => {
      const h = Math.max(2, Math.min(H, p * H));
      const y = mid - h / 2;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, 2, h, 1); ctx.fill(); }
      else ctx.fillRect(x, y, 2, h);
    };
    if (n <= maxBars) {
      for (let i = 0; i < n; i++) bar(i * step, hist[i]); // links → rechts aufbauen
    } else {
      for (let b = 0; b < maxBars; b++) {               // ganze Aufnahme zusammenstauchen
        const s = Math.floor((b * n) / maxBars), e = Math.floor(((b + 1) * n) / maxBars);
        let p = 0; for (let i = s; i < e; i++) if (hist[i] > p) p = hist[i];
        bar(b * step, p);
      }
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
        stream.getVideoTracks().forEach((t) => t.stop());
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: RAW_AUDIO });
      }
      streamRef.current = stream;

      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(analyser); // nicht an Ausgabe → kein Echo
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      historyRef.current = [];

      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const chunks = [];
      const mr = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 192000 });
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        cleanupRecording();
        setRecording(false);
        const blob = new Blob(chunks, { type: mime });
        if (blob.size) { undoRef.current = []; setCanUndo(false); setDirty(true); pickSource(blob, mode === 'system' ? 'System recording' : 'Mic recording'); }
      };
      recorderRef.current = mr;

      setSourceBlob(null);
      setReady(false);
      setRecording(true);
      setRecSeconds(0);
      mr.start();
      const startedAt = Date.now();
      recTimerRef.current = setInterval(() => setRecSeconds((Date.now() - startedAt) / 1000), 200);
      requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (canvas) { canvas.width = canvas.offsetWidth; canvas.height = 120; }
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
    try { undoRef.current = []; setCanUndo(false); setDirty(true); pickSource(await API.soundTools.youtube(ytUrl.trim()), 'YouTube'); setYtUrl(''); }
    catch (e) { toast(`YouTube import failed: ${e.message}`); }
    finally { setYtLoading(false); }
  };
  const onUploadFile = (f) => { if (f) { undoRef.current = []; setCanUndo(false); setDirty(true); pickSource(f, f.name); } };

  // Zurück: bei ungespeicherten Änderungen erst nachfragen.
  const handleClose = () => { if (dirty) setConfirmClose(true); else onClose?.(); };

  // ── Transport ────────────────────────────────────────────────────────────────
  const playAll = () => {
    const ws = wsRef.current; if (!ws) return;
    clearTimeout(selTimerRef.current);
    ws.playPause();
  };
  const playSelection = () => {
    const ws = wsRef.current, r = regionRef.current;
    if (!ws || !r) return;
    clearTimeout(selTimerRef.current);
    if (ws.isPlaying()) { ws.pause(); return; }
    ws.setTime(r.start);
    ws.play();
    // robust per Timer am Auswahl-Ende stoppen (kein Verlass auf stale timeupdate).
    selTimerRef.current = setTimeout(() => { try { ws.pause(); } catch {} }, Math.max(60, (r.end - r.start) * 1000));
  };
  const resetTrim = () => {
    if (regionRef.current) { regionRef.current.setOptions({ start: 0, end: duration }); setTrim({ start: 0, end: duration }); }
  };
  // Lokaler Trim: Ausschnitt sofort herausschneiden (kein Server), mit Undo.
  const doTrim = async () => {
    if (!sourceBlob || trim.end - trim.start < 0.05) return;
    setTrimming(true);
    try {
      const ab = await blobToAudioBuffer(sourceBlob);
      const wav = audioBufferToWav(sliceBuffer(ab, trim.start, trim.end));
      undoRef.current.push({ blob: sourceBlob, label: sourceLabel });
      setCanUndo(true);
      setDirty(true);
      const base = sourceLabel.replace(/\s*\(trimmed\)$/, '');
      pickSource(wav, `${base} (trimmed)`);
    } catch (e) {
      toast(`Trim failed: ${e.message}`);
    } finally {
      setTrimming(false);
    }
  };
  const undoTrim = () => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    setCanUndo(undoRef.current.length > 0);
    pickSource(prev.blob, prev.label);
  };

  // ── Speichern ─────────────────────────────────────────────────────────────────
  const onSaveClick = async () => {
    const clean = cleanName(name);
    if (!clean) { toast('Please enter a name'); return; }
    let names = existingNames;
    try { names = (await API.sound.list()).map((s) => s.name); } catch { /* fallback */ }
    setConfirmSave({ clean, exists: names.includes(clean) });
  };
  const doSave = async () => {
    const target = confirmSave;
    if (!target) return;
    setSaving(true);
    try {
      const mp3 = await API.soundTools.render(sourceBlob, { start: trim.start, end: trim.end, gain: gainDb, fadeIn, fadeOut });
      const file = new File([mp3], `${target.clean}.mp3`, { type: 'audio/mpeg' });
      if (target.exists) await API.sound.remove(target.clean).catch(() => {});
      await API.sound.upload(file, target.clean);
      toast(`Saved ${target.clean}.mp3`);
      setConfirmSave(null);
      onSaved?.();
    } catch (e) {
      toast(`Save failed: ${e.message}`);
      setConfirmSave(null);
    } finally {
      setSaving(false);
    }
  };

  const hasSource = !!sourceBlob && !recording;
  const fullSelected = trim.start <= 0.001 && trim.end >= duration - 0.001;

  return (
    <div className="content-narrow sound-editor-screen">
      <div className="page-head media-page-head">
        <div>
          <div className="sound-topbar">
            <button type="button" className="btn btn-sm" onClick={handleClose}>
              <Icon name="chevron-left" size={14}/> Sound Library
            </button>
          </div>
          <div className="page-title">Sound Editor</div>
        </div>
      </div>

      {/* Quellen direkt im Editor */}
      <div className="sound-source-bar">
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
          <SearchField value={ytUrl} placeholder="YouTube link…" type="text" className="sound-yt-search"
            onChange={(e) => setYtUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') loadYoutube(); }}/>
          <button className="btn" onClick={loadYoutube} disabled={ytLoading || !ytUrl.trim() || recording}>
            {ytLoading ? 'Loading…' : 'Load'}
          </button>
        </div>

        <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
          <Icon name="upload" size={13}/> Upload
          <input type="file" hidden accept="audio/*"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onUploadFile(f); }}/>
        </label>
      </div>

      {/* EINE Ansicht: Wave-Bereich (immer gleich hoch) + immer dieselbe Transport-
          Zeile. Bei Aufnahme/ohne Quelle sind die Buttons nur ausgegraut. */}
      <div className="sound-wave-card">
        {recording ? (
          <>
            <canvas ref={canvasRef} className="sound-rec-canvas"/>
            <div className="sound-rec-spacer"/>{/* reserviert die Timeline-Höhe → gleiche Box */}
          </>
        ) : hasSource ? (
          <div ref={waveRef} className="sound-wave"/>
        ) : (
          <div className="empty">{loadingSource ? 'Loading…' : 'Pick a file, record, or load a YouTube link above to start.'}</div>
        )}

        <div className="sound-transport">
          <button className="btn" onClick={playAll} disabled={recording || !ready}>
            <Icon name={playing ? 'pause' : 'play'} size={13}/> {playing ? 'Pause' : 'Play'}
          </button>
          <button className="btn" onClick={playSelection} disabled={recording || !ready}>
            <Icon name="play" size={13}/> Selection
          </button>
          <span className="sound-times">
            {recording
              ? <><span className="rec-dot">●</span> recording… {fmtTime(recSeconds)}</>
              : <>{fmtTime(trim.start)} – {fmtTime(trim.end)} <span style={{ opacity: 0.5 }}>/ {fmtTime(duration)}</span></>}
          </span>
          <button className="btn btn-sm" onClick={doTrim} disabled={recording || !ready || trimming || fullSelected}
            style={{ marginLeft: 'auto' }}>
            <Icon name="edit" size={12}/> {trimming ? 'Trimming…' : 'Trim'}
          </button>
          {canUndo && (
            <button className="btn btn-sm" onClick={undoTrim} disabled={recording || !ready || trimming}>
              <Icon name="rotate" size={12}/> Undo
            </button>
          )}
          <button className="btn btn-sm" onClick={resetTrim} disabled={recording || !ready || fullSelected}>
            Reset
          </button>
        </div>
      </div>

      <div className="sound-controls">
        <label className="sound-ctrl">
          <span>Volume <strong>{gainDb > 0 ? `+${gainDb}` : gainDb} dB</strong></span>
          <input type="range" min={-20} max={12} step={1} value={gainDb}
            onChange={(e) => { setGainDb(Number(e.target.value)); setDirty(true); }} disabled={!hasSource}/>
        </label>
        <label className="sound-ctrl">
          <span>Fade in <strong>{fadeIn.toFixed(1)}s</strong></span>
          <input type="range" min={0} max={5} step={0.1} value={fadeIn}
            onChange={(e) => { setFadeIn(Number(e.target.value)); setDirty(true); }} disabled={!hasSource}/>
        </label>
        <label className="sound-ctrl">
          <span>Fade out <strong>{fadeOut.toFixed(1)}s</strong></span>
          <input type="range" min={0} max={5} step={0.1} value={fadeOut}
            onChange={(e) => { setFadeOut(Number(e.target.value)); setDirty(true); }} disabled={!hasSource}/>
        </label>
      </div>

      <div className="sound-save-row">
        <div className="sound-name-field">
          <input className="input" placeholder="sound name" value={name} onChange={(e) => setName(e.target.value)}/>
          <span className="sound-name-suffix">.mp3</span>
        </div>
        <button className="btn btn-primary" onClick={onSaveClick} disabled={!ready || saving || !cleanName(name)}>
          <Icon name="check" size={13}/> Save
        </button>
      </div>

      {confirmClose && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmClose(false); }}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Discard changes?</h3>
            <p>Your edits haven't been saved and will be lost.</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmClose(false)}>Keep editing</button>
              <button className="btn btn-danger" onClick={() => { setConfirmClose(false); onClose?.(); }}>
                <Icon name="trash" size={13}/> Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmSave && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmSave(null); }}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <h3>{confirmSave.exists ? 'Overwrite sound?' : 'Save sound?'}</h3>
            <p>
              <strong>{confirmSave.clean}.mp3</strong>{' '}
              {confirmSave.exists ? 'already exists and will be replaced.' : 'will be saved to the library.'}
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmSave(null)} disabled={saving}>Cancel</button>
              <button className={'btn ' + (confirmSave.exists ? 'btn-danger' : 'btn-primary')} onClick={doSave} disabled={saving}>
                <Icon name="check" size={13}/> {saving ? 'Saving…' : confirmSave.exists ? 'Overwrite' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
