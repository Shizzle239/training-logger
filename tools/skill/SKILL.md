---
name: workout-program-builder
description: >
  Convert a filled-in workout program Excel template (Program_Template.xlsx)
  into the program.json used by the Training Logger PWA, then deploy it.
  Use when the user says they have a new training phase/block/Mesozyklus to add,
  hands over a filled program template .xlsx, or asks to push a new program to
  the workout app. Triggers: "neues Trainingsprogramm", "neue Trainingsphase",
  "convert program template", "push new program", "Trainingsblock einfügen".
---

# Workout Program Builder

Turns the Excel program template into `program.json` for the Training Logger PWA
(repo: `Shizzle239/training-logger`, served at
https://shizzle239.github.io/training-logger/).

## Steps

1. **Locate the filled template.** Default `Program_Template.xlsx` in the repo
   root. If the user uploaded one, use that path.

2. **Convert.** Run the converter (stdlib only, no deps):

   ```
   python tools/xlsx2program.py "<path-to-template.xlsx>" program.json
   ```

   It prints a summary (name, weeks, days, exercise count, progressLifts).
   The column contract is documented at the top of `tools/xlsx2program.py` and
   in `tools/PROGRAM_TEMPLATE.md`.

3. **Validate before pushing.**
   - `node --check` is not needed (JSON), but parse it: confirm `days`,
     `blocks`, supersets (`type:"superset"` with `rounds`), and any per-set
     straight blocks look right.
   - Best: run the e2e check that loads the JSON in the real app —
     `tools/template-e2e.js` (needs a local `python -m http.server 8123` in the
     repo and `puppeteer-core` available via NODE_PATH). All checks must pass.

4. **Bump the service worker.** Increase `VERSION` in `sw.js`
   (e.g. `v1.4.0` → `v1.5.0`) — otherwise installed phones keep the cached
   version and won't fetch the new `program.json`.

5. **Deploy.**
   ```
   git add -A
   git commit -m "vX.Y.Z: <program name>"
   git push
   ```
   Then confirm it is live:
   `https://shizzle239.github.io/training-logger/program.json` should contain the
   new program id.

6. **Tell the user how to activate on the phone:** open the app online, close &
   reopen (pulls the new service worker), then **Data → Reload program from
   file**. Logged data, maxes and the Archiv are preserved.

## Notes

- Use new, distinct `day_id`s / exercise names for a new block if the user wants
  old sessions kept separate in Progress/Archiv — identical ids merge in charts.
- A skipped/rest day = a Warmups entry with the note + no Exercises rows for that
  `day_id`; it renders as an info-only day.
- Never delete logged data; "Reload program" only swaps the program.
