# bestbpmn

BPMN-Modellierer im Browser auf Basis von [bpmn-js](https://bpmn.io), erweitert um
Prozessstatus über dataStates, RACI/DEMI-Zuständigkeiten und Prüfregeln.
Hervorgegangen aus der Modellierer-Erweiterung von PRAXIQ.

Modelle werden lokal angelegt und bearbeitet und als BPMN-XML gespeichert. Die
Namensräume `raci` und `praxiq` sind dieselben wie in PRAXIQ, damit Modelle aus
bestbpmn dort später ohne Umbau laufen.

## Starten

```sh
npm install
npm run dev -w @bestbpmn/web   # öffnet http://localhost:5173
```

Voraussetzung ist Node.js 22 (siehe `.nvmrc`).

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| `apps/web` | Die Web-App: Werkzeugleiste, Reiter für Status und RACI/DEMI |
| `packages/bpmn-js-extension` | bpmn-js-Module: Datenobjekt „Prozess“, Eigenschaftenpanel, Rollen-Suchfeld, Live-Prüfung |
| `packages/model` | Namensräume, Statusableitung aus dataStates, RACI/DEMI-Matrix, Prüfregeln (ohne Oberfläche) |
| `packages/i18n` | Texte auf Deutsch und Englisch |
| `templates` | Beispielprozesse und Beispielkatalog (Status, Rollen/Gruppen, IT-Services) |

ADR-Nummern in Code und Dokumentation verweisen auf die Architekturentscheidungen von PRAXIQ.

## Prüfen

```sh
npm run build
npm run typecheck
npm test        # Browser-Tests brauchen Chromium: npx playwright install chromium
```

## Etappen

0. Start: leeres Repository mit README und Lizenz
1. **Gerüst:** derselbe Modellierer wie in PRAXIQ, unter neuem Namen
2. Freitext für Status und Rollen, optionaler eigener Katalog, Regelprofile
3. Arbeiten mit Dateien: Öffnen/Speichern lokal, Drag & Drop, Export als SVG/PNG, leeres Diagramm
4. Auslieferung als installierbare Web-App (PWA) und Release-ZIP

## Lizenz

[Apache-2.0](LICENSE), Herkunft siehe [NOTICE](NOTICE). bpmn-js steht unter der
[bpmn.io-Lizenz](https://bpmn.io/license/): Das bpmn.io-Wasserzeichen muss sichtbar bleiben.
