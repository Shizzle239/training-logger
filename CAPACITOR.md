# Capacitor-Migration (für später)

Die App läuft aktuell als **TWA** (APK-Hülle um die GitHub-Pages-Seite) — gut für
die Testphase, weil Updates automatisch per `git push` ankommen. Wenn die App
später **vollständig lokal / unabhängig** an andere verteilt werden soll, wird sie
mit **Capacitor** in die APK gebündelt (läuft im lokalen WebView, ohne Chrome,
ohne Hosting, offline ab erstem Start).

## Designregeln, die die Migration leicht halten

Diese Regeln gelten ab sofort für jedes Update, damit der Umstieg ein
Konfig-Schritt bleibt und kein Rewrite:

1. **Relative Pfade only.** Niemals absolute `https://shizzle239.github.io/...`
   im App-Code (HTML/JS/CSS). Solche URLs nur in Doku und Deploy-Schritten.
2. **Kein Feature, das einen Service Worker voraussetzt.** Im Capacitor-WebView
   gibt es keinen SW. Offline muss ohne SW funktionieren (bei Capacitor sind die
   Assets ohnehin lokal gebündelt). `sw.js` ist nur für die TWA da.
3. **Programm-Import ist der primäre Weg, ein Programm zu setzen.**
   "Gehostetes neu laden" (`fetch program.json`) ist ein Extra für die TWA und
   darf nie der *einzige* Weg sein — sonst hätte die Capacitor-Version keinen Weg,
   ein Programm zu wechseln.
4. **Alle Assets lokal.** Bilder, Fonts, Libs im Repo, nie per CDN nachladen.
   (Charts sind Inline-SVG — passt.)
5. **Daten in IndexedDB**, Export/Import als Brücke. Beim Umstieg TWA→APK zieht
   ein Nutzer seine Logs per JSON-Export/-Import mit (eigene WebView-Storage).
6. **Keine Browser-spezifischen APIs** ohne Fallback (z. B. `navigator.share`,
   `localStorage` nur für Prefs wie `wl.lastExport`).

## Build-Schritte (wenn es so weit ist)

Voraussetzungen sind schon installiert (JDK 17, Android SDK, Keystore in
`OneDrive\WorkoutTracker-keys`).

```bash
# im Repo
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Training Logger" io.github.shizzle239.traininglogger --web-dir .
npx cap add android
npx cap copy
# signieren mit dem BESTEHENDEN keystore (gleicher Key wie die TWA-APK!)
cd android && ./gradlew assembleRelease
# -> app/build/outputs/apk/release/, dann mit apksigner signieren
```

Beim Bündeln zusätzlich:
- `index.html`: die `navigator.serviceWorker.register('sw.js')`-Zeile schadet
  nicht (schlägt im WebView still fehl), kann aber entfernt werden.
- `program.json` wird mitgebündelt → die App startet mit dem aktuellen Programm;
  Empfänger wechseln Phasen via **Data → Programm importieren (JSON)**.

## Verteilung an andere (Capacitor-Variante)

1. Signierte `.apk` verschicken (WhatsApp/Telegram/E-Mail).
2. Empfänger: "Installation aus unbekannten Quellen" einmalig erlauben → installieren.
3. Trainingsphasen als `program.json` schicken → **Data → Programm importieren**.
4. Updates = neue APK verschicken (mit demselben Keystore signiert!).
