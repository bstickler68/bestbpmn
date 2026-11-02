# Verbesserungen nach v0.1.0

Sammlung der Rückmeldungen aus dem Praxistest (ab 2026-11-02). Umgesetzt wird erst, wenn diese Liste gemergt ist.

| Nr. | Art | Bereich | Verbesserung | Hinweis zur Umsetzung |
| --- | --- | --- | --- | --- |
| 1 | Neue Prüfregel | Prüfregeln | Jede Benutzeraufgabe (`bpmn:UserTask`) muss mindestens einen IT-Service zugeordnet haben. Aktiv nur im Profil „Vollständig“, im Profil „Dokumentieren“ abgeschaltet. | Neuer Code `user-task-without-service` in `ISSUE_CODES`, im Profil `document` abgeschaltet. Gilt unabhängig davon, ob ein Service-Katalog geladen ist. |
| 2 | Fehler | Berichte (Steckbrief) | Schnittstellen fehlen im Steckbrief: Datenobjekte, die mit einem Startereignis (Input) oder Endereignis (Output) verbunden sind, erscheinen nicht unter Input/Output. Im Editor lässt sich am Startereignis nur eine ausgehende, am Endereignis nur eine eingehende Verbindung modellieren; beide sollen als Schnittstelle zählen. | Die Auswertung in `report/profile.ts` berücksichtigt bereits beide Richtungen, der Test mit einem einfachen Modell ist grün. Ursache am Beispielmodell aus dem Test klären (z. B. Pool/Kollaboration, Teilprozess, Ereignisart) und mit einem Test absichern. |
