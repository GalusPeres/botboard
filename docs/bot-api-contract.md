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
GET /api/status
GET /api/guilds
GET /api/logs?limit=100
GET /api/logs/stream
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

`GET /api/logs` returns log entries and `/api/logs/stream` emits the same
entries as server-sent events:

```json
{ "time": "2026-05-27T12:00:00.000Z", "level": "info", "src": "bot", "text": "ready" }
```

## Optional Capabilities

A bot can add capability-specific endpoints behind its module pages, for
example `/api/settings`, music player controls, or sound playback. Settings
are stored in that bot's own `.env`; the dashboard never requires a bot to
exist in order to run.

To add a future bot to Botboard, register its URL/container in the Botboard
server configuration and add its page descriptor to the frontend bot module
list. The common status, guild and log plumbing then uses the same contract.
