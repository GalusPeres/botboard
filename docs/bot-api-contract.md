# Botboard Bot API Contract

Botboard is an optional dashboard. A bot must continue to run normally when
Botboard is stopped or not configured.

## Connection

Each bot runs its own HTTP API on a configurable port. Requests from Botboard
send:

```http
Authorization: Bearer <BOT_API_TOKEN>
X-Dashboard-User-Id: <discord user id>
```

`BOT_API_TOKEN` is configured independently in Botboard and in each bot
container. A bot may omit its API entirely when it is not connected to
Botboard.

## Common Module Endpoints

Every bot that should appear in the shared dashboard should implement:

```http
GET /api/manifest
GET /api/status
GET /api/guilds
GET /api/stats
GET /api/logs?limit=100
GET /api/logs/stream
GET /api/settings/schema
```

`GET /api/manifest` describes the module so Botboard can render it without
hardcoding every future bot:

```json
{
  "apiVersion": 1,
  "id": "music",
  "type": "music-player",
  "displayName": "NewMusicBot",
  "icon": "music",
  "capabilities": ["status", "guilds", "logs", "stats", "settings"],
  "pages": [
    { "id": "player", "label": "Music Player", "icon": "music", "kind": "music-player" },
    { "id": "logs", "label": "Live Logs", "icon": "logs", "kind": "logs" }
  ],
  "endpoints": {
    "status": "/api/status",
    "guilds": "/api/guilds",
    "stats": "/api/stats",
    "logs": "/api/logs",
    "logStream": "/api/logs/stream",
    "settings": "/api/settings",
    "settingsSchema": "/api/settings/schema"
  }
}
```

`GET /api/status` returns the bot identity and live health:

```json
{
  "bot": { "tag": "ExampleBot#0001", "avatar": "https://..." },
  "uptimeMs": 120000
}
```

`GET /api/guilds` returns servers visible to the bot. Include the signed-in
user's current voice channel when `X-Dashboard-User-Id` is supplied:

```json
[
  {
    "id": "guild-id",
    "name": "Server",
    "icon": "https://...",
    "members": 10,
    "voiceChannels": [{ "id": "channel-id", "name": "general", "users": 2 }],
    "userVoiceChannelId": "channel-id"
  }
]
```

`GET /api/stats` returns live, bot-owned statistics. Botboard may persist
snapshots later, but the bot should not need Botboard to count its own core
state:

```json
{
  "updatedAt": "2026-05-27T12:00:00.000Z",
  "scope": "live",
  "cards": [{ "key": "guilds", "label": "Servers", "value": 3 }],
  "health": [{ "key": "discord", "label": "Discord gateway", "status": "ok" }],
  "charts": [],
  "tables": []
}
```

`GET /api/logs` returns log entries and `/api/logs/stream` emits the same
entries as server-sent events:

```json
{ "time": "2026-05-27T12:00:00.000Z", "level": "info", "src": "bot", "text": "ready" }
```

`GET /api/settings/schema` describes which environment-backed settings the
dashboard may show. A bot decides which settings are editable at runtime and
which require a restart:

```json
{
  "managedBy": "environment",
  "sections": [
    {
      "id": "general",
      "label": "General",
      "fields": [
        {
          "key": "prefix",
          "env": "COMMAND_PREFIX",
          "label": "Command prefix",
          "type": "text",
          "editable": true,
          "restartRequired": false,
          "secret": false
        }
      ]
    }
  ]
}
```

## Optional Capabilities

A bot can add capability-specific endpoints behind its module pages, for
example `/api/settings`, music player controls, or sound playback. Settings
are stored in that bot's own `.env`; the dashboard never requires a bot to
exist in order to run.

To add a future bot to Botboard, register its URL/container in the Botboard
server configuration. The common status, guild, stats and log plumbing can
then use the same contract. Custom pages still need a frontend renderer for
their `kind`, but the bot identity, health, logs, statistics and settings are
generic.
