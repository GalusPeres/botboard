import express from 'express';
import session from 'express-session';
import FileStoreFactory from 'session-file-store';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { requireAuth } from './auth.js';
import meRoutes from './routes/me.js';
import authRoutes from './routes/auth.js';
import botsRoutes from './routes/bots.js';
import proxyRoutes from './routes/proxy.js';
import logsRoutes from './routes/logs.js';
import usersRoutes from './routes/users.js';
import accessRoutes from './routes/access.js';
import filesRoutes from './routes/files.js';
import soundToolsRoutes from './routes/soundTools.js';
import soundArchiveRoutes from './routes/soundArchive.js';
import botboardRoutes from './routes/botboard.js';
import { startGateway } from './discordGateway.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');
const FileStore = FileStoreFactory(session);

const app = express();
app.set('trust proxy', 1);
// Skip gzip for server-sent event streams so log/status events flush to the
// browser immediately instead of being buffered by the compressor.
app.use(compression({
  filter: (req, res) => {
    const type = String(res.getHeader('Content-Type') || '');
    if (type.includes('text/event-stream')) return false;
    return compression.filter(req, res);
  },
}));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(
  session({
    store: new FileStore({ path: config.sessionDir, ttl: 7 * 24 * 60 * 60, retries: 0 }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes());
app.use('/api/me', meRoutes());

app.use('/api', requireAuth);

app.use('/api/bots', botsRoutes());
app.use('/api/logs', logsRoutes());
app.use('/api/users', usersRoutes());
app.use('/api/access', accessRoutes());
app.use('/api/files', filesRoutes());
app.use('/api/sound-tools', soundToolsRoutes());
app.use('/api/sound-archive', soundArchiveRoutes());
app.use('/api/botboard-config', botboardRoutes());
app.use('/api/bots', proxyRoutes());

app.use(express.static(distDir, { maxAge: '1h', index: false }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(distDir, 'index.html'));
});

app.use((err, req, res, _next) => {
  console.error('[server]', err);
  res.status(err.status || 500).json({ error: err.message || 'internal error' });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Botboard listening on :${config.port}`);
});

// Discord-Gateway (Bot Online + #info-Befehl). No-op ohne DISCORD_BOT_TOKEN.
startGateway();
