"""Dump all sheets of the Excel training logger (stdlib only)."""
import sys
import zipfile
import xml.etree.ElementTree as ET

M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'

PATH = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\nalyd\Downloads\Training_Logger_6wk-final.xlsx"

z = zipfile.ZipFile(PATH)
wb = ET.fromstring(z.read('xl/workbook.xml'))
rels = {r_.get('Id'): r_.get('Target') for r_ in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
sheets = [(s.get('name'), rels[s.get(R + 'id')]) for s in wb.find(M + 'sheets')]
sst = []
if 'xl/sharedStrings.xml' in z.namelist():
    sst = [''.join(t.text or '' for t in si.iter(M + 't'))
           for si in ET.fromstring(z.read('xl/sharedStrings.xml'))]


def colnum(ref):
    n = 0
    for ch in ref:
        if ch.isalpha():
            n = n * 26 + ord(ch.upper()) - 64
        else:
            break
    return n


def colname(n):
    s = ''
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


for name, target in sheets:
    path = 'xl/' + target.lstrip('/').replace('../', '')
    print(f"\n===== SHEET: {name} =====")
    root = ET.fromstring(z.read(path))
    count = 0
    for row in root.iter(M + 'row'):
        rn = int(row.get('r'))
        cells = []
        for c in row.iter(M + 'c'):
            ref = c.get('r')
            t = c.get('t')
            v = c.find(M + 'v')
            f = c.find(M + 'f')
            val = None
            if t == 's' and v is not None:
                val = sst[int(v.text)]
            elif t == 'inlineStr':
                val = ''.join(tt.text or '' for tt in c.iter(M + 't'))
            elif v is not None:
                val = v.text
            out = ''
            if val not in (None, ''):
                out = str(val)
            if f is not None and f.text:
                out += ' ={' + f.text + '}'
            if out:
                cells.append(f"{colname(colnum(ref))}:{out}")
        if cells:
            count += 1
            print(f"r{rn}  " + ' | '.join(cells))
        if count > 400:
            print('... (truncated)')
            break
