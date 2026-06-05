// Statistik-Seite (sound/music bespoke + generisch).
import React, { useState } from 'react';
import { Icon, Tag } from '../ui/components.jsx';
import { dashboardBotName } from '../lib/botIdentity.js';
import { usePoll } from '../lib/hooks.js';
import * as API from '../lib/api.js';

const containerStatsCache = new Map();

function uptime(ms) {
  if (!Number.isFinite(ms)) return 'not available';
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export const StatsScreen = ({ bot, sounds = [], botStatus, botInfo, statusData, queueLength = 0, apiStats = null }) => {
  const isSound = bot === 'sound';
  const totalPlays = sounds.reduce((sum, sound) => sum + (sound.plays || 0), 0);
  const topSounds = [...sounds].filter((sound) => sound.plays > 0).sort((a, b) => b.plays - a.plays).slice(0, 8);
  const lavalink = statusData?.music?.lavalink;
  const status = isSound ? botStatus?.sound : botStatus?.music;
  const name = isSound ? dashboardBotName('sound', botInfo) : dashboardBotName('music', botInfo);
  const botData = isSound ? statusData?.sound : statusData?.music;
  const fallbackCards = isSound
    ? [
        { key: 'sounds', label: 'Sound files', value: sounds.length },
        { key: 'plays', label: 'Recorded plays', value: totalPlays.toLocaleString() },
        { key: 'uptime', label: 'Uptime', value: uptime(botData?.uptimeMs) },
        { key: 'status', label: 'Status', value: status || 'offline' },
      ]
    : [
        { key: 'players', label: 'Active players', value: statusData?.music?.playerCount ?? '-' },
        { key: 'queue', label: 'Current queue', value: queueLength },
        { key: 'uptime', label: 'Uptime', value: uptime(botData?.uptimeMs) },
        { key: 'status', label: 'Status', value: status || 'offline' },
      ];
  const cards = apiStats?.cards?.length ? apiStats.cards : fallbackCards;
  const health = apiStats?.health?.length
    ? apiStats.health
    : [
        { key: 'discord', label: name, status: status === 'online' ? 'ok' : 'warn', detail: uptime(botData?.uptimeMs) },
        ...(!isSound ? [{ key: 'lavalink', label: 'Lavalink', status: lavalink?.connected ? 'ok' : 'warn', detail: lavalink?.ping == null ? '' : `${lavalink.ping} ms` }] : []),
      ];

  return (
    <div className="content-narrow">
      <div className="page-head">
        <div>
          <div className="page-title">Statistics</div>
          <div className="page-sub">Live data from this bot API. Historical analytics are not recorded yet.</div>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        {cards.slice(0, 8).map((card) => (
          <div className="stat-card" key={card.key || card.label}>
            <div className="stat-label">{card.label}</div>
            <div className="stat-value">{String(card.value ?? '-')}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-header"><div className="card-title">{isSound ? 'Top sounds - recorded plays' : 'Playback status'}</div></div>
          {isSound && topSounds.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>No persisted play counts are reported by this bot.</div>
          ) : !isSound ? (
            <div style={{ color: 'var(--text-muted)' }}>
              The current player and editable queue are available on the Music Player page.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {topSounds.map((sound, index) => (
                <div key={sound.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-dim)', width: 16 }}>{index + 1}</span>
                  <span style={{ flex: 1, fontFamily: 'var(--font-mono)' }}>{sound.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{sound.plays}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Health</div></div>
          {health.map((item) => (
            <div key={item.key || item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{item.label}</span>
              <Tag kind={item.status === 'ok' || item.status === 'online' || item.status === 'connected' ? 'success' : item.status === 'neutral' ? 'info' : 'error'}>
                {item.status}{item.detail ? ` - ${item.detail}` : ''}
              </Tag>
            </div>
          ))}
        </div>
      </div>
      {apiStats?.tables?.filter((table) => table.rows?.length).map((table) => (
        <div className="card" style={{ marginTop: 16 }} key={table.key || table.label}>
          <div className="card-header"><div className="card-title">{table.label}</div></div>
          <div className="generic-table">
            {table.rows.slice(0, 20).map((row, index) => (
              <div className="generic-table-row" key={index}>
                {Object.entries(row).slice(0, 5).map(([key, value]) => (
                  <div key={key}>
                    <span>{key}</span>
                    <strong>{String(value ?? '-')}</strong>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export const GenericStatsScreen = ({ botId, botName }) => {
  // Screen bleibt dank CSS-hidden gemountet — kein Remount beim Seitenwechsel,
  // daher kein Loading-Flash. Daten bleiben im lokalen State erhalten.
  const { data: stats, error, loading, reload } = usePoll(
    () => API.moduleApi.stats(botId),
    5000,
    [botId],
  );
  const [refreshing, setRefreshing] = useState(false);
  if (stats) containerStatsCache.set(botId, stats);
  const visibleStats = stats || containerStatsCache.get(botId);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="content-narrow">
      <div className="page-head">
        <div>
          <div className="page-title">Statistics</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-sm" type="button" onClick={refresh} disabled={refreshing}>
            <Icon name="refresh" size={13}/> {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>
      {error && <div className="settings-notice registry-error">Stats failed: {error.message}</div>}
      {loading && !visibleStats && (
        <div className="empty">
          <div>Measuring container statistics...</div>
        </div>
      )}
      {visibleStats && (
        <>
          <div className="grid grid-4" style={{ marginBottom: 16 }}>
            {(visibleStats.cards || []).map((card) => (
              <div className="stat-card" key={card.key || card.label}>
                <div className="stat-label">{card.label}</div>
                <div className={`stat-value${card.key === 'mem' ? ' stat-value-compact' : ''}`}>{String(card.value ?? '-')}</div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">{botName} health</div></div>
            {(visibleStats.health || []).map((item) => (
              <div key={item.key || item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{item.label}</span>
                <Tag kind={item.status === 'ok' ? 'success' : item.status === 'neutral' ? 'info' : 'error'}>
                  {item.status}{item.detail ? ` - ${item.detail}` : ''}
                </Tag>
              </div>
            ))}
            {(!visibleStats.health || visibleStats.health.length === 0) && <div style={{ color: 'var(--text-muted)' }}>No health entries reported.</div>}
          </div>
          {(visibleStats.tables || []).filter((table) => table.rows?.length).map((table) => (
            <div className="card" style={{ marginTop: 16 }} key={table.key || table.label}>
              <div className="card-header"><div className="card-title">{table.label}</div></div>
              <div className="generic-table">
                {table.rows.slice(0, 20).map((row, index) => (
                  <div className="generic-table-row" key={index}>
                    {Object.entries(row).slice(0, 5).map(([key, value]) => (
                      <div key={key}>
                        <span>{key}</span>
                        <strong>{String(value ?? '-')}</strong>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};


export const page = {
  kind: 'stats',
  render: (c) => (
    c.parentBot === 'sound' ? (
      <StatsScreen bot="sound" sounds={c.sounds} botStatus={c.botStatus} botInfo={c.botInfo} statusData={c.statusData} apiStats={c.soundStats}/>
    ) : c.parentBot === 'music' ? (
      <StatsScreen bot="music" sounds={c.sounds} botStatus={c.botStatus} botInfo={c.botInfo} statusData={c.statusData} queueLength={c.playerState.queue.length} apiStats={c.musicStats}/>
    ) : (
      <GenericStatsScreen botId={c.parentBot} botName={c.botName}/>
    )
  ),
};
