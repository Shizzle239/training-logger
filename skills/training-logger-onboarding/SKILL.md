---
name: training-logger-onboarding
description: >
  Get up to speed on the Training Logger codebase fast in a fresh session — a
  guided map of the files, data flow, and where to make a given change, so any
  new session can act like it already knows the app. Use at the start of a new
  session on the app, when asked "how does the app work", "where is X handled",
  "give me the lay of the land", or before a larger change. Complements the
  training-logger-master architecture reference.
license: MIT
metadata:
  version: 1.0.0
  category: app-maintenance
  adapted_from: "alirezarezvani/claude-skills :: engineering/codebase-onboarding (MIT)"
  updated: 2026-06-25
---

# Training Logger — Onboarding / Code Map

Use this to orient quickly, then hand off to `training-logger-master` for the
actual change. Don't re-derive what's already written down.

## 60-second orientation

```bash
ls -1                                   # repo root
sed -n '1,40p' README.md                # what it is
cat sw.js | grep -E 'VERSION|\./'       # current version + cached assets
node -e "const p=require('./program.json');console.log(p.name,p.weeks,'weeks',p.days.map(d=>d.id))"
git log --oneline -8                     # recent direction
```

## Where things live (jump table)

| I want to change... | Go to |
|---|---|
| A screen's layout/markup | `app.js` `renderHome/renderLog/renderMaxes/renderProgress/renderData/renderArchive/renderExercises` |
| Logging behaviour, autosave, prefill | `app.js` `setRowHtml`, `saveSetRow`, `updatePrefillChip`, the `#app` click/input handlers |
| Maxes math | `app.js` `renderMaxes`, `epley`, `brzycki`, `saveMax` |
| Charts | `app.js` `barChartSvg`, `lineChartSvg` |
| Import/export, backup, program load | `app.js` `exportJSON/exportCSV/importJSONFile/importProgramFile/importCSVFile`, `loadProgram` |
| Excel parsing | `xlsx.js` (`programFromXlsx`) |
| Storage | `db.js` (stores, `DB_VERSION`) |
| Styling | `styles.css` |
| Offline cache / version | `sw.js` |
| The program content | `program.json` |

## The map (read for depth)

`training-logger-master/reference/architecture.md` has the full file table, the
IndexedDB schema, routing, the `program.json` shape, and a function index. Read
the relevant row, then make the change via the master skill's golden loop and run
`node tools/preflight.js`.

## Output when asked to onboard

Produce a tight briefing: what the app is, the 3-4 files that matter for the task
at hand, the data flow touched, and the one consequence to watch (usually the
`sw.js` VERSION bump). Keep it to a screen, not an essay.
