"""xlsx2program.py — convert the program template (.xlsx) into program.json.

Usage:
    python tools/xlsx2program.py "C:\\path\\to\\Program_Template.xlsx" [output.json]

If output is omitted, writes program.json next to this repo's index.html.
Stdlib only (no pandas/openpyxl needed) — reads the .xlsx as a zip.

TEMPLATE CONTRACT
=================
Sheet "Program"  (key/value, column A = key, column B = value):
    id            short id, e.g. block-2026-08         (optional; auto from name)
    name          display name, e.g. "8-Week Hypertrophy"
    weeks         number of weeks, e.g. 6

Sheet "Exercises" (one row per logged set-group; header row 1):
    day_id        stable id for the day, e.g. lower / upper / comp-lower
    day_name      short label shown on tiles, e.g. "Lower"
    day_title     full heading, e.g. "Day 1 — Lower"
    block         group id within the day, e.g. A / B / C  (rows sharing a block = one superset/triset)
    label         exercise label, e.g. 1, 2a, 2b
    exercise      exercise name
    sets          number of sets/rounds (e.g. 3)
    reps          target reps, e.g. 3 or 10-12 or 8/side
    rpe           target RPE (number, optional)
    weight        guide weight kg (number, optional)
    progress_lift x / yes  -> include this exercise on the Progress charts (optional)
    max_lift_name if set, adds/uses this lift on the Maxes screen (optional)

Rules:
 - Rows with the same (day_id, block) form ONE block. 1 row = straight sets,
   2+ rows = superset/triset interleaved across `sets` rounds.
 - For a SKIPPED day (e.g. taper rest day): add the day's warm-up note via the
   Warmups sheet and simply add NO exercise rows for it -> renders as an info-only day.
 - Per-set reps for straight blocks: if you want different reps per set (like the
   Hang Power Shrug 6/5/4), put them comma-separated in `reps` (e.g. "6,5,4")
   and matching `rpe` (e.g. "6,7,8"); `sets` is then inferred from the count.

Sheet "Warmups" (optional; column A = day_id, B = block kind, C = title, D.. = items):
    day_id   matches Exercises.day_id (or a skipped day)
    kind     "warmup" or "plyo"
    title    heading for the block
    item     one item per following column (D, E, F, ...). For plyo, use "Name :: scheme".
"""
import json
import re
import sys
import os
import zipfile
import xml.etree.ElementTree as ET

M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'


def colnum(ref):
    n = 0
    for ch in ref:
        if ch.isalpha():
            n = n * 26 + ord(ch.upper()) - 64
        else:
            break
    return n


def load_sheets(path):
    z = zipfile.ZipFile(path)
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = {r.get('Id'): r.get('Target')
            for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    sst = []
    if 'xl/sharedStrings.xml' in z.namelist():
        sst = [''.join(t.text or '' for t in si.iter(M + 't'))
               for si in ET.fromstring(z.read('xl/sharedStrings.xml'))]
    sheets = {}
    for s in wb.find(M + 'sheets'):
        name = s.get('name')
        target = rels[s.get(R + 'id')]
        path_in = 'xl/' + target.lstrip('/').replace('../', '')
        rows = {}
        for row in ET.fromstring(z.read(path_in)).iter(M + 'row'):
            rn = int(row.get('r'))
            cells = {}
            for c in row.iter(M + 'c'):
                ref = c.get('r')
                t = c.get('t')
                v = c.find(M + 'v')
                val = None
                if t == 's' and v is not None:
                    val = sst[int(v.text)]
                elif t == 'inlineStr':
                    val = ''.join(tt.text or '' for tt in c.iter(M + 't'))
                elif v is not None:
                    val = v.text
                if val is not None and str(val).strip() != '':
                    cells[colnum(ref)] = str(val).strip()
            if cells:
                rows[rn] = cells
        sheets[name] = rows
    return sheets


def slugify(s):
    s = re.sub(r'[^a-z0-9]+', '-', str(s).lower()).strip('-')
    return s or 'ex'


def to_num(s):
    if s is None or str(s).strip() == '':
        return None
    try:
        f = float(str(s).replace(',', '.'))
        return int(f) if f == int(f) else f
    except ValueError:
        return None


def truthy(s):
    return str(s).strip().lower() in ('x', 'yes', 'y', 'true', '1', 'ja')


def kv_sheet(rows):
    out = {}
    for rn in sorted(rows):
        c = rows[rn]
        if 1 in c:
            out[c[1].strip().lower()] = c.get(2, '').strip()
    return out


def table_sheet(rows):
    if not rows:
        return []
    rn_sorted = sorted(rows)
    header_rn = rn_sorted[0]
    header = {col: rows[header_rn][col].strip().lower() for col in rows[header_rn]}
    out = []
    for rn in rn_sorted[1:]:
        rec = {}
        for col, val in rows[rn].items():
            key = header.get(col)
            if key:
                rec[key] = val
        if any(v.strip() for v in rec.values()):
            out.append(rec)
    return out


def warmups_by_day(rows):
    """day_id -> {'warmup': {...}, 'plyo': {...}}"""
    out = {}
    if not rows:
        return out
    rn_sorted = sorted(rows)
    for rn in rn_sorted[1:]:
        c = rows[rn]
        day = c.get(1, '').strip()
        kind = c.get(2, '').strip().lower()
        title = c.get(3, '').strip()
        items = [c[col].strip() for col in sorted(c) if col >= 4 and c[col].strip()]
        if not day or kind not in ('warmup', 'plyo'):
            continue
        entry = out.setdefault(day, {})
        if kind == 'warmup':
            entry['warmup'] = {'title': title or 'Warm-up', 'items': items}
        else:
            plyo_items = []
            for it in items:
                if '::' in it:
                    nm, sch = it.split('::', 1)
                    plyo_items.append({'name': nm.strip(), 'scheme': sch.strip()})
                else:
                    plyo_items.append({'name': it, 'scheme': ''})
            entry['plyo'] = {'title': title or 'Plyo / Core', 'items': plyo_items}
    return out


def _group_day_rows(rows):
    """group one day's exercise rows into ordered blocks of raw entries"""
    block_order = []
    blocks = {}
    for r in rows:
        block_id = (r.get('block') or 'X').strip()
        if block_id not in blocks:
            block_order.append(block_id)
            blocks[block_id] = []
        ex_id = slugify(r.get('exercise') or block_id)
        reps_raw = (r.get('reps') or '').strip()
        rpe_raw = (r.get('rpe') or '').strip()
        n_sets = to_num(r.get('sets'))
        blocks[block_id].append({
            'id': ex_id,
            'label': (r.get('label') or '').strip(),
            'name': (r.get('exercise') or '').strip(),
            'reps': reps_raw,
            'rpe': to_num(rpe_raw),
            'weight': to_num(r.get('weight')),
            'sets': int(n_sets) if n_sets else None,
            'per_set_reps': [x.strip() for x in reps_raw.split(',')] if ',' in reps_raw else None,
            'per_set_rpe': [x.strip() for x in rpe_raw.split(',')] if ',' in rpe_raw else None,
        })
    return block_order, blocks


def _blocks_from_groups(block_order, blocks_map):
    """turn grouped raw entries into straight/superset blocks (shared by base + per-week)"""
    blocks = []
    for block_id in block_order:
        exs = blocks_map[block_id]
        if len(exs) == 1 and (exs[0]['per_set_reps'] or (exs[0]['sets'] and not exs[0]['weight'] and exs[0]['label'] and exs[0]['label'].isdigit())):
            ex = exs[0]
            sets = []
            if ex['per_set_reps']:
                for i, rp in enumerate(ex['per_set_reps']):
                    rpe = ex['per_set_rpe'][i] if ex['per_set_rpe'] and i < len(ex['per_set_rpe']) else None
                    sets.append({'reps': rp, 'rpe': to_num(rpe) if rpe else ex['rpe'], 'weight': ex['weight']})
            else:
                for _ in range(ex['sets'] or 1):
                    sets.append({'reps': ex['reps'], 'rpe': ex['rpe'], 'weight': ex['weight']})
            blocks.append({
                'id': block_id, 'type': 'straight',
                'exercises': [{'id': ex['id'], 'label': ex['label'], 'name': ex['name'], 'sets': sets}],
            })
        elif len(exs) == 1:
            ex = exs[0]
            sets = []
            for _ in range(ex['sets'] or 1):
                sets.append({'reps': ex['reps'], 'rpe': ex['rpe'], 'weight': ex['weight']})
            blocks.append({
                'id': block_id, 'type': 'straight',
                'exercises': [{'id': ex['id'], 'label': ex['label'], 'name': ex['name'], 'sets': sets}],
            })
        else:
            rounds = max((e['sets'] or 1) for e in exs)
            blocks.append({
                'id': block_id, 'type': 'superset', 'rounds': rounds,
                'exercises': [{
                    'id': e['id'], 'label': e['label'], 'name': e['name'],
                    'target': {'reps': e['reps'], 'rpe': e['rpe'], 'weight': e['weight']},
                } for e in exs],
            })
    return blocks


def build_program(sheets):
    meta = kv_sheet(sheets.get('Program', {}))
    name = meta.get('name') or 'Untitled Program'
    weeks = to_num(meta.get('weeks')) or 1
    pid = meta.get('id') or slugify(name)

    ex_rows = table_sheet(sheets.get('Exercises', {}))
    warmups = warmups_by_day(sheets.get('Warmups', {}))

    # split base rows (no week / week 1) from per-week override rows (week >= 2)
    base_rows = []
    week_rows = {}        # day_id -> {N -> [rows]}
    progress_lifts = []
    max_lifts = {}
    for r in ex_rows:
        day_id = (r.get('day_id') or '').strip()
        if not day_id:
            continue
        ex_id = slugify(r.get('exercise') or (r.get('block') or 'X'))
        if truthy(r.get('progress_lift', '')) and ex_id not in progress_lifts:
            progress_lifts.append(ex_id)
        mln = (r.get('max_lift_name') or '').strip()
        if mln:
            max_lifts[slugify(mln)] = mln
        wk = to_num(r.get('week'))
        if wk and wk >= 2:
            week_rows.setdefault(day_id, {}).setdefault(int(wk), []).append(r)
        else:
            base_rows.append(r)

    day_order = []
    day_groups = {}
    day_meta = {}
    for r in base_rows:
        day_id = (r.get('day_id') or '').strip()
        if day_id not in day_groups:
            day_order.append(day_id)
            day_groups[day_id] = []
            day_meta[day_id] = {'name': r.get('day_name') or day_id,
                                'title': r.get('day_title') or r.get('day_name') or day_id}
        day_groups[day_id].append(r)

    out_days = []
    seen_days = set(day_order)
    for day_id in list(day_order) + [d for d in warmups if d not in seen_days]:
        seen_days.add(day_id)
        dm = day_meta.get(day_id, {'name': day_id, 'title': day_id})
        day_obj = {'id': day_id, 'name': dm['name'], 'title': dm['title']}
        wu = warmups.get(day_id, {})
        if wu.get('warmup'):
            day_obj['warmup'] = wu['warmup']
        if wu.get('plyo'):
            day_obj['plyo'] = wu['plyo']
        block_order, blocks_map = _group_day_rows(day_groups.get(day_id, []))
        blocks = _blocks_from_groups(block_order, blocks_map)
        day_obj['blocks'] = blocks
        if not blocks and not wu:
            day_obj['plyo'] = {'title': '—', 'items': []}

        # per-week overrides: target overlay if all rows match base exercises, else independent week
        wr = week_rows.get(day_id)
        if wr:
            base_ex_ids = set()
            for b in blocks:
                for ex in b['exercises']:
                    base_ex_ids.add(ex['id'])
            for n in sorted(wr):
                rws = wr[n]
                all_exist = len(base_ex_ids) > 0 and all(
                    slugify(r.get('exercise') or (r.get('block') or 'X')) in base_ex_ids for r in rws)
                if all_exist:
                    wt = day_obj.setdefault('weekTargets', {})
                    ov = wt.setdefault(str(n), {})
                    for r in rws:
                        ex_id = slugify(r.get('exercise') or (r.get('block') or 'X'))
                        t = {}
                        reps_raw = (r.get('reps') or '').strip()
                        if reps_raw:
                            t['reps'] = reps_raw
                        rpe = to_num(r.get('rpe'))
                        if rpe is not None:
                            t['rpe'] = rpe
                        wgt = to_num(r.get('weight'))
                        if wgt is not None:
                            t['weight'] = wgt
                        ov.setdefault(ex_id, {}).update(t)
                else:
                    g_order, g_map = _group_day_rows(rws)
                    wo = day_obj.setdefault('weekOverride', {})
                    wo[str(n)] = {
                        'warmup': day_obj.get('warmup') or {'title': 'Warm-up', 'items': []},
                        'plyo': day_obj.get('plyo') or {'title': 'Plyo / Core', 'items': []},
                        'blocks': _blocks_from_groups(g_order, g_map),
                    }
        out_days.append(day_obj)

    # default max lifts if none specified
    if not max_lifts:
        max_lifts = {
            'back-squat': 'Back Squat', 'rdl': 'Romanian Deadlift',
            'sa-db-bench': 'Single Arm DB Bench (per arm)',
            'trap-bar-squat': 'Trap Bar Squat', 'hip-thrust': 'Hip Thrust',
        }

    return {
        'id': pid,
        'name': name,
        'weeks': int(weeks),
        'days': out_days,
        'maxLifts': [{'id': k, 'name': v} for k, v in max_lifts.items()],
        'progressLifts': progress_lifts,
    }


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    src = sys.argv[1]
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(repo, 'program.json')
    sheets = load_sheets(src)
    prog = build_program(sheets)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(prog, f, indent=2, ensure_ascii=False)
    days = len(prog['days'])
    logged = sum(len(b.get('exercises', [])) for d in prog['days'] for b in d.get('blocks', []))
    print(f"OK -> {out}")
    print(f"   {prog['name']} · {prog['weeks']} weeks · {days} days · {logged} exercise entries")
    print(f"   progressLifts: {prog['progressLifts']}")


if __name__ == '__main__':
    main()
