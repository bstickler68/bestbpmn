# bestbpmn – Hinweise für Claude

- Sprache: Dokumentation, Commit-Nachrichten und Pull Requests auf Deutsch. Code-Bezeichner auf Englisch, Fachbegriffe aus BPMN unverändert (dataState, potentialOwner).
- XML-Namensräume (`src/moddle/*.json`) nur mit Bedacht ändern: Gespeicherte Modelle hängen von Präfix und URI ab.
- Modell zuerst: Status und Zuständigkeit kommen nur aus dem BPMN-Modell. Der Status ist eine Zusatzinformation und steuert nichts.
- Standalone: keine Server, kein Backend, keine internen Namen oder Daten im Repository. Eine spätere Veröffentlichung als Open Source soll möglich bleiben.
- Abhängigkeiten nur unter MIT, ISC, BSD oder Apache 2.0; bpmn-js unter der bpmn.io-Lizenz, das Wasserzeichen bleibt sichtbar. Vor dem Hinzufügen die Lizenz prüfen.
- Alles ist TypeScript.
- Änderungen nur per Pull Request auf `main`; jede Etappe bleibt für sich lauffähig.
