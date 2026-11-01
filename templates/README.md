# templates

- `processes/` Beispiel- und Testprozesse (BPMN). Jede Vorlage dient zugleich als Testfall.
  - `incident.bpmn`: drei Startereignisse (E-Mail, Selbsterfassung, Telefon), jeder Weg setzt den Anfangsstatus `new` über seine erste Aktivität mit Status; vor „Incident telefonisch erfassen“ liegt die manuelle Tätigkeit „Anruf annehmen“ ohne Status. Drei Swimlanes mit Rolle/Gruppe aus der Tabelle, „Lösung prüfen“ als Multi-Instanz-Aufgabe mit zwei D.
  - `dokumentenfreigabe.bpmn`: In Prüfung → Geprüft → Freigegeben, mit Schleife über „Dokument überarbeiten“ und RACI-Beispielen. Den Anfangsstatus setzt „Dokument erstellen“, die erste Aktivität mit Status; „Dokument“ ist ein weiteres Datenobjekt ohne Status.
- `catalog/` Beispielkatalog: `services.json` (Service-Katalog), `states.json` (Statustabelle mit ID, englischem Namen, Übersetzungen, Symbol, Farbe, Kategorie), `roles.json` (Rollen- und Gruppentabelle). Ab Etappe 2 ist der Katalog freiwillig und jeder kann seinen eigenen anlegen.
