# Botboard – Architektur & Migrationsplan

> Ziel: Botboard von einer „Discord-Bot-Verwaltung" zu einer **Plattform für
> heterogene Dienste** machen (Discord-Bots, rohe Docker-Container, Gameserver),
> ohne dass das Hinzufügen eines neuen Dienst-Typs den Kern anfasst.

## Leitprinzip

> **Der Kern weiß nichts über konkrete Dienste.**
> Alles Dienst-Spezifische lebt an genau zwei Orten:
> 1. im **Manifest** des Dienstes (welche Seiten/Fähigkeiten hat er?), oder
> 2. in einem server-seitigen **Provider-Adapter** (wie rede ich mit ihm?).

Daraus folgt die Faustregel für die Kosten:

| Aktion | Aufwand im Zielbild |
|---|---|
| Neuen Discord-Bot hinzufügen (folgt dem Manifest-Vertrag) | nur registrieren – **kein Code** |
| Rohen Docker-Container hinzufügen | registrieren mit `type: container` – Provider synthetisiert Manifest, **kein Frontend-Code** |
| Neue Gameserver-Art unterstützen | **ein** Provider + evtl. ein neuer Page-Kind – begrenzt, additiv |

---

## Ist-Zustand (Stand 0.4.51)

**Gut & behalten:**
- `server/botClient.js` – schlanker HTTP-Proxy zu Bot-APIs (Bearer-Auth, Timeouts, Fehlernormalisierung).
- `server/docker.js` – Container-Lifecycle via dockerode (`restart/stop/start`, `listMatchingContainers`).
- `server/botRegistry.js` – persistierte Registry `{ id, url, container, name, enabled }`.
- `src/api.js` – sauber namespaced (`auth`, `bots`, `moduleApi`).
- `src/hooks.js` – kleine wiederverwendbare Hooks (`useFetch`, `usePoll`, `useSSE`, `useHashRoute`).
- **Manifest-/Page-Kind-System**: jede Bot-Seite hat ein `kind`; generische Renderer (`GenericStatsScreen`, `GenericSettingsScreen`, generische Logs) existieren bereits.
- **Always-mount + `hidden`**-Muster gegen Render-Flashes.

**Limitierende Grundannahme:**
> Jeder verwaltete Dienst ist implizit „ein Bot mit Botboard-kompatibler HTTP-API".
> Manifest, Status und Settings-Schema kommen **vom Dienst selbst**.

Ein roher Container hat kein `/api/status`, kein Manifest, kein Schema; ein Gameserver
spricht RCON/Query statt HTTP-JSON. Beide fallen heute durch das Raster.

**Konkrete Kopplungen, die weg müssen:**
- `sound` / `music` sind an ~10 Stellen hart verdrahtet
  (`App.jsx` 429/771/783/958, `screens-1.jsx` 77/78, `screens-3.jsx` 61/295/338).
- Page-Renderer ist ein Inline-Switch in `App.jsx` (~Z.738–800) statt einer Registry.
- Hand­geschriebene Settings-Maps (`settings-map.js`: `SETTING_MAP_SOUND/MUSIC`) statt schema-getriebener Formulare.
- Dupliziertes UI-Markup (Such-Feld 3×) → war Ursache der Icon-Bugs in 0.4.50/0.4.51.
- Styling-Split-Brain: 2.5k Zeilen globales CSS **plus** ~120 Inline-`style={{}}`-Stellen, die driften.

---

## Zielbild (Produktsicht)

### Jeder Dienst hat dieselben 5 Seiten

Egal ob Discord-Bot, roher Docker-Container oder Gameserver — ein Dienst *kann/soll*
genau diese Seiten anbieten:

1. 🎛️ **Control** – Start/Stop/Restart/Status
2. 📁 **Filebrowser** – Datei-Verwaltung (später: + Backup-Funktion)
3. 📊 **Statistik**
4. 📜 **Live-Logs**
5. ⚙️ **Settings**

### Gleiche 5 Seiten, zwei Energiequellen

Die UI ist immer dieselbe – nur die **Datenquelle** (= der Provider) unterscheidet sich:

| Seite | Eigener Bot (HTTP-API) | Container/Gameserver (Docker-Socket + Mount) |
|---|---|---|
| Control | Bot-API / Socket | **Docker-Socket** (start/stop/restart) |
| Logs | Bot-Stream (SSE) | **Docker-Socket** (`container.logs()`) |
| Statistik | Bot-Domänendaten (Queue, Sounds…) | **Docker-Socket** (`container.stats()` → CPU/RAM) |
| Settings | **Schema-API** (live, kein Neustart) | **Environment-Variablen** (Socket, Recreate nötig) |
| Filebrowser | gemounteter Ordner | gemounteter Ordner |
| Update | (über eigene Pipeline) | **Docker-Socket** (`pull` + Recreate) |

> **Filebrowser-Strategie:** Die jeweiligen Daten-Ordner der Dienste werden in den
> Botboard-Container **gemountet**; pro Dienst legt die Registry einen erlaubten
> `dataPath` fest (kein Zugriff aufs ganze Host-System). Backup = später diesen Ordner zippen.

### 3 technische Realitäten (bewusst einplanen)

1. **Env-Variablen sind an einem laufenden Container nicht änderbar.** „Settings speichern"
   bei `container`/`gameserver` = Container **stoppen + neu erstellen** mit neuen Werten
   (kurze Downtime). HTTP-Bots speichern dagegen live. → Die Settings-Seite verhält sich
   je nach Provider-Fähigkeit leicht anders; das ist gewollt.
2. **Update = `docker pull` (neues Image) + Recreate.** Registry-Eintrag braucht dafür eine
   Image-Referenz (zusätzlich zum heutigen `container`-Namen).
3. **Filebrowser braucht Mounts:** Botboards eigener Container muss die Ordner gemountet
   bekommen; Zugriff strikt auf den `dataPath` des Dienstes begrenzen (Path-Traversal vermeiden).

---

## Zielarchitektur (technisch)

### 1. Server: Provider-Pattern (das Rückgrat)

Registry-Eintrag bekommt ein `type`-Feld:

```jsonc
{ "id": "music", "type": "http-bot", "url": "...", "container": "newimusicbot", "enabled": true }
{ "id": "valheim", "type": "container", "container": "valheim-server", "enabled": true }
{ "id": "mc", "type": "gameserver", "adapter": "minecraft", "host": "...", "rconPort": 25575 }
```

Ein **Provider** implementiert *eine* Schnittstelle:

```
interface ServiceProvider {
  status(svc)                  -> { online, ...details }
  manifest(svc)                -> { pages: [{ id, kind, title }], capabilities }
  logs(svc, opts)              -> stream | lines
  stats(svc)                   -> { cpu, mem, ... } | domänenspezifisch
  lifecycle: start/stop/restart(svc)
  getSettings(svc)             -> { values, schema }   // Schema-API ODER Env-Variablen
  saveSettings(svc, patch)     -> updated              // ggf. via Recreate
  listFiles(svc, path) / readFile / writeFile          // Filebrowser (aus dataPath)
  update(svc)                  -> pull + recreate       // nur container/gameserver
  proxy(svc, path, opts)       -> passthrough (nur http-bot)
}
```

Nicht jeder Provider muss alles können — die `manifest().capabilities` sagen, welche
der 5 Seiten ein Dienst tatsächlich anbietet; die UI blendet den Rest aus.

| `type` | Provider | Settings-Quelle | Manifest |
|---|---|---|---|
| `http-bot` | heutiges `botClient`-Verhalten | Schema-API (live) | vom Bot (HTTP) |
| `container` | dockerode (`logs()`, `stats()`, inspect, pull) | Env-Variablen (Recreate) | **synthetisiert** (Control, Logs, Stats, Settings, Filebrowser) |
| `gameserver` | RCON/Query-Adapter (+ docker für Lifecycle) | Config-Datei / Env | synthetisiert (+ Konsole/Players) |

`routes/bots.js` delegiert nur noch: `provider(svc.type)[action](svc, ...)`.
Kein verstreutes Typ-Branching mehr.

### 2. Manifest = universeller Vertrag (darf synthetisiert werden)

Das Frontend rendert ausschließlich, was `manifest.pages[]` deklariert.
Für einen Discord-Bot liefert der Provider das Manifest vom Bot; für einen Container
**baut Botboard** ein Default-Manifest. → Container/Gameserver brauchen kein neues Frontend.

### 3. Frontend: Page-Kind-Registry statt Inline-Switch

```js
// src/pages/registry.jsx
export const PAGE_RENDERERS = {
  'soundboard':         SoundboardPage,
  'music-player':       MusicPage,
  'file-library':       LibraryPage,
  'stats':              StatsPage,
  'logs':               LogsPage,
  'settings':           SettingsPage,      // schema-getrieben
  'container-controls': ContainerControlsPage,
  // neuer Kind = ein Eintrag
};
```

`App.jsx` loopt über die Manifest-Seiten und schlägt den Renderer per `kind` nach.
Jeder Renderer bekommt einen einheitlichen `ctx` (Service-Daten + Handler).

### 4. Capability-getrieben statt ID-getrieben

`parentBot === 'sound' ? ... : 'music' ? ...` verschwindet. `sound` und `music` werden
**zwei gewöhnliche `http-bots`**, deren Manifest die Kinds `soundboard` / `music-player` /
`file-library` deklariert. Settings laufen über `settingsSchema` (existiert in der API schon).

### 5. Ordnerstruktur (Frontend) — ✅ umgesetzt

```
src/
  main.jsx · App.jsx · styles.css   ← Entry/Shell
  lib/      api · hooks · format · storage · botIdentity · settings-map   (reine Logik)
  ui/       components (Icon, SearchField, Tag, Row, Charts, …)
  layout/   sidebar · tweaks-panel
  screens/  auth · overview · admin · registry   (Top-Level-Routen)
  pages/    soundboard · music · library · stats · logs · settings · patch-watcher
            + registry.js   ← sammelt alle pages/*.jsx via import.meta.glob
```

**Selbst-registrierende Seiten:** Jede Datei in `pages/` exportiert
`page = { kind, render }`; `registry.js` entdeckt sie automatisch
(`import.meta.glob`). Eine neue Seite hinzufügen = eine Datei ablegen — kein
Edit in `App.jsx`, keine zentrale Liste. Die alten Grab-Bag-Dateien
(`screens-1/2/3.jsx`) sind aufgelöst.

---

## Querschnitts-Verbesserungen (beheben die Bug-Klassen dieser Session)

- **`<SearchField>`** – eine Quelle der Wahrheit statt 3 Kopien (Icon-Bug strukturell unmöglich). ✅ *erledigt in dieser Charge*
- **`<AsyncContent loading data empty>`** – verhindert Lade-/Leer-Flashes (Manage-Flash).
- **Inline-Styles → CSS-Klassen / CSS-Modules** pro Feature; ein 2.5k-Zeilen-Global zerlegen.
- **`<DataTable>`** – Library-Voll-/Kompakt-Drift war Folge von doppeltem Styling.

---

## Migrationsplan (inkrementell, jede Stufe für sich lauffähig)

> **Wichtig:** Botboard hat **keine Tests**. Vor den strukturellen Stufen (3–6) jeweils
> Smoke-Tests um die Provider-Schnittstelle und das Manifest-Rendering legen.

- [x] **Stufe 0 – Querschnitt, risikoarm:** `<SearchField>` extrahieren (3→1 Call-Sites).
- [x] **Stufe 1 – Page-Kind-Registry (Frontend):** Inline-Switch in `App.jsx` → **selbst-registrierende `pages/`-Module + `import.meta.glob`-Registry**. App listet keine Seiten mehr auf. Reines Refactoring, kein Verhaltenswechsel.
- [x] **Stufe 1b – Ordnerstruktur + Datei-Split (vorgezogen):** flaches `src/` → `lib/ ui/ layout/ screens/ pages/`; `screens-1/2/3.jsx` (Grab-Bag, bis ~1100 Z.) in Feature-Dateien aufgelöst; `Row` → `ui/`. Per Build verifiziert.
- [ ] **Stufe 2 – `sound`/`music`-Settings entkoppeln:** ID-Branch im `settings`-Renderer (jetzt in `pages/settings.jsx`) entfernen; sound/music über `GenericSettingsScreen` (Schemas existieren in den Bots bereits); `settings-map.js` + Sonderverdrahtung in App.jsx ablösen. **(Stats-Branch bleibt vorerst.)** ⚠️ erster Schritt mit Verhaltensrisiko → Browser-Check nötig.
- [ ] **Stufe 3 – Provider-Abstraktion (Server):** `type`-Feld + `ServiceProvider`-Interface; `http-bot`-Provider kapselt heutiges Verhalten. `routes/bots.js` delegiert.
- [ ] **Stufe 4 – `DockerProvider`:** Control/Logs/Stats/Update aus dockerode; Settings = Env-Variablen (Recreate); synthetisiertes Manifest. → **erster Nicht-Bot-Dienst end-to-end**.
- [ ] **Stufe 5 – Filebrowser:** „Library" zu allgemeinem Filebrowser verallgemeinern (gemounteter `dataPath` je Dienst). Backup-Funktion als späterer Zusatz.
- [ ] **Stufe 6 – Querschnitt-Rest:** `<AsyncContent>` (Lade-/Leer-Flashes), `App.jsx` (1000 Z. God-Component) in Domänen-Hooks zerlegen, `styles.css` (2.5k Z.) pro Feature aufteilen.
- [ ] **Stufe 7 – `GameServerProvider`** (RCON/Query) wenn benötigt.

## Definition of Done je Stufe
- Build läuft (`npm run build`), keine Konsolen-Fehler.
- Bestehende Bots (sound/music) verhalten sich identisch.
- Eine neue Instanz einer bekannten Kategorie kommt **ohne Code** dazu.
- Eine neue Kategorie kostet **genau einen** Provider (+ ggf. einen Page-Kind).

---

## Zukunft / bewusst aufgeschoben

- **Persistenz / Datenbank** für Verlaufsdaten. Faustregel: *persistiere, was Historie
  braucht; streame/proxy, was nur „jetzt" ist.*
  - 📊 **Statistik** → stärkster DB-Kandidat (Charts über Zeit brauchen Persistenz).
  - ⚙️ **Settings** → evtl. „Quelle der Wahrheit" v.a. für Container-Env (in DB ablegen, beim Recreate anwenden).
  - 📜 **Logs** → eher *keine* relationale DB (Volumen!); Dateien oder Log-/Time-Series-Store, nur falls Suche/Retention nötig. Live-Logs bleiben Stream.
  - Die DB wäre eine Schicht **hinter** den Providern — die 5-Seiten-UI ändert sich dadurch nicht; additiv nachrüstbar.
  - Preis: echte Abhängigkeit (eigener Container, Migrationen, Backups) → bewusst später.
- **Backup-Funktion** im Filebrowser (Ordner zippen/sichern).
- **Einheiten-Anzeige** in schema-getriebenen Settings (z.B. ms→Minuten), damit nach Stufe 2 die Zeitfelder wieder hübsch sind.
