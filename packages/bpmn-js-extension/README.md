# @bestbpmn/bpmn-js-extension

bpmn-js-Module für Prozessstatus, RACI/DEMI und Live-Prüfung. Das Paket wird als TypeScript-Quelle eingebunden und vom Bundler der App übersetzt.

## Was die Erweiterung tut

| Baustein | Verhalten |
| --- | --- |
| `ProcessObjectBehavior` | Nur das Datenobjekt „Prozess“ trägt den Status. Eine Referenz mit der Beschriftung `Prozess [approved]` hängt immer am einen Datenobjekt „Prozess“ und bekommt einen echten `bpmn:dataState` mit der Status-ID; ein eingetippter Name aus der Statustabelle wird durch die ID ersetzt, `prozess` durch `Prozess`. Andere Beschriftungen meinen andere Datenobjekte, ohne Status. Wird eine von mehreren Referenzen gelöscht, bleibt das Datenobjekt erhalten. |
| `StatusPropertiesProvider` | Gruppe „Status“ an Referenzen auf „Prozess“: Auswahl aus der Statustabelle, schreibt `Prozess [ID]`. An anderen Datenobjekten nur ein Hinweis. Zeigt außerdem die ID des Datenobjekts, die für alle Referenzen gleich ist (die ID unter „Allgemein“ gehört zur Referenz). |
| `UPDATE_ATTRIBUTE` | Befehl, der ein Zusatzattribut setzt. Legt `extensionElements` und `bestadd:attributes` bei Bedarf an, räumt leere Container wieder auf und ist in einem Schritt rückgängig zu machen. |
| `AttributesPropertiesProvider` | Je Attributdefinition eine Gruppe im Eigenschaftenpanel: Textfeld, Markdown-Feld, Linkliste oder Auswahl aus dem Service-Katalog. |
| `ServiceOverlays` | Kleines Symbol mit der Anzahl der IT-Services an der Aktivität, auf Wunsch mit Namen. Wird nicht gespeichert. |
| `RaciPropertiesProvider` | Bereich „Verantwortlichkeiten (DEMI)“ mit Suchfeldern über die Rollen- und Gruppentabelle: D und E einfach, M und I mehrfach. Liegt die Aufgabe in einer Swimlane mit Zuordnung, zeigt D die Lane und ist gesperrt; in der Matrix steht dieses D schräg. Multi-Instanz-Aufgaben haben D als Mehrfachauswahl. Werte außerhalb der Tabelle (z. B. `initiator()`) bleiben sichtbar. |
| `LanePropertiesProvider` | Gruppe „Rolle/Gruppe“ an Lanes und Pools: Suchfeld über die Tabelle, gespeichert als `raci:assignee`. Das Namensfeld entfällt dann. Ein Pool mit Lanes zeigt nur einen Hinweis, weil D dann aus den Lanes kommt. |
| `RolePicker` | Suchfeld wie in Jira: Tippen zeigt Treffer, Gewähltes steht als Kästchen mit × im Feld; Tastatur: Pfeile, Enter, Esc, Rücktaste entfernt den letzten Eintrag. |
| `LaneBehavior` | Schreibt nach jedem Anlegen, Verschieben oder Ändern der Lane deren Zuordnung als D in die Aufgaben (Multi-Instanz-Aufgaben mit eigenem D ausgenommen) und hält den Namen der Lane auf dem Tabelleneintrag. |
| `bestbpmn.raci.update` | Befehl, der eine Rolle setzt: R im `potentialOwner`, A/C/I im `raci`-Namensraum. Rückgängig in einem Schritt, leere Einträge werden entfernt. |
| `TranslationsPropertiesProvider` | Gruppe „Übersetzungen“: Name und Beschreibung in den übrigen Sprachen, am Prozess die Hauptsprache des Modells. Status werden in der Statustabelle übersetzt. |
| `bestbpmn.translation.update` | Befehl für Übersetzungen, in einem Schritt rückgängig zu machen. |
| `StatusCheck` | Prüft nach jeder Änderung mit `@bestbpmn/model` und der Statustabelle, markiert betroffene Elemente rot oder gelb und meldet das Ergebnis über das Event `bestbpmn.status.changed`. |

Alles lässt sich mit Rückgängig zurücknehmen.

## Einbinden

```ts
import Modeler from 'bpmn-js/lib/Modeler';
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel';
import { bestbpmnModule, bestbpmnModdleExtensions, bestbpmnPropertiesProviderModule, translateModule } from '@bestbpmn/bpmn-js-extension';

const modeler = new Modeler({
  container: '#canvas',
  additionalModules: [
    BpmnPropertiesPanelModule,
    BpmnPropertiesProviderModule,
    bestbpmnModule,
    bestbpmnPropertiesProviderModule,
    translateModule('de'), // bpmn-js und Panel auf Deutsch
  ],
  moddleExtensions: bestbpmnModdleExtensions,
  propertiesPanel: { parent: '#properties' },
  bestbpmn: {
    language: 'de', // Sprache der Oberfläche, Standard ist Englisch
    attributes: [/* Attributdefinitionen, ohne Angabe die Standardattribute */],
    services: [/* Service-Katalog */],
    states: [/* Statustabelle, z. B. templates/catalog/states.json */],
    roles: [/* Rollen- und Gruppentabelle, z. B. templates/catalog/roles.json */],
  },
});
```

Hinweis für eigene Listener am `eventBus`: Gibt ein Listener einen Wert zurück, reicht diagram-js das Ereignis nicht mehr an spätere Listener weiter. Listener deshalb immer mit Block-Rumpf schreiben.

## Noch nicht enthalten

- Namen im Diagramm in der Sprache der Oberfläche statt in der Hauptsprache des Modells
- Freitext ohne Tabellen und eigener Katalog (Etappe 2); bis dahin die Beispieldateien unter `templates/catalog/`
- Auswahl für dynamische Zuordnungen (`initiator()`, `field(…)`, Vier-Augen-Prinzip); vorhandene Werte bleiben erhalten
- Sonderfall: Eine Referenz wird in einen Unterprozess verschoben. Das gemeinsame DataObject wandert dann mit.
