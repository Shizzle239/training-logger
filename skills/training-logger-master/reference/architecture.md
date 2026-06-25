# Architecture — Training Logger PWA

Offline-first single-page PWA. **Vanilla HTML/JS/CSS, no framework, no build
step, no runtime dependencies.** Everything is on-device in IndexedDB. Shipped two
ways: (1) the live **GitHub Pages** site, wrapped as a **TWA APK** that
auto-updates on `git push`; (2) future option: bundle with **Capacitor** into a
standalone APK (see `CAPACITOR.md`).

## Files (load order matters)

| File | Role | Notes |
|---|---|---|
| `index.html` | App shell | Static header/nav/timer DOM. Loads scripts in order: **`db.js` -> `xlsx.js` -> `app.js`**. |
| `styles.css` | Dark mobile-first styling | Status colors, supersets/round groups, charts, sheets. |
| `db.js` | IndexedDB wrapper | `DB_VERSION = 2`, `STORES = [kv, sessions, sets, maxes, bodyweight, exercises]`. Promise helpers: `dbGet/dbGetAll/dbPut/dbBulkPut/dbDelete/dbClear/dbClearAll`. |
| `xlsx.js` | Excel -> program parser | Global `programFromXlsx(file)`; unzips `.xlsx`, reads sheets, `buildProgram()`. Used by program import. |
| `app.js` | Everything else | Routing, all views, logging, maxes, progress, data, rest timer, import/export. ~1340 lines. The file you edit most. |
| `program.json` | The program ("program as data") | Loaded once into IndexedDB `kv.program`; thereafter the cached copy wins. |
| `manifest.json` | PWA manifest | `start_url`/`scope` are `./` (relative). |
| `sw.js` | Service worker | `VERSION` + `ASSETS` cache list. **Bump VERSION on every asset change.** |
| `icons/` | App icons | 192/512/maskable. In `ASSETS`. |
| `tools/` | Dev tooling + tests | `preflight.js` (the gate), `smoke-boot.js`, `e2e-test.js`, `*-test.js`, icon/program generators, screenshots. |

## Data model (IndexedDB, db name `workout-logger`, version 2)

| Store | keyPath | Shape | Meaning |
|---|---|---|---|
| `kv` | `key` | `{key, value}` | `program` = active program JSON; misc prefs. |
| `sessions` | `id` | `{id, week, day, date, notes}` | `id = "week|dayId"`. |
| `sets` | `id` | `{id, week, day, ex, set, reps, wt, rpe, done, ts}` | `id = "week|dayId|exId|setIdx"`. **This id format is load-bearing.** |
| `maxes` | `id` | `{id, oneRM}` | `id = lift id`. |
| `bodyweight` | `week` | `{week, kg}` | Keyed by week number only (note: weeks collide across programs). |
| `exercises` | `id` | `{id, name, lastReps, lastRpe, lastWeight, programs[], firstSeen, lastSeen}` | Library auto-harvested from every imported program. |

`localStorage` is used for **prefs only** (`wl.lastExport`) — never for app data
(Capacitor rule).

## Routing (hash-based, `app.js` `route()`/`render()`)

| Hash | View | Renderer | Tab |
|---|---|---|---|
| `#/` | Home: week x day grid, completion status, backup nudge | `renderHome` | Home |
| `#/log/:week/:day` | The logging screen (sets, supersets, timer, prefill) | `renderLog` | — |
| `#/maxes` | 1RM input, Training Max (90%), 60-95% tables, e1RM calc | `renderMaxes` | Maxes |
| `#/progress` | Per-lift heaviest-weight charts, bodyweight, full history | `renderProgress` | Progress |
| `#/data` | Backup/restore, CSV/JSON/program import, danger zone | `renderData` | Data |
| `#/archive` | Completed sessions (all sets done) | `renderArchive` | Data |
| `#/exercises` | Exercise library (read-only) | `renderExercises` | Data |

`render()` wraps each renderer in try/catch and shows a "Something went wrong"
card on throw (so a bad `program.json` shows an error instead of a blank screen).

## Key app.js functions (where to look)

- **State**: `App = { program, setsCache, sessionCache }`. Keys: `setKey`, `sessionKey`.
- **Program load**: `loadProgram()` (prefers `kv.program`, else `fetch('program.json')`),
  `reloadProgramFromFile()` (force re-fetch), `harvestExercises()` (fills `exercises`).
- **Program walking**: `getDay`, `exerciseSets` (expands superset targets x rounds),
  `forEachSet`, `findExercise`, `targetText`.
- **Logging**: `renderLog`, `setRowHtml`, `updatePrefillChip` ("last week" chip),
  `updateRowStatus` (green/amber), `ensureSession`, `saveSetRow` (autosave; deletes
  empty records). Superset blocks interleave rounds (2a -> 2b per round) with
  `.round-group` wrappers.
- **Smart defaults**: tapping the `✓` fills empty reps/wt/rpe from previous week or
  the program target (in the `app` click handler, `.f-done` branch).
- **Maxes**: `renderMaxes` (needs `program.maxLifts`), `recalcE1RM`, `saveMax`,
  `epley`/`brzycki`. TM = 90% of 1RM.
- **Progress**: `renderProgress` (built from ALL logged data so it survives program
  swaps), `barChartSvg`/`lineChartSvg` (inline SVG, no chart lib), `prettyName`.
- **Data/backup**: `exportJSON` (full backup), `exportCSV` (flat sets), `importJSONFile`
  (replace-all, validates `app:"workout-logger"`), `importProgramFile`
  (xlsx or json, `validateProgram`), `importCSVFile` (Excel migration; `parseCSV`,
  `normalizeDayId`, `exerciseIdFrom`), wipe-all. Uses `program.progressLifts` for
  chart ordering.
- **Rest timer**: `RestTimer` object (presets 30/45/60/90/120 + 15s, vibrate + beep
  via WebAudio). Launchable from top bar, pill, or any set row.
- **Events**: `wireEvents()` — delegation on `#app` for `click`/`input`/`change`,
  plus `hashchange -> render`. `init()` registers the SW (guarded) and boots.

## program.json shape (program as data)

```
{ id, name, weeks, maxLifts:[{id,name}], progressLifts:[exId,...],
  days:[ { id, name, title, warmup:{title,items[]}, plyo:{title,items[]},
           blocks:[ { id, type:"straight"|"superset", rounds?, exercises:[
             // straight: { id, label, name, sets:[{reps,rpe,weight}, ...] }
             // superset: { id, label, name, target:{reps,rpe,weight} }  // x rounds
           ] } ] } ] }
```

The same shape is produced by `xlsx.js`/`Program_Template.xlsx` and the
`training-plan-to-template` skill. `maxLifts` powers the Maxes tab; `progressLifts`
orders the Progress charts. Strings are frequently **German** — preserve them.

## Deploy pipeline (how a change reaches the phone)

`edit -> tools/preflight.js (green) -> bump sw.js VERSION -> commit -> push`
`-> GitHub Pages rebuilds (~1 min) -> TWA serves new VERSION on next launch`
(open the app twice: first launch downloads the new cache, second runs it). See
`deploy-runbook.md`.
