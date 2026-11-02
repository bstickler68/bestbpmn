# Verbesserungen nach v0.1.0

Sammlung der Rückmeldungen aus dem Praxistest (ab 2026-11-02). Umgesetzt wird erst, wenn diese Liste gemergt ist.

| Nr. | Art | Bereich | Verbesserung | Hinweis zur Umsetzung |
| --- | --- | --- | --- | --- |
| 1 | Neue Prüfregel | Prüfregeln | Jede Benutzeraufgabe (`bpmn:UserTask`) muss mindestens einen IT-Service zugeordnet haben. Aktiv nur im Profil „Vollständig“, im Profil „Dokumentieren“ abgeschaltet. | Neuer Code `user-task-without-service` in `ISSUE_CODES`, im Profil `document` abgeschaltet. Gilt unabhängig davon, ob ein Service-Katalog geladen ist. |
| 2 | Wunsch | Berichte (Steckbrief) | Überschriften deutlicher: „Input“ wird zu „Schnittstellen (Input)“, „Output“ zu „Schnittstellen (Output)“. | Texte `report.inputs`/`report.outputs` in `packages/i18n`; englisch „Interfaces (input)“/„Interfaces (output)“. |
| 3 | Wunsch | Berichte (Gesamtdokument) | Überschrift „Grafik“ wird zu „Prozessablaufdiagramm“. | Text `report.graphic` (DE); englisch „Process flow diagram“. |
| 4 | Wunsch | Berichte (Gesamtdokument) | Überschrift „Modellierungselemente“ wird zu „Beschreibung der Prozessschritte“. | Text `report.elements` (DE); englisch „Description of the process steps“. |
| 5 | Wunsch | Berichte (Gesamtdokument) | Überschrift „Modellinformationen“ wird zu „Prozessinformationen“. | Text `report.modelInfo` (DE); englisch „Process information“. Gilt auch, wo der Text sonst verwendet wird. |
| 6 | Wunsch | Berichte (Gesamtdokument) | Das Kapitel „Status“ (Statustabelle und Statuswechsel) erscheint nur, wenn im Modell mindestens ein Status modelliert ist. | In `apps/web/src/report/report.ts` das Kapitel weglassen, wenn kein Status vorhanden ist; Kapitelnummern rücken nach. |
| 7 | Wunsch | Oberfläche | Ungespeicherte Änderungen deutlich anzeigen: Der Speichern-Button färbt sich dezent rot, solange es Änderungen gibt, die noch nicht gespeichert sind. | Heute gibt es nur einen kleinen Punkt „●“ hinter dem Dateinamen. Am vorhandenen Zustand `dirty` in `main.ts` eine CSS-Klasse am Button `#save` setzen; zusätzlich Tooltip „Nicht gespeicherte Änderungen“. |
