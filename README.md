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

## Auslieferung

Es gibt zwei Fassungen, beide ohne Installation und ohne Zugriffe ins Netz:

- **`bestbpmn.html`**: die ganze App in einer Datei. Doppelklick öffnet sie im Browser,
  ohne Server, unter Windows wie unter Linux. Den Arbeitsordner gibt es in Edge und Chrome
  (unter Linux Google Chrome oder Chromium; das Snap-Paket erreicht Ordner außerhalb des
  Home-Verzeichnisses nur mit Zusatzfreigabe). In Firefox laufen Öffnen und Speichern über
  Hoch- und Herunterladen.
- **Web-App für einen internen Webserver (PWA)**: lässt sich in Edge und Chrome „als App
  installieren“, startet dann aus dem Startmenü, läuft auch ohne Verbindung zum Server und
  öffnet `.bpmn`-Dateien per Doppelklick. Eine neue Version kündigt sich mit „Neu laden“ an.
  Für IIS liegt eine `web.config` bei.

Dateinamen sind unter Windows immer gültig (keine verbotenen Zeichen, kein Punkt am Ende,
keine reservierten Namen wie `CON`).

```sh
npm run build                          # dist/web (PWA) und dist/single/bestbpmn.html
npm run release -w @bestbpmn/web       # zusätzlich dist/release/bestbpmn-<Version>.zip
```

Das ZIP enthält `bestbpmn.html`, den Ordner `webserver` mit `web.config` und die
Kurzanleitung `LIESMICH.txt`. Jeder CI-Lauf legt `bestbpmn.html` als Artefakt ab (GitHub
packt Artefakte immer als ZIP). Zum Verteilen auf GitHub unter „Releases“ ein neues Release mit
einem Tag wie `v0.2.0` veröffentlichen: Der Workflow hängt dann `bestbpmn.html` und das ZIP
direkt an. Die Version kommt aus `apps/web/package.json` und sollte vorher dazu passen.

## Arbeitsordner und Sperren

In Edge und Chrome lässt sich unter „Dateien“ ein Arbeitsordner wählen, auch auf einem
Netzlaufwerk. „Speichern“ (oder Strg+S) schreibt dann direkt in die Datei; neue Modelle
bekommen beim ersten Speichern einen Dateinamen. Der Browser merkt sich den Ordner, fragt
aber nach jedem Neustart einmal nach, ob bestbpmn ihn verwenden darf.

- **Sperrdatei.** Wer eine Datei öffnet, legt daneben `Name.bpmn.lock` an, mit Namen und
  Uhrzeit. Andere sehen die Datei dann als „gesperrt“, können sie ansehen, aber nicht im
  Ordner überschreiben, nur unter anderem Namen oder als Download speichern.
- **Lebenszeichen.** Ein offenes Fenster erneuert seine Sperre jede Minute. Kommt zehn Minuten
  lang keines (z. B. nach einem Absturz), gilt die Sperre als verwaist und lässt sich per Klick
  aufheben. Beim Schließen oder beim Wechsel der Datei wird die Sperre freigegeben.
- **Fremde Änderung.** Hat jemand die Datei seit dem Öffnen trotzdem geändert, fragt
  „Speichern“ vor dem Überschreiben nach.
- **Grenzen.** Ein Browser kann eine Datei nicht wirklich exklusiv sperren. Öffnen zwei
  Personen dieselbe Datei im selben Augenblick, gewinnt die zuletzt geschriebene Sperre; die
  App liest ihre Sperre deshalb kurz nach dem Schreiben noch einmal nach.

Firefox kann keinen Ordner freigeben. Dort laufen Öffnen und Speichern über Hochladen und
Herunterladen; ein Windows-Programm, das auch ohne Edge oder Chrome mit dem Arbeitsordner
arbeitet, ist als Etappe 5 geplant. In allen Browsern lässt sich eine `.bpmn`-Datei auf das
Fenster ziehen, und „Exportieren“ bietet BPMN, SVG und PNG an. Modelle mit Erweiterungen
anderer Werkzeuge (z. B. `camunda:`, `zeebe:`) behalten diese beim Speichern.

## Bedienung

- **Ungespeicherte Änderungen** färben den Button „Speichern“ dezent rot. Macht man alles
  wieder rückgängig, ist er wieder normal.
- **Rückgängig und Wiederherstellen** über die Pfeile neben „Speichern“ oder mit Strg+Z und
  Strg+Y (auch Strg+Umschalt+Z). In Eingabefeldern gilt das Rückgängig des Feldes.
- **Modellname.** Hat eine geöffnete Datei keinen Modellnamen, gilt der Dateiname ohne Endung.
- **IDs** vergibt bestbpmn selbst; das Eigenschaftenpanel zeigt sie nur an.
- **DEMI-Matrix.** Sie bleibt immer eine Tabelle mit einer Spalte je Rolle oder Gruppe, auch bei
  mehreren Pools. Ein Pool ohne Swimlanes wirkt wie eine Swimlane: Seine Rolle oder Gruppe,
  sonst sein Name, ist D für alle Aktivitäten darin. Dieses D ist kursiv und lässt sich an der
  Aufgabe nicht entfernen; Multi-Instanz-Aufgaben dürfen weitere D haben. Die Aktivitäten stehen
  in derselben Reihenfolge wie in der Elementtabelle des Gesamtdokuments.
- **Hintergrundfarbe.** Das Pinselsymbol am Element (neben dem Schraubenschlüssel) bietet fünf
  Farben und „Keine Farbe“. Gespeichert wird nach „BPMN in Color“; auch bpmn.io und der Camunda
  Modeler zeigen die Farben. Mehrere markierte Elemente lassen sich gemeinsam einfärben.
- **Blättern.** Die kleinen Pfeile ‹ › oben rechts im Eigenschaftenbereich wählen das vorherige
  bzw. nächste Element derselben Art aus (Aktivitäten, Ereignisse, Gateways, Daten, Pools und
  Lanes, Textanmerkungen), in Modellierungsreihenfolge: bei waagrechten Prozessen von links nach
  rechts, bei senkrechten von oben nach unten; Pools und Lanes quer dazu.
- **Bedingungen an Wegen.** Wählt man einen Sequenzfluss nach einem exklusiven oder
  inklusiven Gateway oder direkt nach einer Aufgabe, zeigt die Gruppe „Bedingung“ die Ergebnisse
  der Aufgabe davor (die Status ihrer Outputs auf „Prozess“). Die Auswahl schreibt
  `${result == 'schlüssel'}` als Standard-BPMN-Bedingung; ein namenloser Weg bekommt den Namen
  des Ergebnisses. Für Feldwerte lässt sich ein eigener Ausdruck eintragen, z. B.
  `${betrag > 10000}`. Ältere Modelle mit einem anderen Namen der Ergebnisvariable werden ebenso erkannt.
  Am Gateway zeigt 👤, dass eine Person über ihr Ergebnis entscheidet, ⚙ eine Entscheidung
  nach Feldwerten.
- **Regeln an Aktivitäten.** Die Gruppe „Regeln“ kennzeichnet, ob es beim Übergang eine
  Bedingung, Prüfung, Maske, Start- oder Folgeaktion gibt, und beschreibt sie in Worten.
  Aufgaben, die niemand abschließt (z. B. Service- oder Skriptaufgaben), haben nur Start- und
  Folgeaktionen. Im Diagramm steht dann „§ n“ an der Aktivität, im Gesamtdokument ein Absatz
  „Regeln (…)“ beim Schritt.
- **Eigenschaften ausblenden.** Die schmale Leiste links vom Eigenschaftenbereich klappt ihn
  auf und zu, damit das Diagramm auf kleinen Bildschirmen mehr Platz hat.

## Berichte

Unter „Bericht“ gibt es das Modell in zwei Fassungen, jeweils als HTML-Datei (eine Datei,
Grafik und Stil eingebettet, zum Ablegen und Verschicken) oder über den Druckdialog des
Browsers, dort auch „Als PDF speichern“:

- **Steckbrief** (ohne Grafik): Name, Zweck und Beschreibung, Auslöser (Startereignisse),
  Endzustand (Endereignisse), erste und letzte Aktivität, Schnittstellen (Input: Datenobjekte
  an Startereignissen; Output: an Endereignissen) und Ressourcen: Personell (Rollen und Gruppen
  aus der DEMI-Matrix), Dokumente (Datenobjekte, die in Aktivitäten eingehen, und Links),
  Systeme (IT-Services).
- **Gesamtdokument**: Prozessinformationen, Prozessablaufdiagramm, Beschreibung der
  Prozessschritte als Tabelle, Status und Statuswechsel (nur, wenn ein Status modelliert ist)
  und DEMI-Matrix. Die Elementtabelle hat die Spalten
  Nr, Objekt, Typ, Name, System, Beschreibung und weiterführende
  Dokumentation. Nummeriert wird in Ablaufreihenfolge; geht es nicht mit der nächsten Nummer
  weiter, steht es unter der Beschreibung, z. B. „Ja: weiter bei 6“ oder „zurück zu 3“.
  Am Schluss steht immer das Endereignis des Hauptwegs; Seitenzweige wie Abbrüche, Rücksprünge
  und angeheftete Ereignisse kommen davor. Regel-Kennzeichen stehen als Absatz unter der
  Beschreibung.

Alles kommt aus dem Modell; das Datenobjekt „Prozess“ trägt nur den Status und zählt nicht
als Input, Output oder Dokument. Gedruckt wird auf A4; Grafik und Elementtabelle stehen im
Querformat.

## Status, Rollen und Prüfregeln

- **Freitext ist der Normalfall.** Status, Rollen und Gruppen werden im Eigenschaftenpanel
  einfach eingetippt. Was im Modell schon vorkommt, wird beim nächsten Mal vorgeschlagen.
- **Eigener Katalog, freiwillig.** Unter „Einstellungen“ lassen sich Status, Rollen/Gruppen
  und IT-Services als Tabellen pflegen, als `bestbpmn-katalog.json` exportieren und
  importieren. Der Katalog liegt nur im Browser des jeweiligen PCs.
- **Prüfregeln als Profil.** „Dokumentieren“ (Standard) verlangt kein D an jeder Aufgabe,
  keine Rolle an jeder Lane, keinen IT-Service an Benutzer- und Serviceaufgaben und keine
  Bedingung an jedem Weg nach einer Verzweigung, passend für Diagramme aus bpmn.io. „Vollständig“ prüft alles.
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
3. Arbeiten mit Dateien: Arbeitsordner mit Sperrdateien, Drag & Drop, Export als SVG/PNG, leeres Diagramm
   - 3b. **Druckbare Berichte:** Steckbrief und Gesamtdokument als HTML und PDF
4. Auslieferung als einzelne HTML-Datei zum Doppelklicken, optional als installierbare Web-App (PWA)
5. Windows-Programm (Tauri) mit Arbeitsordner auch für Firefox-Nutzer

## Lizenz

[Apache-2.0](LICENSE). bpmn-js steht unter der
[bpmn.io-Lizenz](https://bpmn.io/license/): Das bpmn.io-Wasserzeichen muss sichtbar bleiben.
