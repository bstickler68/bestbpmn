# templates

- `processes/` Beispiel- und Testprozesse (BPMN). Jede Vorlage dient zugleich als Testfall.
  - `incident.bpmn`: drei Startereignisse (Selbsterfassung ohne Auslöser, E-Mail und Telefon als Nachrichtenstart), jeder Weg setzt den Anfangsstatus `new` über seine erste Aktivität mit Status; vor „Incident telefonisch erfassen“ liegt die manuelle Tätigkeit „Anruf annehmen“ ohne Status. Drei Swimlanes mit Rolle/Gruppe aus der Tabelle, „Lösung prüfen“ als Multi-Instanz-Aufgabe mit zwei D.
  - `dokumentenfreigabe.bpmn`: In Prüfung → Geprüft → Freigegeben, mit Schleife über „Dokument überarbeiten“ und RACI-Beispielen. Den Anfangsstatus setzt „Dokument erstellen“, die erste Aktivität mit Status; „Dokument“ ist ein weiteres Datenobjekt ohne Status.
  - `periodische-aufgabe.bpmn`: Schleife mit Zeitgeber; die Ergebnisse tragen einen eigenen Text in der Auswahl (`bestadd:resultLabel`) mit englischer Übersetzung, das D der Aufgabe ist `firstOf(field(assigned_person), initiator())`, der Zeitgeber hat einen Kalender (`bestadd:businessCalendar`).
- `catalog/` Beispielkatalog: `services.json` (Service-Katalog), `states.json` (Statustabelle mit ID, englischem Namen, Übersetzungen, Symbol, Farbe, Kategorie), `roles.json` (Rollen- und Gruppentabelle). Der Katalog ist freiwillig: In der App lädt „Einstellungen → Beispielkatalog laden“ diese Dateien als eigenen Katalog.
