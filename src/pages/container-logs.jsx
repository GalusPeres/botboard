// Live logs page for container modules. Polls `docker logs` (containers have
// no SSE stream like the HTTP bots), but looks/behaves like the bot Live Logs:
// auto-scroll, live indicator, Pause — no manual "Refresh".
import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../ui/components.jsx';
import { usePoll } from '../lib/hooks.js';
import * as API from '../lib/api.js';

const ContainerLogsScreen = ({ botId }) => {
  const { data, error } = usePoll(() => API.moduleApi.containerLogs(botId), 3000, [botId]);
  const [paused, setPaused] = useState(false);
  const [visibleLines, setVisibleLines] = useState([]);
  const scrollRef = useRef(null);

  const lines = (data?.lines || []).filter((line, i, arr) => line.length || i < arr.length - 1);

  useEffect(() => {
    if (!paused) setVisibleLines(lines);
  }, [data, paused]);

  useEffect(() => {
    if (paused) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibleLines, paused]);

  return (
    <div className="content-narrow">
      <div className="page-head">
        <div>
          <div className="page-title">Live Logs</div>
          <div className="page-sub">
            Container output.{' '}
            <span className="dot" style={{ background: paused ? 'var(--amber)' : 'var(--green)' }}/>{' '}
            {paused ? 'paused' : 'live'} - {visibleLines.length} lines
          </div>
        </div>
        <div className="page-actions">
          <button className="btn" type="button" onClick={() => setPaused((v) => !v)}>
            {paused ? <><Icon name="play" size={13}/> Resume</> : <><Icon name="pause" size={13}/> Pause</>}
          </button>
        </div>
      </div>

      {error && <div className="settings-notice registry-error" style={{ marginBottom: 14 }}>Logs failed: {error.message}</div>}
      <div className="logs" ref={scrollRef}>
        {visibleLines.length === 0
          ? <div style={{ color: 'var(--text-muted)', padding: 14 }}>No output yet.</div>
          : visibleLines.map((line, index) => (
              <div key={index} className="log-msg" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {line || '\u00a0'}
              </div>
            ))}
      </div>
    </div>
  );
};

export const page = {
  kind: 'container-logs',
  render: (c) => <ContainerLogsScreen botId={c.parentBot}/>,
};
