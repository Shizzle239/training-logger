---
name: training-logger-frontend-qa
description: >
  Frontend quality + QA edge-case hunting for the Training Logger PWA — no
  framework, just HTML/CSS/JS, IndexedDB, offline, and mobile (Android/Chrome via
  a TWA). Use when designing or reviewing UI/UX, CSS layout, accessibility, or
  when stress-testing a feature for edge cases and failure modes before release.
  Triggers: "does this UI hold up", "edge cases", "QA this", "test the log
  screen", "accessibility", "mobile layout", "what could break".
license: MIT
metadata:
  version: 1.0.0
  category: app-maintenance
  adapted_from: "alirezarezvani/claude-skills :: senior-frontend + senior-qa (MIT)"
  updated: 2026-06-25
---

# Training Logger — Frontend & QA

Two hats for the same app. Use the frontend lens when building/altering UI; the
QA lens to break it before users do.

## Frontend lens (vanilla, mobile-first, dark)

- **No framework, no build.** Plain DOM, event delegation on `#app`, HTML built
  from template strings (always `esc()` interpolated values). Match this — don't
  introduce a library or a bundler.
- **Mobile-first.** Target is a phone in portrait. Tap targets >= 44px, thumb
  reach, the fixed bottom nav + top bar, safe-area insets (`viewport-fit=cover`).
- **Dark theme tokens** live in `styles.css`. Reuse existing classes (`.card`,
  `.set-row`, `.round-group`, `.btn`, status `.st-done/.st-partial`). Keep status
  colors meaningful (green done / amber partial / neutral untouched).
- **Charts are inline SVG** (`barChartSvg`/`lineChartSvg`) — extend that pattern,
  never a chart CDN.
- **Accessibility**: keep `aria-label`s on icon buttons, label inputs, sufficient
  contrast on the dark bg, `inputmode` on number fields.

## QA lens — edge cases that actually occur here

- **Empty / first run**: no program, no logged sets, no maxes, week 1 (no "last
  week" prefill). Does every view render gracefully?
- **Superset interleaving**: rounds render `2a -> 2b` per round with `.round-group`
  — verify order and count.
- **Numbers**: blank vs 0 reps/weight, decimals (2.5 kg steps), RPE 6-10 in 0.5s,
  huge values, negative via steppers (clamped at 0).
- **Autosave**: an empty set must DELETE its record, not store nulls; partial vs
  done status updates live.
- **Data lifecycle**: JSON export -> wipe -> JSON import round-trips everything;
  CSV import maps day/exercise names; program import keeps logged data.
- **Offline**: airplane mode after first load — app shell + program still work.
- **Update path**: after a deploy, the app updates on the SECOND launch.
- **Program swap**: old logged data still shows in Progress/Archive (history is
  program-independent).

## How to verify

Structure: `node tools/preflight.js` (boots all views headless). Pixels/behaviour:
Claude-in-Chrome on the live Pages URL or a local `python -m http.server 8123`,
plus the matching `tools/*-test.js`. See `training-logger-master/reference/testing.md`.

Report findings as concrete, reproducible cases with the expected vs actual.
