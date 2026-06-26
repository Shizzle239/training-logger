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
| week           | leer/`1` = Basis (alle Wochen); `2`, `3`, … = Override nur für diese Woche (s. u.) |

**Supersätze / Trisätze:** mehrere Zeilen mit **gleichem `day_id` + `block`**.
Sie werden Runde für Runde abgewechselt (2a → 2b → 2a → 2b …). Eine einzelne
Zeile in einem Block = Straight Sets.

**Unterschiedliche Reps pro Satz** (z. B. Hang Power Shrug 6/5/4):
`reps = "6,5,4"`, `rpe = "6,7,8"`, `sets` leer lassen.

**Wochenweise Variation (`week`-Spalte, optional).** Leer oder `1` = Basis, gilt für
alle Wochen. `week = 2`, `3`, … = Override **nur** für diese Woche — zwei Modi, automatisch
erkannt:

- **Gleiche Übung, neue Zahlen** — eine `week=N`-Zeile mit demselben Übungsnamen wie in
  der Basis, aber anderen `reps`/`rpe`/`weight`. Nur die Zahlen ändern sich für Woche N,
  die Struktur bleibt geteilt. Ideal für Last-/RPE-Progression. Nur die Felder, die du
  ausfüllst, werden überschrieben (Rest erbt die Basis). Beispiel: Back Squats Woche 2 auf
  102.5 kg, Woche 3 auf 105 kg — siehe die letzten zwei Zeilen in der Vorlage.
- **Neue/andere Übungen** — listest du in `week=N` mindestens eine Übung auf, die es in der
  Basis **nicht** gibt, wird die ganze Woche N für diesen Tag **eigenständig** und komplett
  aus den `week=N`-Zeilen gebaut (eigene Übungen/Struktur, z. B. eine Deload-Woche).

Beides landet in der App genau wie der In-App-Planbuilder (Zielwerte pro Woche bzw.
eigenständige Wochen) und ist dort weiter editierbar.

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
