# Neue Trainingsphase erstellen

Workflow, um ein neues Programm in die App zu bekommen — ohne Code anzufassen.

## 1. Vorlage öffnen

`Program_Template.xlsx` (im Repo-Hauptordner). Sie ist mit einem Beispiel-Programm
gefüllt, das du als Referenz überschreiben kannst. Vier Tabellenblätter:

- **Anleitung** — Kurzreferenz (nur Lesen).
- **Program** — Name + Wochenzahl des Blocks.
- **Exercises** — eine Zeile pro Übung.
- **Warmups** — Warm-up- und Plyo-Blöcke pro Tag (optional).

## 2. Program-Blatt

| key   | value                |
|-------|----------------------|
| id    | block-2026-08        | ← kurze ID (optional, sonst aus dem Namen)
| name  | 8-Week Hypertrophy   | ← wird auf der Startseite angezeigt
| weeks | 6                    | ← Anzahl Wochen

## 3. Exercises-Blatt

Eine Zeile = eine geloggte Übung. Spalten:

| Spalte         | Bedeutung |
|----------------|-----------|
| day_id         | Stabile ID des Tages (`lower`, `upper`, `comp-lower` …) |
| day_name       | Kurzname auf den Kacheln (`Lower`) |
| day_title      | Volle Überschrift (`Day 1 — Lower`) |
| block          | Gruppen-ID im Tag (`A`, `B`, `C` …) |
| label          | Übungs-Label (`1`, `2a`, `2b`) |
| exercise       | Übungsname |
| sets           | Anzahl Sätze / Runden |
| reps           | Ziel-Reps (`3`, `10-12`, `8/side`) |
| rpe            | Ziel-RPE (Zahl, optional) |
| weight         | Richtgewicht kg (Zahl, optional) |
| progress_lift  | `x` → Übung erscheint im Progress-Tab als Chart |
| max_lift_name  | Name → Lift erscheint im Maxes-Tab |

**Supersätze / Trisätze:** mehrere Zeilen mit **gleichem `day_id` + `block`**.
Sie werden Runde für Runde abgewechselt (2a → 2b → 2a → 2b …). Eine einzelne
Zeile in einem Block = Straight Sets.

**Unterschiedliche Reps pro Satz** (z. B. Hang Power Shrug 6/5/4):
`reps = "6,5,4"`, `rpe = "6,7,8"`, `sets` leer lassen.

**Übersprungener Tag** (Taper-Ruhetag): in **Warmups** einen Eintrag mit der
Notiz anlegen und in **Exercises keine** Zeilen für diesen `day_id` — die App
zeigt ihn dann als reinen Infotag (wie der gestrichene Upper-Tag in der Comp Week).

## 4. Warmups-Blatt (optional)

| day_id | kind   | title              | item1 | item2 | … |
|--------|--------|--------------------|-------|-------|---|
| lower  | warmup | Warm-up · ~8 min   | Mobility …        | Ramp-up … | |
| lower  | plyo   | Plyo / Core        | Reverse Pogos :: 20 reps · 30s · 2 Runden | … | |

`kind` ist `warmup` oder `plyo`. Plyo-Einträge im Format **`Name :: schema`**.

## 5. Konvertieren

```
python tools/xlsx2program.py Program_Template.xlsx
```

Das schreibt `program.json` im Repo. Prüfen, committen, pushen — oder Claude
bitten: „konvertiere die Vorlage und pushe". `sw.js` VERSION nicht vergessen
hochzuzählen (macht Claude beim Pushen mit).

## 6. Auf dem Handy aktivieren

App online öffnen → kurz schliessen und neu öffnen (holt die neue Version) →
**Data → Reload program from file**. Alle geloggten Daten, Maxes und das Archiv
bleiben erhalten.

> Tipp: vergib für einen neuen Block **neue, eigene `day_id`s/Übungsnamen**, wenn
> du die alten Sessions sauber getrennt im Archiv/Progress sehen willst. Gleiche
> IDs würden in den Charts zusammengefasst.
