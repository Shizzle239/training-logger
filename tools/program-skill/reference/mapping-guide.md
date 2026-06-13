# Mapping-Guide: beliebige Plan-Übersicht → Template

So bildest du verschiedene Quellformate auf die Excel-Struktur ab. Bei jeder
Unklarheit: **nachfragen, nicht raten.**

## 1. Quelle erfassen

| Quellformat | Vorgehen |
|-------------|----------|
| Tabelle (pasted/CSV/anderes Excel) | Spalten den Template-Feldern zuordnen. |
| Foto / Screenshot | Inhalt ablesen, Tabelle rekonstruieren, dann mappen. |
| PDF | Text/Tabelle extrahieren, dann wie Tabelle behandeln. |
| Textliste / Fließtext | Tage und Übungen herausparsen; Struktur oft implizit. |

## 2. Struktur erkennen

- **Tage:** Wie viele Trainingseinheiten? Jede wird ein `day_id`/`day_name`/`day_title`.
- **Gruppierung:** Stehen Übungen als „A1/A2", „2a/2b", „Superset", eingerückt
  oder mit Klammer zusammen? → gleicher `block`. Sonst = eigener block (Straight).
- **Schema:** Sätze × Reps × (RPE) × (Gewicht). „3×10" → sets=3, reps=10.
  „4×8 @RPE7 @60kg" → sets=4, reps=8, rpe=7, weight=60.
- **Pro-Satz-Variation:** „6/5/4" oder „12,10,8" → reps="6,5,4", sets leer.

## 3. Typische Lücken → gezielte Rückfrage

| Lücke in der Quelle | Frage an den User |
|---------------------|-------------------|
| Keine Reps angegeben | „Wie viele Wiederholungen für \<Übung\>?" |
| Kein Satz-Zähler | „Wie viele Sätze/Runden für \<Block\>?" |
| Superset unklar | „Sind \<A\> und \<B\> ein Superset (abwechselnd) oder getrennt?" |
| Kein RPE | RPE ist optional → weglassen, nicht erfinden. |
| Gewicht fehlt | Optional; bei Körpergewicht leer lassen, sonst fragen ob Richtwert gewünscht. |
| Power- vs. Kraft-Übung unklar | „Ist \<Übung\> explosiv (wenige Reps) oder Hypertrophie?" |
| Tagesnamen fehlen | Sinnvolle kurze Namen vorschlagen und bestätigen lassen. |

## 4. IDs vergeben

- `day_id`: kurz, lowercase, keine Leerzeichen. z.B. `tag1`, `push`, `lower-a`.
- `id` (Programm): lowercase-Slug, eindeutig pro Block. z.B. `hypertrophy-2026-08`.
- Für einen **neuen Block** bewusst neue `day_id`s/Übungsnamen, wenn alte Logs in
  Progress/Archiv getrennt bleiben sollen (gleiche IDs werden in Charts gemerged).

## 5. progress_lift / max_lift_name setzen

- `progress_lift = x` für die 1–4 Schlüssel-Lifts, deren Verlauf interessiert.
- `max_lift_name` für Lifts mit 1RM-Tracking (Squat, Bench, Deadlift, …).
- Im Zweifel: beim User nachfragen, welche Lifts er im Auge behalten will.

## 6. Vor dem Bauen: Invarianten-Check

Gehe `reference/target-format.md` → „Harte Invarianten" durch. Besonders:
gleiche `day_id` in Exercises UND Warmups, distinkte Superset-Labels, `reps`
überall gesetzt, kein `weight=0`, keine Müllzeilen.

## 7. Bauen & Validieren

`reference/build_template.py` (Zell-Daten anpassen) → `.xlsx`, dann mit
`reference/xlsx2program.py` zu JSON konvertieren und prüfen (siehe SKILL.md).
