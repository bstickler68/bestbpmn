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

Voraussetzung ist Node.js 22 (siehe `.nvmrc`). Entwickelt wird unter Ubuntu.

## Nutzung unter Windows

Kollegen arbeiten unter Windows mit Edge oder Chrome; eine Installation von Node.js
oder anderen Programmen ist dafür nicht nötig. Die App läuft im Browser, Modelle
werden lokal als `.bpmn`-Datei gespeichert. Der Dateiname kommt aus dem Modellnamen
und ist unter Windows immer gültig (keine verbotenen Zeichen, kein Punkt am Ende,
keine reservierten Namen wie `CON`). Ab Etappe 4 gibt es die App als einzelne Datei
`bestbpmn.html`, die man ohne Server per Doppelklick öffnet. Wer einen
Startmenü-Eintrag möchte, kann sie zusätzlich von einem internen Webserver als PWA
installieren.

## Status, Rollen und Prüfregeln

- **Freitext ist der Normalfall.** Status, Rollen und Gruppen werden im Eigenschaftenpanel
  einfach eingetippt. Was im Modell schon vorkommt, wird beim nächsten Mal vorgeschlagen.
- **Eigener Katalog, freiwillig.** Unter „Einstellungen“ lassen sich Status, Rollen/Gruppen
  und IT-Services als Tabellen pflegen, als `bestbpmn-katalog.json` exportieren und
  importieren. Der Katalog liegt nur im Browser des jeweiligen PCs.
- **Prüfregeln als Profil.** „Dokumentieren“ (Standard) verlangt kein D an jeder Aufgabe und
  keine Rolle an jeder Lane, passend für Diagramme aus bpmn.io. „Vollständig“ prüft alles.
  Jede Regel lässt sich auch einzeln ab- oder zuschalten.

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
4. Auslieferung als einzelne HTML-Datei zum Doppelklicken, optional als installierbare Web-App (PWA)

## Lizenz

[Apache-2.0](LICENSE). bpmn-js steht unter der
[bpmn.io-Lizenz](https://bpmn.io/license/): Das bpmn.io-Wasserzeichen muss sichtbar bleiben.
