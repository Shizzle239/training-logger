# Change Consequences — "if you touch X, then Y"

Read this BEFORE editing. Every change has a blast radius. The preflight gate
catches most violations, but understanding them prevents the bad change.

## The consequence matrix

| If you change... | You must also... | Or this breaks |
|---|---|---|
| **Any cached asset** (index.html, styles.css, db.js, xlsx.js, app.js, program.json, manifest.json, icons) | **Bump `VERSION` in `sw.js`** | Installed phones keep the OLD cached app forever. |
| **Add a new JS/CSS/image file** | Add it to `index.html` AND to `ASSETS` in `sw.js`, then bump VERSION | It 404s offline / never loads on phones. |
| **Rename/move a file** | Update `index.html`, `sw.js` ASSETS, and every reference; bump VERSION | Broken script load, blank app. |
| **IndexedDB store: add** | Bump `DB_VERSION` in `db.js`, create it in `onupgradeneeded`, add to `STORES` | `dbGetAll('newstore')` throws; views error. |
| **IndexedDB store: rename/remove or change keyPath** | Write a migration in `onupgradeneeded` that copies old -> new | **Users' logged data is destroyed.** Avoid unless truly necessary. |
| **The set id format** `week\|dayId\|exId\|setIdx` (`setKey`) | Don't — or migrate every existing `sets` record | Past logs orphan; prefill + progress + archive misread. |
| **`program.json` structure** (block/exercise/day shapes) | Keep the shapes in `architecture.md`; update `xlsx.js`, the template, and renderers together | Log/Maxes/Progress views throw or render wrong. |
| **Remove/rename `program.maxLifts`** | Keep it (or guard `renderMaxes`) | Maxes tab throws -> "Something went wrong" card. (Boot smoke catches this.) |
| **`program.progressLifts`** | Optional, but it orders Progress charts | Charts fall back to insertion order (cosmetic). |
| **Edit `program.json` content** | Tell Dylan to use **Data -> "Gehostetes neu laden"** (or re-import) | Existing installs keep their IndexedDB-cached program; the edit is invisible to them. |
| **Add an external URL / CDN / font** | Don't — vendor it locally, relative path | Breaks offline AND the Capacitor migration. |
| **Rely on the service worker for a feature** | Don't — SW is TWA-only; offline must work without it | Capacitor WebView has no SW; feature dies there. |
| **A destructive data flow** | Keep the `confirm()` guards; nudge a JSON backup first | Silent data loss. |
| **UI text** | Match the surrounding language (German or English) | Inconsistent, jarring UI. |
| **Add a browser API** (`navigator.share`, etc.) | Feature-detect with a fallback | Crashes on browsers/WebViews lacking it. |

## Safe-change recipes (common requests)

**Restyle / tweak the UI (CSS only)**
1. Edit `styles.css`. 2. `node tools/preflight.js`. 3. Bump `sw.js` VERSION
(styles.css is cached). 4. Visual check (Claude-in-Chrome or local server).
5. Commit + push.

**Change copy / labels (app.js or program.json)**
1. Find the string in `app.js` (or `program.json`). 2. Keep its language.
3. Preflight. 4. Bump VERSION. 5. Commit + push. (If it's `program.json`, also
tell Dylan to "Gehostetes neu laden" on the phone.)

**Add a field to the log row (e.g. a per-set note)**
1. `setRowHtml` (markup) + `saveSetRow`/`renderLog` restore (persistence) — the
field rides inside the existing `sets` record, so NO `DB_VERSION` bump needed.
2. Preflight (boot smoke renders the log view). 3. Bump SW VERSION. 4. Ship.

**Add a whole new store (e.g. `templates`)**
1. `db.js`: `DB_VERSION 2 -> 3`, add `createObjectStore('templates', ...)` in
`onupgradeneeded`, add `'templates'` to `STORES`. 2. Use `dbGet/dbPut`. 3.
Preflight checks store consistency. 4. Bump SW VERSION. 5. Ship. (`dbClearAll`
auto-covers new stores.)

**Swap in a new training block (new program)**
Preferred: Dylan imports an `.xlsx`/`.json` on the phone (Data -> Programm
importieren) — no code, logged data kept. To change the hosted default: edit
`program.json`, validate it parses + has `name/weeks/days/maxLifts`, bump SW
VERSION, push; on the phone use "Gehostetes neu laden". The
`training-logger-master` and `training-plan-to-template` skills both produce the
right shape.

**New top-level screen/route**
1. Add a `route()` branch + a `renderX(app)` in `app.js`. 2. Add nav if needed
(`index.html` + tab-highlight logic in `render()`). 3. Preflight. 4. Bump
VERSION. 5. Ship.

## Before you commit, ask yourself

- Did I change a cached asset? -> VERSION bumped?
- Did I touch IndexedDB? -> DB_VERSION + migration safe?
- Any absolute URL / CDN / SW-only assumption sneak in? (preflight checks, but look)
- Did preflight end with `OK preflight passed`?
- For UI: did I actually look at it render?
