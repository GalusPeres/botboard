# Botboard

Botboard is a separate dashboard container for the two Discord bots. The bots
continue to run independently; when their optional APIs are enabled, Botboard
can read live state and write supported settings to each bot's own `.env`
file.

## Environment

Configure this container with the variables listed in `.env.example`.
`BOT_API_TOKEN` must match the value set in each bot that Botboard connects to.

For a real local Discord login, create or select a Discord application and add
`http://localhost:3000/api/auth/callback` as an OAuth2 redirect URL. Put its
client ID and client secret into `.env`, leaving `DEV_AUTH_BYPASS=false`.
Keep `DOCKER_RESTART_ENABLED=false` for local runs. Enable Docker restart
control later only when you intentionally mount the Docker socket in Unraid.
Locally, saving a setting from Botboard updates the respective bot `.env`;
restart that bot process to activate the changed runtime setting.

## Start

```powershell
npm install
npm start
```

`npm start` builds the current dashboard UI and then starts the local server.
The Docker image builds the UI in its builder stage and starts only the server
in the runtime container.

## Adding Bots

Botboard treats connected bots as modules. Shared status, guild discovery and
live-log routes iterate over the registered bots; each bot has its own
statistics and live-log pages in the sidebar. The HTTP contract a future bot
should implement is described in `docs/bot-api-contract.md`.
