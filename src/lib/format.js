// Pure view-model + formatting helpers shared across the dashboard.
// No React, no side effects — safe to import anywhere.

export function msToClock(ms) {
  if (!ms || ms < 0) return '0:00';
  const sec = Math.round(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function formatBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function relativeTime(ms) {
  if (!ms) return 'unknown';
  const diff = Date.now() - ms;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days < 1) return 'today';
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)} mo`;
}

// Map an API track to the compact view model used by the dashboard.
export function adaptTrack(t) {
  if (!t) return null;
  return {
    id: t.id,
    title: t.title || 'Unknown',
    artist: t.author || 'Unknown',
    duration: msToClock(t.duration),
    durationMs: t.duration,
    source: t.source === 'spotify' ? 'Spotify' : 'YouTube',
    cover: (t.title || '??').slice(0, 2).toUpperCase(),
    artwork: t.artwork || null,
    uri: t.uri,
    requestedBy: t.requestedBy?.username || null,
  };
}

export function adaptSound(s) {
  const [m, sec] = (s.duration || '0:00').split(':').map(Number);
  return {
    id: s.name,
    name: s.name,
    duration: s.duration,
    durationSec: (m || 0) * 60 + (sec || 0),
    size: formatBytes(s.size),
    sizeBytes: s.size || 0,
    plays: s.plays,
    addedMs: s.added || 0,
  };
}

export function normalizeLog(entry) {
  const timestamp = entry.time ? new Date(entry.time).getTime() : Date.now();
  return {
    ...entry,
    src: entry.bot || entry.src || 'core',
    timestamp,
    time: new Date(timestamp).toTimeString().slice(0, 8),
  };
}
