# Modular Botboard Direction

Botboard should stay an optional control surface. Every bot owns its runtime,
configuration, logs and live state, and must still start normally when Botboard
is stopped or not configured.

## Bot API Contract

Each bot exposes a small HTTP API only when `BOT_API_TOKEN` is configured.
The important shared endpoints are:

- `GET /api/manifest` for name, icon, capabilities and pages
- `GET /api/status` for online/health state
- `GET /api/guilds` for shared server selection
- `GET /api/stats` for live metrics
- `GET /api/logs` and `GET /api/logs/stream` for live logs
- `GET /api/settings/schema` and `GET /api/settings` for environment-backed settings

This lets Botboard discover future bots without hardcoding their basic
identity, health, logs, stats and settings.

## Storage Recommendation

No database is needed for the current live dashboard:

- Status comes directly from each bot.
- Logs stream directly from each bot.
- Settings are written into each bot's own `.env`.
- Botboard can read fixed bots from environment variables.
- Additional UI-added bots can be stored in `data/bots.json`.

For historical statistics, use SQLite in Botboard later. Keep it as a single
file in a mounted data folder, for example `data/botboard.sqlite`. That is
enough for personal dashboards, easy to back up on Unraid, and avoids running
another service.

Recommended future SQLite tables:

- `bots`: registered bots from the UI (`id`, `name`, `base_url`, `enabled`)
- `stat_snapshots`: periodic `/api/stats` snapshots per bot and guild
- `events`: important actions such as played sounds, queue changes or errors
- `settings_audit`: optional history of dashboard-side settings changes

Do not put the Discord bot token or `BOT_API_TOKEN` into the database. Those
belong in environment variables or `.env` files per project/container.

## Next Step

The clean next implementation step is a Botboard registry:

1. Fixed Unraid/container bots stay in environment variables.
2. UI-added bots are stored in `data/bots.json`.
3. Botboard exposes `/api/bots/registry` for managing that file.
4. Botboard exposes `/api/bots/modules` to merge registry, manifest and status.
5. Add SQLite only when Botboard starts storing historical stats.

The Botboard UI has a **Bot Modules** page for these registry actions. Env
bots are shown as read-only because they are intentionally controlled by the
container environment. File-backed registry bots can be added, edited,
disabled or removed from the UI.

Example `data/bots.json`:

```json
{
  "bots": {
    "mybot": {
      "url": "http://localhost:3003",
      "container": "",
      "name": "My Bot",
      "enabled": true
    }
  }
}
```
