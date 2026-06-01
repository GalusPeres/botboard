// In-memory ring buffer for Botboard's own activity log.
// Same pattern as the bots' logBuffer — push/recent/subscribe.

import { EventEmitter } from 'events';

const MAX = 500;
const buffer = [];
const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export function logActivity(text, level = 'info') {
  const entry = {
    time: new Date().toISOString(),
    level,
    src: 'botboard',
    text,
  };
  buffer.push(entry);
  if (buffer.length > MAX) buffer.shift();
  emitter.emit('log', entry);
  return entry;
}

export function recentActivity(limit = 200) {
  if (limit >= buffer.length) return buffer.slice();
  return buffer.slice(buffer.length - limit);
}

export function subscribeActivity(handler) {
  emitter.on('log', handler);
  return () => emitter.off('log', handler);
}
