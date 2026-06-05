// Control page: start / stop / restart a container module via the Docker socket.
import React from 'react';
import { Icon, Tag } from '../ui/components.jsx';

const ControlScreen = ({ botId, botName, status, restartEnabled, onStart, onStop, onRestart }) => {
  const online = status === 'online';
  return (
    <div className="content-narrow">
      <div className="page-head">
        <div>
          <div className="page-title">Control</div>
          <div className="page-sub">Start, stop or restart {botName}.</div>
        </div>
        <Tag kind={online ? 'success' : 'error'}><span className="dot"/> {status || 'offline'}</Tag>
      </div>

      <div className="card" style={{ padding: 18 }}>
        {!restartEnabled ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Container control is disabled. Set <code>DOCKER_RESTART_ENABLED=true</code> and mount the Docker socket.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {!online && (
              <button className="btn btn-primary" type="button" onClick={() => onStart(botId)}>
                <Icon name="play" size={14}/> Start
              </button>
            )}
            {online && (
              <>
                <button className="btn" type="button" onClick={() => onStop(botId)}>
                  <Icon name="stop" size={14}/> Stop
                </button>
                <button className="btn" type="button" onClick={() => onRestart(botId)}>
                  <Icon name="refresh" size={14}/> Restart
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const page = {
  kind: 'control',
  render: (c) => (
    <ControlScreen
      botId={c.parentBot}
      botName={c.botName}
      status={c.botStatus[c.parentBot]}
      restartEnabled={c.restartEnabled}
      onStart={c.startBot}
      onStop={c.stopBot}
      onRestart={(b) => c.setRestartConfirm(b)}
    />
  ),
};
