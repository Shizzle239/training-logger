# Zielform: Program_Template.xlsx (Source of Truth)

Die Excel hat **vier Tabellenblätter**. Nur *Program* und *Exercises* sind
zwingend; *Warmups* ist optional; *Anleitung* ist reine Doku.

---

## Blatt "Program" — key/value (Spalte A = key, Spalte B = value)

| key   | Bedeutung | Beispiel |
|-------|-----------|----------|
| id    | interne Kurz-ID des ganzen Programms. klein, keine Leerzeichen/Umlaute. Nie sichtbar. | `mushin-p2` |
| name  | SICHTBARER Programmname auf der Startseite. Klartext erlaubt. | `Mushin – Phase 2: Hypertrophie` |
| weeks | Anzahl Wochen (Zahl). | `3` |

---

## Blatt "Exercises" — eine Zeile pro geloggter Übung (Kopfzeile in Zeile 1)

Spalten (genau diese Namen, Reihenfolge egal):

| Spalte         | Pflicht | Bedeutung |
|----------------|:-------:|-----------|
| day_id         | ja | stabile Tages-ID. klein, KEINE Leerzeichen/Umlaute. Verbindet alle Zeilen eines Tages UND verknüpft mit dem Warmups-Blatt. |
| day_name       | ja | kurzes Label auf den Startseiten-Kacheln. z.B. `Tag 1` |
| day_title      | ja | volle Überschrift in der Logging-Ansicht. z.B. `Tag 1 — Squat` |
| block          | ja | Gruppen-ID im Tag (`A`, `B`, `C`, …). Gleicher block = ein Superset. |
| label          | ja | Übungs-Label. Bei Supersätzen pro Übung UNTERSCHIEDLICH: `2a`, `2b`, `2c`. |
| exercise       | ja | Übungsname. |
| sets           | meist | Anzahl Sätze/Runden (Zahl). |
| reps           | ja | Ziel-Reps: `3`, `10-12`, `8/side`. Immer ausfüllen. |
| rpe            | optional | Ziel-RPE (Zahl). |
| weight         | optional | Richtgewicht kg. Bei Körpergewicht-Übungen LEER lassen (nicht 0). |
| progress_lift  | optional | `x` → Übung erscheint im Progress-Tab als Chart. |
| max_lift_name  | optional | Name → Lift erscheint im Maxes-Tab (z.B. `Back Squat`). |

### Block-Regeln (wie der Konverter gruppiert)

- **1 Zeile** in einem block → **Straight Sets** (`sets` Sätze gleicher Vorgabe).
- **2+ Zeilen** mit gleichem `day_id`+`block` → **Superset/Triset**. Werden Runde
  für Runde abgewechselt (2a → 2b → 2a → 2b …). `rounds` = max(`sets`) der Zeilen.
- **Unterschiedliche Reps pro Satz** in einem Straight-Block (z.B. 6/5/4):
  `reps = "6,5,4"`, `rpe = "6,7,8"`, `sets` leer lassen — der Konverter erzeugt
  dann genau diese Sätze.

### Übersprungener Tag (Ruhe-/Skip-Tag)
Im **Warmups**-Blatt einen Eintrag (mit Notiztext) anlegen UND im **Exercises**-
Blatt KEINE Zeilen für diesen `day_id` → die App zeigt einen reinen Infotag.

---

## Blatt "Warmups" (optional) — Kopfzeile in Zeile 1

| Spalte | Bedeutung |
|--------|-----------|
| day_id | MUSS exakt einem `day_id` aus Exercises entsprechen (oder einem Skip-Tag). |
| kind   | `warmup` oder `plyo`. |
| title  | Überschrift des Blocks. |
| item1, item2, … | je ein Eintrag pro Spalte. Bei `plyo` Format `Name :: schema`, z.B. `Reverse Pogos :: 20 reps · 30s · 2 Runden`. |

---

## Harte Invarianten (immer prüfen)

1. **`day_id` ohne Leerzeichen/Umlaute**, und in Exercises + Warmups identisch.
2. **Labels innerhalb eines Supersets verschieden** (kein doppeltes `2a`).
3. **Jede Exercises-Zeile hat `reps`** (sonst leeres Ziel in der App).
4. **`weight` leer** bei Körpergewicht-Übungen (kein `0`).
5. **`day_title` einheitlich** über alle Tage (nicht „Tag"/„Day" mischen).
6. **Keine verwaisten/halbleeren Zeilen** (z.B. nur ein `x` in einer Spalte).

## Merksatz
`day_id` = technisch (für App + Warmup-Verknüpfung, nie ändern) ·
`day_name` = kurz (Kacheln) · `day_title` = lang (Kopfzeile).
