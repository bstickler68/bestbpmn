# bestbpmn Modellierungsanleitung für vollständige Berichte

Stand: 2026-11-26, bestbpmn 0.6.0

Diese Datei ist die gepflegte Fassung der Anleitung. Änderungen am Modeler, die Berichte oder Pflegeorte betreffen, tragen hier mit ein.

## Zweck

Beide Berichte entstehen vollständig aus dem BPMN-Modell: Was im Modell fehlt, steht im Bericht als „–“ oder gar nicht da. Diese Anleitung sagt, welche Elemente und Felder du pflegen musst, damit jeder Abschnitt gefüllt ist. Sie beruht auf dem Code von bestbpmn 0.6.0 (Bericht-Menü, Steckbrief und Gesamtdokument).

- **Steckbrief**: eine Seite ohne Grafik. Zweck, Auslöser, Endzustand, erste und letzte Aktivität, vor- und nachgelagerte Prozesse, Schnittstellen (Input/Output) und Ressourcen (Personell, Dokumente, Systeme).
- **Gesamtdokument**: Prozessinformationen (auch mit vor- und nachgelagerten Prozessen und Schnittstellen), Prozessablaufdiagramm, Beschreibung der Prozessschritte (Elementtabelle), Status (nur wenn modelliert) und Verantwortlichkeiten (DEMI).

Im Beispiel „Incident bearbeiten“ bleiben Input, Output, Dokumente und Systeme leer, die Spalten „System“ und „Unterlagen“ sind leer, und unter Personell stehen technische Kürzel wie `service_desk`. Genau diese Lücken schließt die Anleitung.

## Übersicht: Woher jeder Abschnitt seine Daten hat

Die Tabelle zeigt für jeden Berichtsabschnitt, aus welchem Modellteil er gefüllt wird und wo du das pflegst. „Eigenschaften“ meint den gleichnamigen Reiter rechts neben dem Diagramm.

| Bericht | Abschnitt | Kommt aus | Pflegen unter |
| --- | --- | --- | --- |
| beide | Titel (Name des Modells) | Name der Kollaboration, sonst des einzigen Pools oder Prozesses | Leere Fläche anklicken → Eigenschaften → Allgemein → Name |
| Steckbrief | Zweck und Beschreibung | Beschreibung des Prozesses | Leere Fläche → Beschreibung des Prozesses (Markdown) |
| Gesamtdokument | Prozessinformationen | Name und Beschreibung des Prozesses, Dateiname, dazu Prozessketten wie im Steckbrief | wie oben; Modell als Datei speichern; Symbole siehe Abschnitt 4 |
| Steckbrief | Auslöser | alle Startereignisse mit Name, Ereignisart und Beschreibung | Startereignis → Name, Beschreibung, Ereignisart (Schraubenschlüssel) |
| Steckbrief | Endzustand | alle Endereignisse mit Name, Art und Beschreibung | Endereignis → Name, Beschreibung |
| Steckbrief | Erste / Letzte Aktivität | die Aktivität direkt nach jedem Start bzw. vor jedem Ende, über Gateways und Zwischenereignisse hinweg | Name und Beschreibung dieser Aufgaben |
| beide | Vorgelagerte / Nachgelagerte Prozesse | Prozessschnittstellen vor einem **Startereignis** bzw. hinter einem **Endereignis** | Kontextmenü am Start- oder Endereignis → Prozessschnittstelle (ab 0.5.0) |
| beide | Schnittstellen (Input) / (Output) | Schnittstellen vor einem **Startereignis** bzw. hinter einem **Endereignis**, mit Typ, Partnerprozess und Ereignis | Kontextmenü am Start- oder Endereignis → Schnittstelle; Typ und Beschreibung im Eigenschaftenbereich (ab 0.5.0) |
| Steckbrief | Personell | alle Rollen und Gruppen aus der DEMI-Matrix | Lane bzw. Pool → Rolle/Gruppe; Aufgabe → Verantwortlichkeiten (DEMI) |
| Steckbrief | Dokumente | Datenobjekte und Datenspeicher, die **in eine Aktivität eingehen**; Unterlagen mit Web-Adresse als Link | Datenobjekt → Pfeil zur Aufgabe; Datenobjekt → Unterlage → Web(URL) (ab 0.6.0) |
| Steckbrief | Systeme | alle IT-Services an den Aktivitäten | Aufgabe → IT-Services |
| Gesamtdokument | Prozessablaufdiagramm | das Diagramm selbst | Layout aufräumen |
| Gesamtdokument | Beschreibung der Prozessschritte | jede Aufgabe, jeder Teilprozess, jedes Ereignis und Gateway: Name, Art, IT-Services, Input, Output, Beschreibung, Regeln, Verzweigungen, Unterlagen | siehe Abschnitte unten |
| Gesamtdokument | Status | Status am Datenobjekt „Prozess“ und welche Aktivität ihn setzt | Datenobjekt „Prozess“ → Status; Pfeil von der Aufgabe zum Datenobjekt |
| Gesamtdokument | Verantwortlichkeiten (DEMI) | D aus Lane oder Aufgabe, E, M, I an der Aufgabe | Lane → Rolle/Gruppe; Aufgabe → DEMI |

Nicht in den Berichten erscheinen: gewöhnliche Textanmerkungen (ohne Prozess- oder Schnittstellensymbol), Gruppen (Rahmen), Nachrichtenflüsse, Übersetzungen der Namen und die Datenobjekte selbst in der Elementtabelle. Was dort steht, muss also zusätzlich in eine Beschreibung.

## 1. Prozess und Kopfdaten

Name und Beschreibung des Prozesses füllen den Titel beider Berichte, „Zweck und Beschreibung“ im Steckbrief und „Prozessinformationen“ im Gesamtdokument. Fehlt der Name, heißt der Bericht „Ohne Namen“.

1. Auf eine leere Stelle im Diagramm klicken. Im Reiter **Eigenschaften** erscheinen Name und Beschreibung des Prozesses.
2. **Name**: der Vorgang in Substantiv + Verb, z. B. „Incident bearbeiten“. Bei einem Pool heißen Kollaboration und Prozess automatisch gleich; bei mehreren Pools gilt der Name der Kollaboration, die Pools behalten ihren eigenen Namen (z. B. Abteilung).
3. **Beschreibung des Prozesses (Markdown)**: zwei bis fünf Absätze. Bewährt hat sich diese Reihenfolge:
   1. Zweck: Wozu gibt es den Prozess, welches Ergebnis liefert er?
   2. Geltungsbereich: für wen und für welche Fälle; was ausdrücklich nicht dazugehört.
   3. Auslöser und Ende in einem Satz, falls sie mehr Erklärung brauchen als die Ereignisnamen.
   4. Prozessverantwortlicher, Rechtsgrundlagen oder Normen, Kennzahlen.
4. Das Modell als Datei speichern. Dann steht im Kopf beider Berichte der Dateiname, im Gesamtdokument zusätzlich unter Prozessinformationen.

Absätze trennst du mit einer Leerzeile; ein einfacher Zeilenumbruch bleibt ein Umbruch. Markdown-Zeichen wie `**` oder `-` erscheinen im Bericht als Text, nicht als Formatierung. Schreibe Beschreibungen deshalb als schlichte Absätze.

Die Berichte verwenden Namen und Beschreibungen in der Hauptsprache des Modells. Überschriften und Datum richten sich nach der Sprache der Oberfläche; nur Statusnamen werden auch übersetzt.

## 2. Pools, Lanes und Rollen

Rollen und Gruppen füllen „Personell“ im Steckbrief und die DEMI-Matrix im Gesamtdokument. Beide kennen nur, was an Lanes, Pools und Aufgaben eingetragen ist.

1. **Katalog anlegen** (Reiter Einstellungen → Katalog → Rollen und Gruppen): je Eintrag eine kurze ID, einen lesbaren Namen und die deutsche Bezeichnung. Ohne Katalog zeigen die Berichte die ID, z. B. `service_desk` statt „Service-Desk“. Der Katalog liegt nur im Browser; exportiere ihn und gib ihn an alle Modellierer weiter.
2. **Jede Lane bekommt eine Rolle oder Gruppe** (Lane anklicken → Rolle/Gruppe). Sie ist D für alle Aufgaben auf dieser Lane. Hat der Pool keine Lanes, trägst du die Rolle am Pool ein. Bei verschachtelten Lanes zählt die innerste.
3. **An der Aufgabe ergänzen** (Aufgabe → Verantwortlichkeiten (DEMI)):
   - **D** (durchführungsverantwortlich) nur, wenn die Aufgabe nicht auf einer Lane liegt. Genau eins je Benutzeraufgabe; Multi-Instanz-Aufgaben brauchen mindestens zwei.
   - **E** (entscheidungsverantwortlich): höchstens eins, z. B. bei Freigaben.
   - **M** (mitwirkend) und **I** (informiert): beliebig viele.
4. Die Schreibweise ist immer `group(…)`, `role(…)` oder `user(…)`. Daneben gibt es dynamische Zuordnungen wie `initiator()`, `performerOf(Erstellen)` oder `notPerformerOf(Erstellen)` für das Vier-Augen-Prinzip. Die Berichte zeigen dynamische Zuordnungen in dieser Schreibweise, nur Rollen und Gruppen aus dem Katalog mit Namen.

**Dynamische Lanes** (ab 0.4.0): Statt einer Rolle oder Gruppe kannst du im Suchfeld der Lane auch `field(coach)`, `firstOf(field(coach), field(responsible_person))` oder `approvalChain(field(responsible_person))` tippen. Eine gültige Schreibweise erscheint oben als „… (dynamisch)“. Der Name der Lane bleibt dann frei, also gib ihr einen sprechenden Namen wie „Coach“. Die DEMI-Matrix und die Berichte zeigen die Spalte in dieser Schreibweise.

In die DEMI-Matrix kommen alle Aktivitäten außer Teilprozessen selbst. Eine Aufgabe ohne jeden Eintrag erscheint als leere Zeile. Den Reiter **DEMI** kannst du vor dem Erzeugen als Vorschau nutzen: Was dort steht, steht auch im Bericht.

## 3. Aufgaben, Beschreibungen und Status

Jede Aufgabe ist eine Zeile in „Beschreibung der Prozessschritte“. Die Spalten füllen sich so:

| Spalte | Kommt aus | Pflegen |
| --- | --- | --- |
| Nr | Reihenfolge im Ablauf, in Teilprozessen mit Punkt (4.1, 4.2) | nichts; ergibt sich aus Sequenzflüssen und Lage |
| Objekt / Typ | Elementtyp und Aufgabenart, dazu „mehrfach parallel“, „mehrfach nacheinander“ oder „Schleife“ | Aufgabenart über den Schraubenschlüssel wählen: Benutzer, Service, Manuell, Senden, Empfangen, Geschäftsregel, Skript |
| Name | Name des Elements | kurz, Verb am Ende: „Rechnung prüfen“ |
| System | IT-Services der Aufgabe | Aufgabe → IT-Services (aus dem Service-Katalog, Art „fachlich“) |
| Input / Output | Datenobjekte und -speicher, die in die Aufgabe eingehen bzw. aus ihr herausgehen, beschriftet wie im Diagramm (auch „Prozess [In Arbeit]“); am Start- und Endereignis die Schnittstellen | Datenobjekt mit Pfeil zur bzw. von der Aufgabe verbinden; Schnittstellen siehe Abschnitt 4 |
| Beschreibung | Beschreibung, Regeln, Verzweigungen | Aufgabe → Beschreibung; Aufgabe → Regeln |
| Unterlagen | Datenobjekte mit Verweis, die per Eingabe an der Aufgabe hängen | Datenobjekt → Unterlage → Web(URL); Pfeil vom Datenobjekt zur Aufgabe (siehe Abschnitt 4) |

**Beschreibung**: Was wird getan, mit welchem Ergebnis, worauf ist zu achten? Bei Benutzeraufgaben auch, wann sie als erledigt gilt. Zwei bis vier Sätze reichen meist. Die Beschreibungen der ersten und letzten Aktivität stehen zusätzlich im Steckbrief.

**IT-Services**: Lege die Systeme zuerst im Katalog unter IT-Services mit der Art „fachlich“ an. Nur diese stehen an der Aufgabe zur Auswahl. Jede Benutzer- und Serviceaufgabe braucht mindestens einen; die Prüfung meldet sonst einen Fehler. Alle Services zusammen ergeben „Systeme“ im Steckbrief.

**Unterlagen** (ab 0.6.0): Arbeitsanweisung, Richtlinie, Formular oder Wiki-Seite sind Datenobjekte mit Eingabe an der Aufgabe, siehe „Unterlagen an Prozessschritten“ in Abschnitt 4. Das frühere Attribut „Weiterführende Dokumentation“ gibt es nicht mehr.

**Regeln**: Kennzeichen (Bedingung, Prüfung, Maske, Startaktion, Folgeaktion) und eine Beschreibung in Worten, z. B. „Vier-Augen-Prinzip: nicht die Person, die erfasst hat“. Beides erscheint in der Beschreibungsspalte. Aufgaben, die keine Person abschließt, haben nur Start- und Folgeaktionen.

**Teilprozesse** bekommen selbst Name und Beschreibung; ihre Schritte erscheinen eingerückt darunter. Aufruf-Aktivitäten verweisen auf einen anderen Prozess; nenne ihn in der Beschreibung.

### Status

Das Kapitel „Status“ erscheint im Gesamtdokument nur, wenn mindestens ein Status modelliert ist. Der Status steuert nichts; er dokumentiert, in welchem Zustand der Vorgang nach einem Schritt ist.

1. Ein Datenobjekt mit dem Namen **„Prozess“** anlegen, höchstens eins je Pool. Nur dieses trägt einen Status.
2. Für jeden Statuswechsel eine Referenz darauf neben die Aufgabe legen, unter Eigenschaften → **Status** wählen oder eingeben. Der Status steht danach in eckigen Klammern im Namen, z. B. „Prozess [In Bearbeitung]“.
3. **Pfeil von der Aufgabe zum Datenobjekt** (Output): Die Aufgabe setzt diesen Status. Daraus entsteht die Tabelle „Statuswechsel“.
4. Pfeil vom Datenobjekt zur Aufgabe (Input) dokumentiert nur, in welchem Status die Aufgabe beginnt.
5. Den Anfangsstatus setzt die erste Aktivität, nie das Startereignis.

Verwende lesbare Statusnamen („In Bearbeitung“ statt „`in_progress`“): Der Bericht zeigt den Namen, der Schlüssel steht daneben. Mit einer Statustabelle im Katalog bleiben Schlüssel und Schreibweise in allen Modellen gleich.

**Text in der Auswahl** (ab 0.4.0): Hat eine Aufgabe mehrere Ergebnisse, wählt der Bearbeiter beim Abschluss eines davon. Klicke den Pfeil von der Aufgabe zum Datenobjekt „Prozess“ an und trag unter Status → **Text in der Auswahl** ein, was er dort lesen soll, z. B. „Zurückweisen“ statt des Statusnamens „Abgelehnt“. Die Übersetzung steht unter Übersetzungen. Die Bedingung am Weg nach dem Gateway zeigt dann „Zurückweisen · Abgelehnt“, und ein Weg ohne Namen bekommt diesen Text als Beschriftung.

## 4. Dokumente, Datenobjekte und Schnittstellen

Woher ein Prozess kommt, wohin er übergibt und was dabei fließt, zeigen ab 0.5.0 zwei eigene Symbole. Datenobjekte beschreiben dagegen, womit die einzelnen Aufgaben arbeiten.

### Vor- und nachgelagerte Prozesse, Inputs und Outputs

- **Prozessschnittstelle** (Prozesspfeil): ein vor- oder nachgelagerter Prozess. Im Eigenschaftenbereich stehen Name und, freiwillig, eine **Kennung des Prozesses**, z. B. die Nummer aus der Prozesslandkarte.
- **Schnittstelle** (Rechteck mit Typzeichen): was übergeben wird, mit einem **Typ**: Dokument, Datensatz, Ereignis/Nachricht, Daten aus IT-System, Material oder Sonstiges. Die Beschreibung (z. B. „Formular im DMS“) steht im Bericht darunter.

Beide stehen in der Palette und im Kontextmenü von Start- und Endereignissen. Über das Kontextmenü steht das neue Symbol gleich links vom Start bzw. rechts vom Ende und ist schon verbunden. Verbunden wird immer in Flussrichtung:

```
eingehend:  [Vorgelagerter Prozess] ··> [Schnittstelle] ··> (Startereignis)
ausgehend:  (Endereignis) ··> [Schnittstelle] ··> [Nachgelagerter Prozess]
```

Die Schnittstelle oder das Prozesssymbol darf fehlen, z. B. „E-Mail des Kunden“ als Schnittstelle direkt am Start. Andere Verbindungen lässt der Modellierer nicht zu; eine Schnittstelle ist entweder Input oder Output. Es zählen nur Start- und Endereignisse der obersten Ebene, nicht die in Teilprozessen.

| Symbol | Erscheint unter |
| --- | --- |
| Prozessschnittstelle vor einem Start (direkt oder über eine Schnittstelle) | Vorgelagerte Prozesse |
| Prozessschnittstelle hinter einem Ende | Nachgelagerte Prozesse |
| Schnittstelle vor einem Start | Schnittstellen (Input), mit „von … · bei …“; in der Elementtabelle in der Spalte Input des Startereignisses |
| Schnittstelle hinter einem Ende | Schnittstellen (Output), mit „an … · bei …“; in der Elementtabelle in der Spalte Output des Endereignisses |

Die Prüfung warnt bei einer Schnittstelle ohne Typ, bei einem Symbol ohne Verbindung zu einem Start- oder Endereignis und bei einer Verbindung gegen die Flussrichtung. Zur Laufzeit bewirken die Symbole nichts; andere BPMN-Werkzeuge zeigen sie als Textanmerkung.

### Dokumente und Datenobjekte

| Verbindung | Erscheint unter |
| --- | --- |
| Datenobjekt oder -speicher → Aktivität (Input der Aufgabe) | Steckbrief: Ressourcen → Dokumente; Elementtabelle: Spalte Input |
| Aktivität → Datenobjekt (Output der Aufgabe) | Elementtabelle: Spalte Output |
| Start- oder Endereignis ↔ Datenobjekt | nirgends mehr; die Prüfung weist darauf hin (`data-at-start-or-end`). Als Schnittstelle modellieren. |

So modellierst du es:

1. **Eingangsdokumente und Ergebnisse** des ganzen Prozesses (Antrag, E-Mail, Bescheid, Rechnung) als Schnittstelle an das Start- bzw. Endereignis hängen, nicht mehr als Datenobjekt.
2. **Arbeitsdokumente**: Jedes Dokument, das eine Aufgabe braucht, mit einem Pfeil vom Dokument **zur** Aufgabe verbinden. Was eine Aufgabe erzeugt, mit einem Pfeil **von** der Aufgabe.
3. **Datenspeicher** für Systeme mit dauerhaften Daten (Akte, Datenbank, Ablage). Sie erscheinen unter Dokumente mit dem Zusatz „(Datenspeicher)“.
4. Dasselbe Dokument überall **gleich benennen**. Der Steckbrief fasst gleiche Namen zusammen; „Antrag“ und „Antragsformular“ stehen sonst doppelt da.

Das Datenobjekt „Prozess“ trägt nur den Status und erscheint nie als Dokument oder Schnittstelle; in den Spalten Input und Output steht es mit seinem Status, z. B. „Prozess [In Arbeit]“. Alle IT-Services erscheinen unter Systeme.

### Unterlagen an Prozessschritten (ab 0.6.0)

Unterlagen, die man für eine Aufgabe braucht, etwa eine Arbeitsanweisung, eine Formularvorlage oder eine Checkliste, modellierst du **immer als Datenobjekt mit einer Eingabe an der Aufgabe**. So sieht man sie im Diagramm und im Bericht.

1. Datenobjekt anlegen und sprechend benennen, z. B. „Arbeitsanweisung Reklamation“.
2. Im Eigenschaftenbereich unter **Unterlage** die **Web(URL)** eintragen, z. B. die Adresse der Wiki-Seite.
3. Einen Pfeil **vom Datenobjekt zur Aufgabe** ziehen. Braucht eine weitere Aufgabe dieselbe Unterlage, einen zweiten Pfeil vom selben Datenobjekt ziehen; die Adresse steht nur einmal am Datenobjekt.

Im Steckbrief steht die Unterlage unter Dokumente als Link, im Gesamtdokument in der Spalte **Unterlagen** ihrer Aufgabe. Nur Adressen mit `https://`, `http://` oder `mailto:` sind anklickbar. Ein Datenobjekt ohne Adresse, z. B. „Angebot“, beschreibt nur und erscheint weiter unter Input.

Kommt ein Modell aus einem anderen Werkzeug mit einem **Dokument-Record** (`bestadd:documentRef`, z. B. `DOC-12`), zeigt bestbpmn den Schlüssel unter Unterlage an und behält ihn beim Speichern. Im Bericht steht dann „Name (DOC-12)“. Der Record gilt vor einer Web-Adresse; mit „Verweis auf den Record entfernen“ wird das Feld Web(URL) frei.

**Ältere Modelle**: Links im früheren Attribut „Weiterführende Dokumentation“ wandelt bestbpmn beim Öffnen um. Je Link entsteht ein Datenobjekt über der Aufgabe, benannt nach dem Titel des Links, mit Eingabe an der Aufgabe. Ein Hinweis in der Kopfzeile sagt, wie viele es waren; danach Lage prüfen und speichern. Rückgängig (Strg+Z) stellt den alten Stand her.

Drei Hinweise in der Prüfung: `document-not-input` (Datenobjekt mit Verweis hängt an keiner Aufgabe), `document-ref-and-href` (Record und Web-Adresse zugleich) und `legacy-links-attribute` (Aufgabe hat noch Links im alten Attribut).

Im Beispiel „Incident bearbeiten“ fehlen etwa die E-Mail am Startereignis „E-Mail eingegangen“ (Input) und das Ticket am Endereignis (Output).

## 5. Ereignisse, Gateways und Ablauf

Ereignisse liefern Auslöser und Endzustand im Steckbrief; Gateways und Sequenzflüsse liefern die Verweise „weiter bei …“ in der Elementtabelle.

**Startereignisse**: Name als eingetretener Zustand, z. B. „Antrag eingegangen“. Wähle die passende Ereignisart (Nachricht, Zeitgeber, Signal, Bedingung); sie steht in Klammern hinter dem Auslöser. In die Beschreibung gehört, wer oder was den Prozess auslöst und auf welchem Weg.

**Endereignisse**: Name als erreichtes Ergebnis, z. B. „Antrag genehmigt“ oder „Antrag abgelehnt“. Jedes Endereignis ist ein Endzustand im Steckbrief; das Ende des längsten Wegs steht zuerst. Zusammenfassende Enden wie „Ende“ sagen im Bericht nichts aus.

**Gateways**: Name als Frage, z. B. „Antrag vollständig?“. Beschrifte jeden ausgehenden Sequenzfluss („Ja“, „Nein“, „über 10.000 €“). Die Elementtabelle zeigt dann „Ja: weiter bei 6“ statt nur „weiter bei 6“. Den Standardfluss zeigt sie als „sonst“.

**Wer am Gateway entscheidet** (ab 0.4.0): Das Symbol oben rechts am Gateway zeigt es. 👤 heißt, die Person davor entscheidet über ihr Ergebnis (den Status). ☑ heißt, sie wählt einen Weg, ohne dass sich der Status ändert. ⚙ heißt, das System entscheidet nach Feldwerten. Für die Wahl muss das exklusive Gateway direkt nach einer Benutzeraufgabe ohne mehrere Ergebnisse stehen; an jedem Weg wählst du unter Bedingung **„(Wahl des Bearbeiters)“**. Der Name des Wegs ist der Text, den der Bearbeiter sieht, also braucht jeder Weg einen. Wahl, Ergebnisse und Feldbedingungen mischst du an einem Gateway nicht.

**Angeheftete Ereignisse** (Frist, Fehler, Eskalation): immer benennen, z. B. „Frist 5 Tage abgelaufen“. In der Tabelle steht an der Aufgabe „bei ‚Frist 5 Tage abgelaufen‘: weiter bei 10“, und das Ereignis bekommt eine eigene Zeile mit Beschreibung.

**Ablauf und Nummerierung**: Die Nummern folgen den Sequenzflüssen, beginnend beim ersten Startereignis in Modellierrichtung (links bzw. oben) bis zum Endereignis. Pools und Lanes spielen für die Reihenfolge keine Rolle: Mehrere Pools ergeben eine gemeinsame Tabelle, die über die Nachrichtenflüsse von Pool zu Pool weitergeht. Dieselbe Reihenfolge gilt für die DEMI-Matrix und die Status. Verbinde deshalb jedes Element mit Sequenzflüssen. Unverbundene Elemente landen nach ihrer Lage am Ende und zerreißen die Reihenfolge. Rücksprungschleifen erscheinen als „zurück zu …“.

**Diagramm**: Das Gesamtdokument enthält das Diagramm so, wie es auf dem Bildschirm aussieht. Ein aufgeräumtes Layout von links nach rechts mit kurzen, kreuzungsfreien Kanten macht es im Ausdruck lesbar.

## Planwerte (optional, ab 0.4.0)

Planwerte erscheinen nur im Bericht Personalbedarf; im Eigenschaftenbereich liefern sie Durchlaufzeit und Aufwand. Sie sind standardmäßig aus und werden mit dem Schalter **Planwerte** in der Kopfzeile eingeblendet.

- An jeder Aufgabe unter **Planwerte**: Aufwand des D je Ausführung, bei E und M deren Aufwand und die Dauer einschließlich Liegezeit. Eingaben wie `30`, `45m`, `1h30m` oder `2d` (Arbeitstage) genügen.
- An jedem Ausgang eines Gateways die Wahrscheinlichkeit in Prozent; am Entweder-oder ergeben alle zusammen 100 %. An Grenzereignissen steht, wie oft sie je Ausführung eintreten.
- Am Prozess zeigt **Rechnung aus den Planwerten** Durchlaufzeit (Mittel, Median, 85 %, 95 %), Aufwand je Zuständigem und den kritischen Pfad. Fehlende Angaben stehen dort und als Hinweise im Reiter Status.
- **Jährliches Vorkommen** (ab 0.6.0) unter Planwerte am Prozess (leere Fläche, Pool oder Kollaboration): wie oft der Prozess im Jahr durchlaufen wird, z. B. `1200`, `1.200` oder `0,5` (alle zwei Jahre). An einer Kollaboration mit mehreren Pools gilt eine Eingabe für alle Pools. Damit rechnet der Bericht **Personalbedarf** (Menü „Bericht“, nur bei eingeschalteten Planwerten) für jede Durchführungsverantwortung den Aufwand des D je Ausführung mal die Ausführungen im Jahr, in Stunden und in VZÄ. 1 VZÄ = 38,5 h × 220 Arbeitstage ÷ 5 Tage je Woche = 1694 Stunden. Aufgaben auf Wegen, die nur manchmal genommen werden, zählen mit ihrer Wahrscheinlichkeit, Schleifen mit ihren Wiederholungen. Aufwand von E und M zählt nicht mit. Prozesse ohne Vorkommen und Aufgaben ohne Aufwand des D stehen unter „Fehlende Angaben“; ein Wert, der keine Zahl über 0 ist, meldet `invalid-planning-value`.
- **Wertschöpfung** (ab 0.5.0): An jeder Aufgabe unter Planwerte die Bewertung wertschöpfend, unterstützend oder nicht wertschöpfend. Am Prozess zeigt **Wertschöpfungsanalyse** den gewichteten Mittelwert und jeden möglichen Weg mit Wahrscheinlichkeit und Aufgabenfolge; aufgeklappt die Anteile nach Anzahl und Bearbeitungszeit, Durchlaufzeit, Bearbeitungszeit, Liegezeit und Flussrate. Bearbeitungszeit ist der Aufwand von D und E, Liegezeit die Dauer minus die Bearbeitungszeit; Wartezeit an Zwischenereignissen ist ganz Liegezeit. Ist eine Aufgabe bewertet, meldet die Prüfung jede unbewertete.

## 6. Checkliste vor dem Erzeugen

Geh diese Punkte durch, bevor du im Menü **Bericht** Steckbrief oder Gesamtdokument erzeugst. Der Reiter **Status** zeigt unter „Prüfung“ Fehler und Hinweise der Modellierregeln; ein Modell ohne Meldungen ist die beste Grundlage.

- [ ] Prozess hat Name und Beschreibung (Zweck, Geltungsbereich, Verantwortliche).
- [ ] Modell ist als Datei gespeichert.
- [ ] Katalog mit Rollen und Gruppen, IT-Services und Status ist geladen.
- [ ] Jede Lane, oder der Pool ohne Lanes, hat eine Rolle oder Gruppe oder eine dynamische Zuordnung wie firstOf(…).
- [ ] E, M und I sind an den Aufgaben eingetragen, wo es sie gibt.
- [ ] Jedes Start- und Endereignis hat einen sprechenden Namen, eine Ereignisart und eine Beschreibung.
- [ ] Jede Aufgabe hat Name, Aufgabenart und Beschreibung.
- [ ] Jede Benutzer- und Serviceaufgabe hat mindestens einen IT-Service.
- [ ] Arbeitsanweisungen und Richtlinien hängen als Datenobjekt mit Web(URL) per Eingabe an ihren Aufgaben.
- [ ] Regeln (Vier-Augen-Prinzip, Prüfungen, Folgeaktionen) sind gekennzeichnet und beschrieben.
- [ ] Vor- und nachgelagerte Prozesse sowie Inputs und Outputs sind als Symbole am Start- bzw. Endereignis angehängt, jede Schnittstelle hat einen Typ; Arbeitsdokumente gehen in ihre Aufgaben.
- [ ] Datenobjekt „Prozess“ mit lesbaren Status ist angelegt; jede Aufgabe, die einen Status setzt, zeigt mit einem Pfeil darauf.
- [ ] Gateways haben eine Frage als Namen, alle ausgehenden Wege eine Beschriftung; Wege mit Wahl des Bearbeiters tragen den Text der Auswahl.
- [ ] Angeheftete Ereignisse sind benannt.
- [ ] Alle Elemente sind mit Sequenzflüssen verbunden; das Layout ist aufgeräumt.
- [ ] Der Reiter DEMI zeigt keine leeren Zeilen und keine technischen Kürzel.

Was im Bericht dann noch „–“ zeigt, fehlt im Modell. Die Übersicht in Abschnitt „Woher jeder Abschnitt seine Daten hat“ sagt, wo.
