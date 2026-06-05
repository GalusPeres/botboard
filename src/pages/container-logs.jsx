// Container logs page: tails `docker logs` (polled). Used by container-type
// modules, which have no SSE log stream like the HTTP bots do.
import React from 'react';
import { Icon } from '../ui/components.jsx';
import { usePoll } from '../lib/hooks.js';
import * as API from '../lib/api.js';

const ContainerLogsScreen = ({ botId, botName }) => {
  const { data, error, reload } = usePoll(() => API.moduleApi.containerLogs(botId), 3000, [botId]);
  const text = (data?.lines || []).join('\n').trim();

  return (
    <div className="content-narrow">
      <div className="page-head">
        <div>
          <div className="page-title">Logs</div>
          <div className="page-sub">Live container output for {botName}.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-sm" type="button" onClick={reload}>
            <Icon name="refresh" size={13}/> Refresh
          </button>
        </div>
      </div>
      {error && <div className="settings-notice registry-error">Logs failed: {error.message}</div>}
      <pre className="logs">{text || 'No output yet.'}</pre>
    </div>
  );
};

export const page = {
  kind: 'container-logs',
  render: (c) => <ContainerLogsScreen botId={c.parentBot} botName={c.botName}/>,
};
