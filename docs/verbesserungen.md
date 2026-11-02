# Verbesserungen nach v0.1.0

Sammlung der Rückmeldungen aus dem Praxistest (ab 2026-11-02). Umgesetzt wird erst, wenn diese Liste gemergt ist.

| Nr. | Art | Bereich | Verbesserung | Hinweis zur Umsetzung |
| --- | --- | --- | --- | --- |
| 1 | Neue Prüfregel | Prüfregeln | Jede Benutzeraufgabe (`bpmn:UserTask`) muss mindestens einen IT-Service zugeordnet haben. Aktiv nur im Profil „Vollständig“, im Profil „Dokumentieren“ abgeschaltet. | Neuer Code `user-task-without-service` in `ISSUE_CODES`, im Profil `document` abgeschaltet. Gilt unabhängig davon, ob ein Service-Katalog geladen ist. |
| 2 | Wunsch | Berichte (Steckbrief) | Überschriften deutlicher: „Input“ wird zu „Schnittstellen (Input)“, „Output“ zu „Schnittstellen (Output)“. | Texte `report.inputs`/`report.outputs` in `packages/i18n`; englisch „Interfaces (input)“/„Interfaces (output)“. |
