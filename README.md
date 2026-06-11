# Training Logger PWA

Personal offline-first workout logger for a 6-week, 2-day strength block (Lower / Upper). Replaces `Training_Logger_6wk-final.xlsx`. No backend, no accounts, no dependencies — vanilla HTML/JS/CSS, all data stored on-device in IndexedDB.

## Features

- **Logging**: per-set reps / weight / RPE / done-toggle, superset rounds interleaved (2a → 2b → next round) with shaded grouping and round dividers. Autosaves every input.
- **Status colors**: green = set done, amber = partially logged, neutral = untouched.
- **Smart defaults**: tapping ✓ on an empty set fills target reps/weight (or last week's values); a "last week" chip prefills with one tap.
- **Rest timer**: 30/45/60/90/120 s presets, +15 s, vibration + beep. Launchable from any set row or the top bar.
- **Maxes**: 1RM per lift → Training Max (90%), 60–95% tables, estimated-1RM calculator (Epley + Brzycki), auto-suggested e1RM from your heaviest logged set.
- **Progress**: heaviest logged weight per week per key lift (chart), weekly bodyweight log.
- **Data safety**: one-tap JSON backup (full restore) + CSV export; CSV import for one-time Excel migration; backup nudge if last export > 7 days.
- **Program as data**: the whole 6-week template lives in `program.json` — swap in the next block without touching code.

## Deploy to GitHub Pages

1. Create a new **public** repo on GitHub (e.g. `training-logger`).
2. From this folder:

   ```bash
   git init
   git add .
   git commit -m "Training Logger PWA v1"
   git branch -M main
   git remote add origin https://github.com/<your-username>/training-logger.git
   git push -u origin main
   ```

3. On GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / root → Save.**
4. After ~1 minute the app is live at `https://<your-username>.github.io/training-logger/`.

All paths in the app are relative, so it works in the repo subpath without configuration.

> **Updating the app later:** bump `VERSION` in `sw.js` (e.g. `v1.0.1`) with every change you push, otherwise installed phones keep serving the old cached version. Then push; the app picks up the new version on next launch (open it twice: first launch downloads, second runs it).

## Install on Android

1. Open the GitHub Pages URL in **Chrome** on the phone.
2. Menu (⋮) → **"Add to Home screen" / "Install app"** → Install.
3. Open it once from the home screen while online — after that it works fully offline (airplane-mode safe).

## Back up your data

Phone storage can be cleared by Android or by clearing browser data. **Export regularly:**

1. **Data** tab → **Export JSON (full backup)** — saves a `.json` file to your Downloads. This contains everything: sets, sessions, notes, maxes, bodyweight, and the program.
2. Move that file somewhere safe (Drive, email to yourself, PC).
3. To restore: **Data → Import JSON…** → pick the backup → everything is back.

The app shows a banner when the last export is older than 7 days.

CSV export gives a flat table of all logged sets (one row per set) for analysis in Excel/Sheets.

## One-time import of old Excel data

1. In Excel, build a sheet with header columns (names must match, order doesn't matter):

   ```
   week,day,exercise_id,set,reps,weight_kg,rpe,done,session_date
   ```

   - `week`: 1–6 · `day`: `lower` or `upper` · `set`: 1–3
   - `exercise_id`: see `program.json` (e.g. `back-squat`, `rdl`, `sa-db-bench`, `tricep-dips`, `hang-power-shrug`, …). Alternatively use a column `exercise` with the exercise name.
   - `done`: 1/0 · `session_date`: `YYYY-MM-DD` (optional)
2. Save as CSV → **Data → Import CSV…** on the phone (or desktop browser, then JSON-export there and JSON-import on the phone).

## Swap in a new training block

Edit `program.json` (exercises, supersets, targets, rounds — same shapes as the current content), bump `VERSION` in `sw.js`, push. On the phone: **Data → Reload program from file**. Logged data from the old block stays in the database and remains in exports.

## Local development

Service workers and `fetch` need http(s) — don't open `index.html` via `file://`. Instead:

```bash
python -m http.server 8000
# → http://localhost:8000
```

`tools/make_icons.py` regenerates the PNG icons (stdlib only).

## Project layout

```
index.html      app shell
styles.css      dark mobile-first styles
db.js           IndexedDB wrapper (kv, sessions, sets, maxes, bodyweight)
app.js          views, logging, maxes, progress, export/import, rest timer
program.json    the 6-week program (program-as-data)
manifest.json   PWA manifest
sw.js           offline cache service worker  ← bump VERSION on deploy
icons/          app icons
tools/          icon generator
```
