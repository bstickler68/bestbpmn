# bestbpmn

BPMN-Modellierer im Browser auf Basis von [bpmn-js](https://bpmn.io), erweitert um
Prozessstatus über dataStates, RACI/DEMI-Zuständigkeiten und Prüfregeln.

Modelle werden lokal angelegt und bearbeitet und als BPMN-XML gespeichert. Die
Zusatzangaben stehen in eigenen XML-Namensräumen: `raci` (`urn:bestadd:raci:1.0`)
und `bestadd` (`urn:bestadd:schema:1.0`). Jedes
Werkzeug, das BPMN 2.0 versteht, kann die Modelle weiterhin öffnen.

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

## Prüfen

```sh
npm run build
npm run typecheck
npm test        # Browser-Tests brauchen Chromium: npx playwright install chromium
```

## Etappen

0. Start: leeres Repository mit README und Lizenz
1. **Gerüst:** Modellierer mit Status, RACI/DEMI und Prüfregeln
2. Freitext für Status und Rollen, optionaler eigener Katalog, Regelprofile
3. Arbeiten mit Dateien: Öffnen/Speichern lokal, Drag & Drop, Export als SVG/PNG, leeres Diagramm
4. Auslieferung als installierbare Web-App (PWA) und Release-ZIP

## Lizenz

[Apache-2.0](LICENSE). bpmn-js steht unter der
[bpmn.io-Lizenz](https://bpmn.io/license/): Das bpmn.io-Wasserzeichen muss sichtbar bleiben.
