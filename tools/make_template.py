"""make_template.py — generate Program_Template.xlsx (stdlib only).

Writes a minimal but valid .xlsx with 4 sheets: Anleitung, Program, Exercises, Warmups.
Pre-filled with a worked example so it doubles as a reference. Edit the rows,
then run:  python tools/xlsx2program.py Program_Template.xlsx
"""
import os
import zipfile

# ---- sheet data: list of rows, each row a list of (str|num|None) cells ----

ANLEITUNG = [
    ["Programm-Vorlage — Anleitung"],
    [""],
    ["So erstellst du eine neue Trainingsphase:"],
    ["1) Sheet 'Program': Name und Wochenzahl eintragen."],
    ["2) Sheet 'Exercises': eine Zeile pro Übung. Zeilen mit gleichem day_id + block = ein Superset."],
    ["   - 1 Zeile in einem block  = Straight Sets."],
    ["   - 2+ Zeilen im selben block = Superset/Triset (werden Runde für Runde abgewechselt)."],
    ["   - sets = Anzahl Sätze/Runden. reps z.B. 3 oder 10-12 oder 8/side."],
    ["   - Unterschiedliche reps pro Satz (z.B. 6/5/4): reps='6,5,4', rpe='6,7,8' (sets leer lassen)."],
    ["   - progress_lift = x  -> Übung erscheint im Progress-Tab als Chart."],
    ["   - max_lift_name      -> Lift erscheint im Maxes-Tab (z.B. 'Back Squat')."],
    ["3) Sheet 'Warmups' (optional): Warm-up & Plyo-Block pro Tag. kind = warmup oder plyo."],
    ["   - Plyo-Einträge im Format 'Name :: schema', z.B. 'Reverse Pogos :: 20 reps · 30s · 2 Runden'."],
    ["4) Übersprungener Tag (z.B. Taper-Ruhetag): in Warmups einen Eintrag mit der Notiz anlegen"],
    ["   und in Exercises KEINE Zeilen für diesen day_id -> wird als reiner Infotag angezeigt."],
    [""],
    ["=== FELDER IM DETAIL ==="],
    [""],
    ["Program-Blatt:"],
    ["  id    = interne Kurz-ID des GANZEN Programms. klein, keine Leerzeichen/Umlaute."],
    ["          Nie sichtbar, nur Technik. Pro Block eindeutig. Beispiel: mushin-p2"],
    ["  name  = SICHTBARER Programmname auf der Startseite. Klartext mit Leerzeichen ok."],
    ["          Beispiel: Mushin - Phase 2: Hypertrophie"],
    ["  weeks = Anzahl Wochen (Zahl). Beispiel: 3"],
    [""],
    ["Exercises-Blatt - die drei Tag-Felder (in JEDER Zeile eines Tages GLEICH eintragen):"],
    ["  day_id    = stabile interne ID des Tages. klein, keine Leerzeichen/Umlaute."],
    ["              Verbindet alle Zeilen eines Tages UND verknuepft mit dem Warmups-Blatt."],
    ["              >>> EXAKT derselbe Wert muss im Warmups-Blatt stehen, sonst landet das"],
    ["              Warm-up im Nichts und es entsteht ein leerer Geister-Tag! <<<"],
    ["              Beispiel: tag1   (nicht 'Tag 1' mit Leerzeichen)"],
    ["  day_name  = kurzes Label auf den Kacheln der Startseite. Kurz halten. Beispiel: Tag 1"],
    ["  day_title = volle Ueberschrift oben in der Logging-Ansicht. Darf beschreibend sein."],
    ["              Einheitlich bleiben (nicht mischen Tag1.. / Day3..). Beispiel: Tag 1 - Squat"],
    [""],
    ["  label     = Uebungs-Label. Bei Supersaetzen pro Uebung UNTERSCHIEDLICH: 2a, 2b, 2c"],
    ["              (NICHT zweimal 2a! sonst sehen beide gleich aus)"],
    ["  weight    = Richtgewicht kg. Bei Koerpergewicht-Uebungen LEER lassen (nicht 0)."],
    ["  reps      = immer ausfuellen, auch bei Power-Uebungen (sonst zeigt die App leer)."],
    [""],
    ["Merksatz: day_id = fuer die App (technisch, einmal festlegen, nie aendern),"],
    ["          day_name = kurz fuer Kacheln, day_title = lang fuer die Kopfzeile."],
    ["          day_id im Exercises- UND Warmups-Blatt muss identisch sein."],
    [""],
    ["Danach konvertieren:  python tools/xlsx2program.py Program_Template.xlsx"],
    ["Das erzeugt program.json. Claude pusht es; auf dem Handy: Data -> Reload program from file."],
]

PROGRAM = [
    ["key", "value"],
    ["id", "block-2026-08"],
    ["name", "Neues Programm"],
    ["weeks", 6],
]

EX_HEADER = ["day_id", "day_name", "day_title", "block", "label", "exercise",
             "sets", "reps", "rpe", "weight", "progress_lift", "max_lift_name"]
EXERCISES = [
    EX_HEADER,
    # Day 1 Lower
    ["lower", "Lower", "Day 1 — Lower", "A", "1", "Hang Power Shrug", None, "6,5,4", "6,7,8", None, "", ""],
    ["lower", "Lower", "Day 1 — Lower", "B", "2a", "Back Squats", 3, "3", 8, 100, "x", "Back Squat"],
    ["lower", "Lower", "Day 1 — Lower", "B", "2b", "DB Jumps", 3, "10-12", 6, 12, "", ""],
    ["lower", "Lower", "Day 1 — Lower", "C", "3a", "Romanian Deadlift", 3, "3", 8, 90, "x", "Romanian Deadlift"],
    ["lower", "Lower", "Day 1 — Lower", "C", "3b", "KB Swings", 3, "10-12", 6, 12, "", ""],
    # Day 2 Upper
    ["upper", "Upper", "Day 2 — Upper", "A", "1a", "Single Arm DB Bench Press", 3, "5/side", 8, 22, "x", "Single Arm DB Bench (per arm)"],
    ["upper", "Upper", "Day 2 — Upper", "A", "1b", "Banded Push Ups", 3, "10-12", 6, None, "", ""],
    ["upper", "Upper", "Day 2 — Upper", "B", "3a", "Lateral Raise", 3, "15", 6, None, "", ""],
    ["upper", "Upper", "Day 2 — Upper", "B", "3b", "Rear Delt Fly", 3, "15", 6, None, "", ""],
    ["upper", "Upper", "Day 2 — Upper", "B", "3c", "Tricep Dips", 3, "15", 6, None, "x", ""],
]

WARMUPS = [
    ["day_id", "kind", "title", "item1", "item2", "item3"],
    ["lower", "warmup", "Warm-up · ~8–10 min", "Mobility: Hüfte, Sprunggelenk, BWS", "Ramp-up Sätze bis Arbeitsgewicht", None],
    ["lower", "plyo", "Plyo / Core", "Reverse Pogos :: 20 reps · 30s · 2-3 Runden", "Slam Ball Slams :: 6 reps · 45s · 2 Runden", None],
    ["upper", "warmup", "Warm-up · ~8–10 min", "Mobility: Schultern, BWS, Handgelenke", "Ramp-up Sätze bis Arbeitsgewicht", None],
    ["upper", "plyo", "Plyo / Core", "Reverse Pogos :: 20 reps · 30s · 2-3 Runden", "Nordic Curls :: 5 reps · 45s · 2 Runden", None],
]

SHEETS = [("Anleitung", ANLEITUNG), ("Program", PROGRAM),
          ("Exercises", EXERCISES), ("Warmups", WARMUPS)]


def col_letter(n):
    s = ''
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def esc(s):
    return (str(s).replace('&', '&amp;').replace('<', '&lt;')
            .replace('>', '&gt;').replace('"', '&quot;'))


def cell_xml(ref, val):
    if val is None or val == '':
        return ''
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        return f'<c r="{ref}"><v>{val}</v></c>'
    return f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{esc(val)}</t></is></c>'


def sheet_xml(rows):
    out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
           '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>']
    for ri, row in enumerate(rows, start=1):
        cells = ''.join(cell_xml(f'{col_letter(ci)}{ri}', v) for ci, v in enumerate(row, start=1))
        out.append(f'<row r="{ri}">{cells}</row>')
    out.append('</sheetData></worksheet>')
    return ''.join(out)


def build(path):
    n = len(SHEETS)
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + ''.join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(1, n + 1))
        + '</Types>')
    root_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
                 '</Relationships>')
    sheets_xml = ''.join(f'<sheet name="{esc(name)}" sheetId="{i}" r:id="rId{i}"/>' for i, (name, _) in enumerate(SHEETS, 1))
    workbook = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                f'<sheets>{sheets_xml}</sheets></workbook>')
    wb_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
               '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
               + ''.join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1, n + 1))
               + '</Relationships>')

    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', content_types)
        z.writestr('_rels/.rels', root_rels)
        z.writestr('xl/workbook.xml', workbook)
        z.writestr('xl/_rels/workbook.xml.rels', wb_rels)
        for i, (_, rows) in enumerate(SHEETS, 1):
            z.writestr(f'xl/worksheets/sheet{i}.xml', sheet_xml(rows))
    print('wrote', path)


if __name__ == '__main__':
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    build(os.path.join(repo, 'Program_Template.xlsx'))
