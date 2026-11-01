# @bestbpmn/web

Die Web-App von bestbpmn: bpmn-js mit der Erweiterung aus [`@bestbpmn/bpmn-js-extension`](../../packages/bpmn-js-extension/README.md). Das bpmn.io-Wasserzeichen bleibt sichtbar und darf nicht verdeckt werden.

## Starten

```sh
npm install
npm run dev -w @bestbpmn/web   # öffnet http://localhost:5173
```

Die Seite lädt die Vorlage „Dokumentenfreigabe“; „Vorlage Incident“ zeigt Swimlanes, mehrere Startereignisse und eine Multi-Instanz-Aufgabe. Rechts gibt es drei Reiter: **Eigenschaften** zeigt das Eigenschaftenpanel mit Beschreibung und Zusatzattributen der ausgewählten Aktivität. **Status** zeigt die Prozessstatus, die Statuswechsel je Aktivität und das Ergebnis der Modellprüfung. **RACI** (auf Deutsch **DEMI**) zeigt die Matrix aller Aktivitäten. Der Schalter „IT-Services anzeigen“ blendet die Namen der Services an den Aktivitäten ein. Ein Prozess mit Swimlanes (ein Pool) heißt im Panel „Kollaboration“ und hat wie jeder Prozess ein Namensfeld und eine Beschreibung. Der Name des Modells steht in Werkzeugleiste und Fenstertitel; „Speichern“ nutzt ihn als Dateinamen.

Die Oberfläche gibt es auf Englisch und Deutsch. Beim ersten Aufruf gilt die Browsersprache, die Auswahl rechts oben wird im Browser gespeichert. Ein Sprachwechsel baut den Modellierer neu auf; Rückgängig beginnt danach von vorn.

## Tests

```sh
npm test -w @bestbpmn/web
```

Die Tests laufen mit Vitest im echten Chromium (Playwright).
