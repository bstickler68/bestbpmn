# @bestbpmn/model

Kern des Modellierers ohne Oberfläche: Namensräume, Statusmodell, RACI/DEMI und Prüfregeln.

## Was es heute kann

- **raci-Namensraum** als moddle-Beschreibung (`src/moddle/raci.json`): `raci:accountable`, `raci:consulted`, `raci:informed` mit `raci:user`, `raci:group` und `raci:dynamic` unter `extensionElements`. R bleibt BPMN-`potentialOwner`.
- **Statusmodell aus dataStates** (`deriveStatusModels(xml, { states })`): Den Ablauf bestimmt der Prozess. Der Status ist eine Zusatzinformation am Vorgang und steht nur am Datenobjekt „Prozess“ (englisch „process“, `isProcessObjectName`). Status werden über ihre ID aus der Statustabelle angesprochen (`StatusDefinition`, `findStatus`, `catalogLabel`). Je Vorgang liefert die Funktion (eine Kollaboration mit allen ihren Pools oder ein Prozess ohne Pool; Nachrichtenflüsse zählen für den Anfangsstatus mit)
  - die IDs aller Status in der Reihenfolge ihres Auftretens, dazu ihre Namen in der Hauptsprache (`statusNames`) und ihre Übersetzungen (`statusTranslations`), beides aus der Statustabelle, falls übergeben,
  - die möglichen Anfangsstatus: je Startereignis die Status der ersten Aktivität mit Output auf „Prozess“,
  - je Schritt die Status, die er beim Abschluss setzen kann (`outputs`), und die nur dokumentierten Status aus Input-Verknüpfungen (`documentedInputs`).
- **Katalog-Datei** (`parseCatalog`, `serializeCatalog`): eine JSON-Datei mit `states`, `roles` und `services`, jede Tabelle freiwillig. Ungültige Einträge werden übersprungen und gemeldet; leere Tabellen gelten als nicht vorhanden, damit ohne Statustabelle jeder Status erlaubt ist.
- **Regelprofile** (`RULE_PROFILES`, `disabledRulesOf`, `matchRuleProfile`): `document` verlangt kein D an jeder Benutzeraufgabe und keine Rolle an jeder Lane, `complete` prüft alles. `deriveStatusModels(xml, catalog, { disabledRules })` lässt abgeschaltete Regeln weg.
- **Modellierregeln** als Meldungen am Ergebnis:

| Code | Stufe | Bedeutung |
| --- | --- | --- |
| `multiple-process-objects` | Fehler | mehr als ein Datenobjekt „Prozess“ |
| `reference-without-state` | Fehler | eine Referenz auf „Prozess“ hat keinen Status |
| `start-event-state` | Fehler | ein Startereignis setzt einen Status |
| `unknown-state` | Warnung | die Status-ID fehlt in der Statustabelle |
| `label-state-mismatch` | Warnung | Beschriftung `Objekt [Status]` und dataState passen nicht zusammen |
| `input-state-never-set` | Warnung | eine Input-Verknüpfung dokumentiert einen Status, den kein Schritt setzt |
| `state-only-in-label` | Warnung | ein Status steht nur in der Beschriftung, nicht als dataState |
| `state-key-conflict` | Warnung | ein Statusschlüssel steht für verschiedene Namen |
| `raci-missing-responsible` | Fehler | eine Benutzeraufgabe hat kein D (weder an der Aufgabe noch über die Swimlane) |
| `raci-multiple-responsible` | Fehler | eine Benutzeraufgabe hat mehr als ein D (außer Multi-Instanz) |
| `raci-multiple-accountable` | Fehler | eine Aktivität hat mehr als ein E |
| `lane-without-role` | Fehler | eine Swimlane hat keine Rolle oder Gruppe (`raci:assignee`) |
| `task-without-service` | Fehler | eine Benutzer- oder Serviceaufgabe hat keinen IT-Service |
| `raci-unknown-assignee` | Warnung | eine Gruppe oder Rolle fehlt in der Rollen- und Gruppentabelle |

Meldungen enthalten nur `code` und `params`. Die Texte in Englisch und Deutsch liegen in `@bestbpmn/i18n` unter `issue.<code>`.

Maßgeblich ist der `bpmn:dataState`. Fehlt er, gilt der Status aus der Beschriftung, damit Modelle aus anderen Werkzeugen lesbar bleiben.

Hat ein Schritt mehrere Outputs, sind das alternative Ergebnisse: Die bearbeitende Person wählt beim Abschluss einen davon, ein Gateway danach verzweigt nach diesem Status.

- **Mehrsprachigkeit**: `modelLanguage` liest die Hauptsprache des Modells, `readTranslations` die Übersetzungen eines Elements, `readStateTranslations` die Statusübersetzungen älterer Modelle am DataObject (neue Modelle übersetzen Status in der Statustabelle). `stateKey` bildet aus einem Namen den technischen Schlüssel, `localize` und `pickText` wählen den Text für eine Sprache mit Rückfall.
- **RACI / DEMI**: `readRaci` liest R aus `potentialOwner` und A/C/I aus dem `raci`-Namensraum. Einträge der Rollen- und Gruppentabelle (`RoleDefinition`, `findRole`) stehen als `group(id)` bzw. `role(id)`; Lanes und Pools tragen ihre Zuordnung in `raci:assignee`, und die Lane geht der Aufgabe vor (`resolveRaci`, `laneMap`, `findParticipant`). Multi-Instanz-Aufgaben (`isMultiInstance`) dürfen mehrere D haben. `parseAssignees` und `formatAssignees` übersetzen zwischen Objekten und der Schreibweise `group(Autoren), field(autor), notPerformerOf(Erstellen)`. `deriveRaciMatrices` liefert je Prozess die Matrix mit Rollen je Zelle, D notfalls aus der Swimlane (`resolveRaci`, `laneMap`); die Buchstaben (R/A/C/I bzw. D/E/M/I) setzt die Anzeige.
- **Zusatzattribute** im Namensraum `bestbpmn` (`src/moddle/bestadd.json`): `bestadd:attributes` mit `bestadd:attribute key="…"`, darin ein Textwert oder Einträge `bestadd:link` und `bestadd:serviceRef`. `readAttributes(element)` liest sie, `readDescription(element)` liest die Beschreibung aus `documentation`. `DEFAULT_ATTRIBUTE_DEFINITIONS` enthält die Standardattribute „Weiterführende Dokumentation“ und „IT-Services“.

## Beispiel

```ts
import { deriveStatusModels } from '@bestbpmn/model';

const [model] = await deriveStatusModels(xml, { states }); // states aus templates/catalog/states.json
// model.statuses        → ['in_review', 'reviewed', 'approved']
// model.statusNames     → { in_review: 'In Prüfung', … }
// model.initialStatuses → ['in_review']   (gesetzt von „Dokument erstellen“)
// model.changes         → [{ elementId: 'Erstellen', outputs: ['in_review'], documentedInputs: [] }, …]
```

## Entwicklung

```sh
npm test            # Tests
npm run typecheck   # Typprüfung
npm run build       # nach dist/
```

Die Tests nutzen die Vorlage `templates/processes/dokumentenfreigabe.bpmn`.
