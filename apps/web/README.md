# @bestbpmn/web

Die Web-App von bestbpmn: bpmn-js mit der Erweiterung aus [`@bestbpmn/bpmn-js-extension`](../../packages/bpmn-js-extension/README.md). Das bpmn.io-Wasserzeichen bleibt sichtbar und darf nicht verdeckt werden.

## Starten

```sh
npm install
npm run dev -w @bestbpmn/web   # öffnet http://localhost:5173
```

Die Seite startet mit einem leeren Diagramm. Unter „Neu“ gibt es die Vorlagen „Dokumentenfreigabe“ und „Incident“ (Swimlanes, mehrere Startereignisse, eine Multi-Instanz-Aufgabe). „Speichern“ und Strg+S schreiben in die offene Datei im Arbeitsordner, ohne Ordner wird heruntergeladen; „Exportieren“ bietet BPMN, SVG und PNG an, „Bericht“ den Steckbrief und das Gesamtdokument als HTML-Datei oder zum Drucken (PDF). Eine `.bpmn`-Datei kann man auch auf das Fenster ziehen. Rechts gibt es diese Reiter: **Eigenschaften** zeigt das Eigenschaftenpanel mit Beschreibung und Zusatzattributen der ausgewählten Aktivität. **Status** zeigt die Prozessstatus, die Statuswechsel je Aktivität und das Ergebnis der Modellprüfung. **RACI** (auf Deutsch **DEMI**) zeigt die Matrix aller Aktivitäten. **Dateien** wählt den Arbeitsordner (Edge, Chrome), zeigt die Modelle darin mit ihren Sperren und den eigenen Namen für die Sperrdatei. **Einstellungen** enthält Prüfregeln und Katalog. Der Schalter „IT-Services anzeigen“ blendet die Namen der Services an den Aktivitäten ein. Ein Prozess mit Swimlanes (ein Pool) heißt im Panel „Kollaboration“ und hat wie jeder Prozess ein Namensfeld und eine Beschreibung. Der Name des Modells steht in Werkzeugleiste und Fenstertitel; „Speichern“ nutzt ihn als Dateinamen.

Die Oberfläche gibt es auf Englisch und Deutsch. Beim ersten Aufruf gilt die Browsersprache, die Auswahl rechts oben wird im Browser gespeichert. Ein Sprachwechsel baut den Modellierer neu auf; Rückgängig beginnt danach von vorn.

## Bauen

`npm run build` erzeugt zwei Fassungen: `dist/web` (Web-App mit Service Worker und Manifest für einen Webserver) und `dist/single/bestbpmn.html` (alles in einer Datei, Skript, Stil, Schriften und Grafiken eingebettet). Die Plugins dafür liegen in `build/` und kommen ohne zusätzliche Abhängigkeiten aus. `npm run release` packt beides mit `release/web.config` und `release/LIESMICH.txt` in ein ZIP (`scripts/release.mjs`).

## Tests

```sh
npm test -w @bestbpmn/web
```

Die Tests laufen mit Vitest im echten Chromium (Playwright). Die Sperrlogik wird mit einem Arbeitsordner im Speicher geprüft, die File System Access API mit dem privaten Browser-Speicher (OPFS). Den Ordnerdialog und das Merken des Ordners über einen Neustart hinweg kann man nur von Hand in Edge oder Chrome prüfen.
