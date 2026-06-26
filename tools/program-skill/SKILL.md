---
name: training-plan-to-template
description: >
  Transform any training-plan overview (a table, a photo, a text list, a PDF, or
  another spreadsheet) into the Training Logger program template Excel
  (Program_Template.xlsx), ready to import into the Training Logger app. Use when
  the user has a workout/training plan in some format and wants it as the app's
  Excel template or program. Triggers: "Trainingsplan in Vorlage", "convert this
  plan to the template", "mach daraus eine Programm-Excel", "Trainingsphase aus
  diesem Plan", "plan to xlsx", "fill the program template from this".
---

# Training Plan → Program Template

Turn a free-form training plan into a valid **Program_Template.xlsx** for the
Training Logger PWA. Output is a filled `.xlsx` (the user edits/imports it; the app
also reads `.xlsx` directly via Data → "Programm importieren (Excel / JSON)").

## Process

1. **Read the source.** The plan may arrive as: a pasted table, an image/photo,
   a PDF, a text list, or another spreadsheet. Extract every training day, its
   exercises, set/rep/RPE/weight prescriptions, and how exercises are grouped
   (straight sets vs. supersets/trisets).

2. **Map to the template structure.** The exact target format and the mapping
   rules are in `reference/target-format.md`. Read it before mapping. Key points:
   - One row per logged exercise in the **Exercises** sheet.
   - Rows sharing the same `day_id` + `block` = one superset (interleaved).
   - `day_id` must be a stable lowercase id with NO spaces, and the SAME `day_id`
     must be used in the **Warmups** sheet — otherwise warm-ups are orphaned and
     ghost days appear (this is the #1 mistake).
   - Distinct `label`s per superset (2a, 2b — never two 2a).
   - Always fill `reps`; leave `weight` empty for bodyweight moves (not 0).
   - **Per-week variation (periodization):** if loads/reps/RPE differ by week, or
     there is a deload/peak week, use the optional `week` column (see
     `reference/target-format.md` → "Wochenweise Variation"). Same exercise + new
     numbers in a `week=N` row → a per-week target (shared structure); a `week=N`
     row that introduces a new/other exercise → that week becomes independent.

3. **Ask when unsure — do NOT guess.** If the source is missing reps, RPE, set
   counts, weights, or the superset grouping is ambiguous, ask the user targeted
   questions before building. Common gaps and good questions are listed in
   `reference/mapping-guide.md`. Only proceed once the structure is unambiguous.

4. **Build the .xlsx.** Edit the cell data in `reference/build_template.py`
   (the `PROGRAM`, `EXERCISES`, `WARMUPS` lists) to match the mapped plan, then
   run it to produce the Excel:
   ```
   python reference/build_template.py "<output>.xlsx"
   ```
   It is dependency-free (stdlib only) and reuses the official template writer.

5. **Validate.** Convert the produced .xlsx to JSON and sanity-check it:
   ```
   python reference/xlsx2program.py "<output>.xlsx" check.json
   ```
   Confirm: correct day count (no ghost days), supersets show `type:"superset"`
   with sensible `rounds`, straight blocks correct, `progressLifts`/`maxLifts`
   look right, no exercise with an empty `reps`. If anything is off, fix the cell
   data and rebuild.

6. **Deliver** the `.xlsx` to the user. Tell them: import via the app
   (Data → "Programm importieren (Excel / JSON)") on phone, or hand it to Claude
   to convert + push. Logged data is always preserved on import.

## Notes

- Use new, distinct `day_id`s / exercise names for a new block if old logged
  sessions should stay separate in Progress/Archive (identical ids merge in charts).
- A rest/skip day = a Warmups entry (the note) + NO Exercises rows for that `day_id`.
- Keep `day_title` consistent (don't mix "Tag 1" / "Day 3").
- This skill produces the source-of-truth Excel; the app and the Python converter
  both read it identically.
