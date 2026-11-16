# bestbpmn Modellierungsanleitung für vollständige Berichte

Stand: 2026-11-16, bestbpmn 0.4.0

Diese Datei ist die gepflegte Fassung der Anleitung. Änderungen am Modeler, die Berichte oder Pflegeorte betreffen, tragen hier mit ein.

## Zweck

Beide Berichte entstehen vollständig aus dem BPMN-Modell: Was im Modell fehlt, steht im Bericht als „–“ oder gar nicht da. Diese Anleitung sagt, welche Elemente und Felder du pflegen musst, damit jeder Abschnitt gefüllt ist. Sie beruht auf dem Code von bestbpmn 0.4.0 (Bericht-Menü, Steckbrief und Gesamtdokument).

- **Steckbrief**: eine Seite ohne Grafik. Zweck, Auslöser, Endzustand, erste und letzte Aktivität, Schnittstellen (Input/Output) und Ressourcen (Personell, Dokumente, Systeme).
- **Gesamtdokument**: Prozessinformationen, Prozessablaufdiagramm, Beschreibung der Prozessschritte (Elementtabelle), Status (nur wenn modelliert) und Verantwortlichkeiten (DEMI).

Im Beispiel „Incident bearbeiten“ bleiben Input, Output, Dokumente und Systeme leer, die Spalten „System“ und „Weiterführende Dokumentation“ sind leer, und unter Personell stehen technische Kürzel wie `service_desk`. Genau diese Lücken schließt die Anleitung.

## Übersicht: Woher jeder Abschnitt seine Daten hat

Die Tabelle zeigt für jeden Berichtsabschnitt, aus welchem Modellteil er gefüllt wird und wo du das pflegst. „Eigenschaften“ meint den gleichnamigen Reiter rechts neben dem Diagramm.

| Bericht | Abschnitt | Kommt aus | Pflegen unter |
| --- | --- | --- | --- |
| beide | Titel (Name des Modells) | Name der Kollaboration, sonst des einzigen Pools oder Prozesses | Leere Fläche anklicken → Eigenschaften → Allgemein → Name |
| Steckbrief | Zweck und Beschreibung | Beschreibung des Prozesses | Leere Fläche → Beschreibung des Prozesses (Markdown) |
| Gesamtdokument | Prozessinformationen | Name und Beschreibung des Prozesses, Dateiname | wie oben; Modell als Datei speichern |
| Steckbrief | Auslöser | alle Startereignisse mit Name, Ereignisart und Beschreibung | Startereignis → Name, Beschreibung, Ereignisart (Schraubenschlüssel) |
| Steckbrief | Endzustand | alle Endereignisse mit Name, Art und Beschreibung | Endereignis → Name, Beschreibung |
| Steckbrief | Erste / Letzte Aktivität | die Aktivität direkt nach jedem Start bzw. vor jedem Ende, über Gateways und Zwischenereignisse hinweg | Name und Beschreibung dieser Aufgaben |
| Steckbrief | Schnittstellen (Input) | Datenobjekte und Datenspeicher, die mit einem **Startereignis** verbunden sind | Datenobjekt neben den Start legen und verbinden |
| Steckbrief | Schnittstellen (Output) | Datenobjekte und Datenspeicher, die mit einem **Endereignis** verbunden sind | Datenobjekt neben das Ende legen und verbinden |
| Steckbrief | Personell | alle Rollen und Gruppen aus der DEMI-Matrix | Lane bzw. Pool → Rolle/Gruppe; Aufgabe → Verantwortlichkeiten (DEMI) |
| Steckbrief | Dokumente | Datenobjekte und Datenspeicher, die **in eine Aktivität eingehen**, dazu alle Links | Datenobjekt → Pfeil zur Aufgabe; Aufgabe → Weiterführende Dokumentation |
| Steckbrief | Systeme | alle IT-Services an den Aktivitäten | Aufgabe → IT-Services |
| Gesamtdokument | Prozessablaufdiagramm | das Diagramm selbst | Layout aufräumen |
| Gesamtdokument | Beschreibung der Prozessschritte | jede Aufgabe, jeder Teilprozess, jedes Ereignis und Gateway: Name, Art, IT-Services, Beschreibung, Regeln, Verzweigungen, Links | siehe Abschnitte unten |
| Gesamtdokument | Status | Status am Datenobjekt „Prozess“ und welche Aktivität ihn setzt | Datenobjekt „Prozess“ → Status; Pfeil von der Aufgabe zum Datenobjekt |
| Gesamtdokument | Verantwortlichkeiten (DEMI) | D aus Lane oder Aufgabe, E, M, I an der Aufgabe | Lane → Rolle/Gruppe; Aufgabe → DEMI |

Nicht in den Berichten erscheinen: Textanmerkungen, Gruppen (Rahmen), Nachrichtenflüsse, Übersetzungen der Namen und die Datenobjekte selbst in der Elementtabelle. Was dort steht, muss also zusätzlich in eine Beschreibung.

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
| Beschreibung | Beschreibung, Regeln, Verzweigungen | Aufgabe → Beschreibung; Aufgabe → Regeln |
| Weiterführende Dokumentation | Links der Aufgabe | Aufgabe → Weiterführende Dokumentation: Titel + Web(URL) |

**Beschreibung**: Was wird getan, mit welchem Ergebnis, worauf ist zu achten? Bei Benutzeraufgaben auch, wann sie als erledigt gilt. Zwei bis vier Sätze reichen meist. Die Beschreibungen der ersten und letzten Aktivität stehen zusätzlich im Steckbrief.

**IT-Services**: Lege die Systeme zuerst im Katalog unter IT-Services mit der Art „fachlich“ an. Nur diese stehen an der Aufgabe zur Auswahl. Jede Benutzer- und Serviceaufgabe braucht mindestens einen; die Prüfung meldet sonst einen Fehler. Alle Services zusammen ergeben „Systeme“ im Steckbrief.

**Weiterführende Dokumentation**: Links zu Arbeitsanweisung, Richtlinie, Formular oder Wiki. Gib immer einen Titel an, sonst steht die nackte Adresse im Bericht. Nur Adressen mit `https://`, `http://` oder `mailto:` sind anklickbar. Alle Links zusammen stehen im Steckbrief unter „Dokumente“.

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

Datenobjekte und Datenspeicher füllen im Steckbrief drei Abschnitte. Entscheidend ist, **womit** sie verbunden sind und **in welche Richtung** der Pfeil zeigt.

| Verbindung | Erscheint im Steckbrief unter |
| --- | --- |
| Datenobjekt oder -speicher → Aktivität (Input der Aufgabe) | Ressourcen → Dokumente |
| Startereignis ↔ Datenobjekt oder -speicher | Schnittstellen (Input) |
| Endereignis ↔ Datenobjekt oder -speicher | Schnittstellen (Output) |
| Aktivität → Datenobjekt (Output der Aufgabe) | nirgends, außer das Objekt geht in eine spätere Aktivität oder ein Endereignis |

So modellierst du es:

1. **Eingangsdokumente**: Was den Prozess auslöst oder mitbringt (Antrag, E-Mail, Bestellung), als Datenobjekt neben das Startereignis legen und mit ihm verbinden.
2. **Ergebnisse**: Was der Prozess abliefert (Bescheid, freigegebenes Dokument, Rechnung), mit dem Endereignis verbinden. Ein Ergebnis, das nur aus einer Aufgabe herausgeht, erscheint sonst nicht.
3. **Arbeitsdokumente**: Jedes Dokument, das eine Aufgabe braucht, mit einem Pfeil vom Dokument **zur** Aufgabe verbinden.
4. **Datenspeicher** für Systeme mit dauerhaften Daten (Akte, Datenbank, Ablage). Sie erscheinen mit dem Zusatz „(Datenspeicher)“.
5. Dasselbe Dokument überall **gleich benennen**. Der Steckbrief fasst gleiche Namen zusammen; „Antrag“ und „Antragsformular“ stehen sonst doppelt da.

Das Datenobjekt „Prozess“ trägt nur den Status und erscheint nie als Dokument oder Schnittstelle. Links unter „Weiterführende Dokumentation“ erscheinen zusätzlich unter Dokumente (siehe Abschnitt 3), ebenso alle IT-Services unter Systeme.

Im Beispiel „Incident bearbeiten“ fehlen etwa die E-Mail am Startereignis „E-Mail eingegangen“ (Input) und das Ticket am Endereignis (Output).

## 5. Ereignisse, Gateways und Ablauf

Ereignisse liefern Auslöser und Endzustand im Steckbrief; Gateways und Sequenzflüsse liefern die Verweise „weiter bei …“ in der Elementtabelle.

**Startereignisse**: Name als eingetretener Zustand, z. B. „Antrag eingegangen“. Wähle die passende Ereignisart (Nachricht, Zeitgeber, Signal, Bedingung); sie steht in Klammern hinter dem Auslöser. In die Beschreibung gehört, wer oder was den Prozess auslöst und auf welchem Weg.

**Endereignisse**: Name als erreichtes Ergebnis, z. B. „Antrag genehmigt“ oder „Antrag abgelehnt“. Jedes Endereignis ist ein Endzustand im Steckbrief; das Ende des längsten Wegs steht zuerst. Zusammenfassende Enden wie „Ende“ sagen im Bericht nichts aus.

**Gateways**: Name als Frage, z. B. „Antrag vollständig?“. Beschrifte jeden ausgehenden Sequenzfluss („Ja“, „Nein“, „über 10.000 €“). Die Elementtabelle zeigt dann „Ja: weiter bei 6“ statt nur „weiter bei 6“. Den Standardfluss zeigt sie als „sonst“.

**Wer am Gateway entscheidet** (ab 0.4.0): Das Symbol oben rechts am Gateway zeigt es. 👤 heißt, die Person davor entscheidet über ihr Ergebnis (den Status). ☑ heißt, sie wählt einen Weg, ohne dass sich der Status ändert. ⚙ heißt, das System entscheidet nach Feldwerten. Für die Wahl muss das exklusive Gateway direkt nach einer Benutzeraufgabe ohne mehrere Ergebnisse stehen; an jedem Weg wählst du unter Bedingung **„(Wahl des Bearbeiters)“**. Der Name des Wegs ist der Text, den der Bearbeiter sieht, also braucht jeder Weg einen. Wahl, Ergebnisse und Feldbedingungen mischst du an einem Gateway nicht.

**Angeheftete Ereignisse** (Frist, Fehler, Eskalation): immer benennen, z. B. „Frist 5 Tage abgelaufen“. In der Tabelle steht an der Aufgabe „bei ‚Frist 5 Tage abgelaufen‘: weiter bei 10“, und das Ereignis bekommt eine eigene Zeile mit Beschreibung.

**Ablauf und Nummerierung**: Die Nummern folgen den Sequenzflüssen, beginnend beim obersten Startereignis. Verbinde deshalb jedes Element mit Sequenzflüssen. Unverbundene Elemente landen nach ihrer Lage am Ende und zerreißen die Reihenfolge. Rücksprungschleifen erscheinen als „zurück zu …“.

**Diagramm**: Das Gesamtdokument enthält das Diagramm so, wie es auf dem Bildschirm aussieht. Ein aufgeräumtes Layout von links nach rechts mit kurzen, kreuzungsfreien Kanten macht es im Ausdruck lesbar.

## Planwerte (optional, ab 0.4.0)

Planwerte erscheinen in keinem Bericht; sie liefern Durchlaufzeit und Personalbedarf im Eigenschaftenbereich. Sie sind standardmäßig aus und werden mit dem Schalter **Planwerte** in der Kopfzeile eingeblendet.

- An jeder Aufgabe unter **Planwerte**: Aufwand des D je Ausführung, bei E und M deren Aufwand und die Dauer einschließlich Liegezeit. Eingaben wie `30`, `45m`, `1h30m` oder `2d` (Arbeitstage) genügen.
- An jedem Ausgang eines Gateways die Wahrscheinlichkeit in Prozent; am Entweder-oder ergeben alle zusammen 100 %. An Grenzereignissen steht, wie oft sie je Ausführung eintreten.
- Am Prozess zeigt **Rechnung aus den Planwerten** Durchlaufzeit (Mittel, Median, 85 %, 95 %), Aufwand je Zuständigem und den kritischen Pfad. Fehlende Angaben stehen dort und als Hinweise im Reiter Status.

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
- [ ] Arbeitsanweisungen und Richtlinien sind als Links mit Titel an den Aufgaben.
- [ ] Regeln (Vier-Augen-Prinzip, Prüfungen, Folgeaktionen) sind gekennzeichnet und beschrieben.
- [ ] Eingangsdokumente hängen am Startereignis, Ergebnisse am Endereignis, Arbeitsdokumente gehen in ihre Aufgaben.
- [ ] Datenobjekt „Prozess“ mit lesbaren Status ist angelegt; jede Aufgabe, die einen Status setzt, zeigt mit einem Pfeil darauf.
- [ ] Gateways haben eine Frage als Namen, alle ausgehenden Wege eine Beschriftung; Wege mit Wahl des Bearbeiters tragen den Text der Auswahl.
- [ ] Angeheftete Ereignisse sind benannt.
- [ ] Alle Elemente sind mit Sequenzflüssen verbunden; das Layout ist aufgeräumt.
- [ ] Der Reiter DEMI zeigt keine leeren Zeilen und keine technischen Kürzel.

Was im Bericht dann noch „–“ zeigt, fehlt im Modell. Die Übersicht in Abschnitt „Woher jeder Abschnitt seine Daten hat“ sagt, wo.
