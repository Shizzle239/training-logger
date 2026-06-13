"""build_template.py — write a Program_Template.xlsx from the cell data below.

Self-contained (Python stdlib only). EDIT the PROGRAM / EXERCISES / WARMUPS lists
to match the mapped training plan, then run:

    python build_template.py "MyPlan.xlsx"

Column contracts are in reference/target-format.md. Use None for empty cells.
"""
import os
import sys
import zipfile

# ======================================================================
#  EDIT BELOW — fill these three tables from the source plan.
#  (Values shown are an example; replace them.)
# ======================================================================

PROGRAM = [
    ["key", "value"],
    ["id", "new-block"],                 # lowercase slug, unique per block
    ["name", "Neues Programm"],          # visible name on the home screen
    ["weeks", 4],                        # number of weeks
]

EX_HEADER = ["day_id", "day_name", "day_title", "block", "label", "exercise",
             "sets", "reps", "rpe", "weight", "progress_lift", "max_lift_name"]
EXERCISES = [
    EX_HEADER,
    # day_id, day_name, day_title, block, label, exercise, sets, reps, rpe, weight, progress, max_name
    ["tag1", "Tag 1", "Tag 1 — Push", "A", "1a", "Bench Press",   3, "8",     7, 80,   "x", "Bench Press"],
    ["tag1", "Tag 1", "Tag 1 — Push", "A", "1b", "Band Pull-up",  3, "8",     7, None, "",  ""],
    ["tag1", "Tag 1", "Tag 1 — Push", "B", "2",  "Overhead Press",3, "10",    7, 40,   "x", ""],
    # ... add more rows; same day_id+block = superset; distinct labels (2a,2b); reps always set
]

WARMUPS = [
    ["day_id", "kind", "title", "item1", "item2", "item3"],
    ["tag1", "warmup", "Warm-up · ~8 min", "Mobility: Schultern, BWS", "Ramp-up Sätze", None],
    ["tag1", "plyo", "Plyo / Core", "Med Ball Throw :: 5 reps · 45s · 2 Runden", None, None],
    # day_id MUST match a day_id used in EXERCISES (or a skip-day note)
]

# ======================================================================
#  Do not edit below this line.
# ======================================================================

ANLEITUNG = [
    ["Program_Template — von build_template.py erzeugt."],
    ["Felder/Regeln: siehe reference/target-format.md."],
    ["Import: App -> Data -> 'Programm importieren (Excel / JSON)'."],
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
    out = sys.argv[1] if len(sys.argv) > 1 else 'Program_Template.xlsx'
    build(os.path.abspath(out))
