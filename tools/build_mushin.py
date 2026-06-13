"""Build the corrected Mushin Phase 2 template (.xlsx) using make_template's xlsx writer."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_template as mt  # reuse col_letter / sheet_xml / zip packaging

ANLEITUNG = mt.ANLEITUNG  # keep the same instructions sheet

PROGRAM = [
    ["key", "value"],
    ["id", "mushin-p2"],
    ["name", "Mushin – Phase 2: Hypertrophie"],
    ["weeks", 3],
]

EX_HEADER = ["day_id", "day_name", "day_title", "block", "label", "exercise",
             "sets", "reps", "rpe", "weight", "progress_lift", "max_lift_name"]

EXERCISES = [
    EX_HEADER,
    # --- Tag 1 — Squat ---
    ["tag1", "Tag 1", "Tag 1 — Squat", "A", "1a", "Back Squats", 2, "15", 6, None, "x", "Back Squat"],
    ["tag1", "Tag 1", "Tag 1 — Squat", "A", "1b", "Box Jumps", 2, "5", 8, None, "", ""],
    ["tag1", "Tag 1", "Tag 1 — Squat", "B", "2a", "DB Bench", 2, "15", 6, None, "x", "DB Bench"],
    ["tag1", "Tag 1", "Tag 1 — Squat", "B", "2b", "Kneeling Push up (Explosive)", 2, "5", 8, None, "", ""],
    ["tag1", "Tag 1", "Tag 1 — Squat", "C", "3a", "DB Rows", 2, "15", 6, None, "x", ""],
    ["tag1", "Tag 1", "Tag 1 — Squat", "C", "3b", "DB Shoulder Press", 2, "15", 8, None, "", ""],
    # --- Tag 2 — Step-up ---
    ["tag2", "Tag 2", "Tag 2 — Step-up", "A", "1a", "DB Step ups", 2, "15/side", 6, None, "x", ""],
    ["tag2", "Tag 2", "Tag 2 — Step-up", "A", "1b", "Step-up Jumps", 2, "3/side", 8, None, "", ""],
    ["tag2", "Tag 2", "Tag 2 — Step-up", "B", "2a", "BB Bench", 2, "15", 6, None, "x", ""],
    ["tag2", "Tag 2", "Tag 2 — Step-up", "B", "2b", "Medicine Ball Pass", 2, "5", 8, 4, "", ""],
    ["tag2", "Tag 2", "Tag 2 — Step-up", "C", "3a", "DB Shoulder Press", 2, "15", 6, None, "", ""],
    ["tag2", "Tag 2", "Tag 2 — Step-up", "C", "3b", "Reverse Rows", 2, "5", 8, None, "", ""],
    # --- Tag 3 — Bulgarian ---
    ["tag3", "Tag 3", "Tag 3 — Bulgarian", "A", "1", "Bulgarian Split Squat", 2, "15/side", 6, None, "x", "Bulgarian Split Squat"],
    ["tag3", "Tag 3", "Tag 3 — Bulgarian", "B", "2a", "Inclined DB Bench Press", 2, "15", 6, None, "x", ""],
    ["tag3", "Tag 3", "Tag 3 — Bulgarian", "B", "2b", "Pull Up", 2, "5", 8, None, "", ""],
    ["tag3", "Tag 3", "Tag 3 — Bulgarian", "C", "3a", "DB Shoulder Press", 2, "15", 6, None, "", ""],
    ["tag3", "Tag 3", "Tag 3 — Bulgarian", "C", "3b", "BB Hip Bridge", 2, "15", 6, None, "", ""],
]

WARMUPS = [
    ["day_id", "kind", "title", "item1", "item2", "item3"],
    ["tag1", "warmup", "Warm-up · ~8 min", "Mobility: Hüfte, Sprunggelenk, BWS", "Ramp-up Sätze bis Arbeitsgewicht", None],
    ["tag1", "plyo", "Plyo / Core", "Reverse Pogos :: 20 reps · 30s · 2 Runden", "Pogo to Squat :: 8 reps · 45s · 2 Runden", None],
    ["tag2", "warmup", "Warm-up · ~8 min", "Mobility: Hüfte, Knöchel, einbeinige Balance", "Ramp-up Sätze bis Arbeitsgewicht", None],
    ["tag2", "plyo", "Plyo / Core", "Lateral Bounds :: 6/side · 30s · 2 Runden", "Step-up Drive :: 6/side · 45s · 2 Runden", None],
    ["tag3", "warmup", "Warm-up · ~8 min", "Mobility: Hüfte, Adduktoren, BWS", "Ramp-up Sätze bis Arbeitsgewicht", None],
    ["tag3", "plyo", "Plyo / Core", "Split Squat Jumps :: 5/side · 45s · 2 Runden", "Hollow Hold :: 30s · 45s · 2 Runden", None],
]

mt.SHEETS = [("Anleitung", ANLEITUNG), ("Program", PROGRAM),
             ("Exercises", EXERCISES), ("Warmups", WARMUPS)]

if __name__ == "__main__":
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(repo, "Training_mushin-phase2_corrected.xlsx")
    mt.build(out)
