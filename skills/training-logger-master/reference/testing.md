# Testing — the "test before apply" gate

The promise to Dylan: **changes are tested before they ship.** The backbone is
one command that runs anywhere (no real browser needed).

## The preflight gate (run for EVERY change)

```bash
npm install           # first time only: installs jsdom + fake-indexeddb (devDeps)
node tools/preflight.js
```

Pass = it ends with `OK  preflight passed -- safe to commit & deploy` (exit 0).
Any `FAIL` = **do not commit**. It runs four stages:

1. **Syntax** — `node --check` on db.js, xlsx.js, app.js, sw.js, and the tools.
2. **JSON** — parses program.json, manifest.json, package.json.
3. **Static invariants (deploy consequences)**:
   - `sw.js` VERSION was bumped if any cached asset changed (vs git HEAD,
     comparing line-ending-normalized content so OneDrive CRLF churn is ignored);
   - every `ASSETS` entry exists on disk;
   - every local script/style in `index.html` is in the SW cache list (offline);
   - no absolute `http(s)`/CDN asset URLs in shipped code (Capacitor rule);
   - `db.js` `DB_VERSION` + object stores are self-consistent;
   - `program.json` has `name/weeks/days[]` (+ warns if `maxLifts`/`progressLifts`
     missing).
4. **Headless boot smoke** (`tools/smoke-boot.js`) — boots the REAL db.js/xlsx.js/
   app.js inside jsdom + fake-IndexedDB, stubs `fetch(program.json)`, and asserts
   **Home, Log, Maxes, Progress, Data all render with zero console/runtime
   errors.** This catches runtime regressions, not just syntax (e.g. removing
   `maxLifts` makes the Maxes view throw -> caught here).

It is proven to catch: a real asset change with no VERSION bump, a JS syntax
error, and a broken `program.json`. Trust a green result; investigate any red.

## Visual check (for UI / CSS changes)

The boot smoke confirms structure, not pixels. For anything visual, also look:

- **Claude-in-Chrome** (preferred in Cowork): open the live Pages URL
  `https://shizzle239.github.io/training-logger/` (or a local server, below) and
  read/screenshot the affected screen.
- **Local server** (real Chrome, full fidelity): service workers need http(s) —
  never `file://`:
  ```bash
  python -m http.server 8123      # then open http://localhost:8123
  ```

## Deeper end-to-end tests (higher fidelity, the user's machine)

`tools/` holds puppeteer suites that drive real Chrome against a local server:
`e2e-test.js` (home + superset interleaving + logging + maxes), plus
`history-test.js`, `sticky-test.js`, `program-import-test.js`,
`xlsx-import-test.js`, `exercises-test.js`, `program-smoke.js`. Run when a change
touches those areas:

```bash
python -m http.server 8123 &
node tools/e2e-test.js http://localhost:8123
```

Note: some of these assume the older 6-week `lower/upper` program shape and may
need their expected values updated when the active program changes. The preflight
boot smoke, by contrast, reads the CURRENT `program.json` and always stays valid.

## Test policy by change type

| Change | Minimum gate |
|---|---|
| Any change | `node tools/preflight.js` green |
| CSS / layout / UI | preflight + a visual look (Claude-in-Chrome or local server) |
| Logging / supersets / prefill | preflight + `node tools/e2e-test.js` |
| Import/export, program, xlsx | preflight + the matching `tools/*-test.js` |
| IndexedDB schema | preflight (store-consistency + boot) + manual import/export round-trip |

Never commit on red. For UI, never claim it works without seeing it render.
