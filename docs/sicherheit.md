# Sicherheit: Prüfung nach OWASP ASVS Level 2

Stand: 2026-11-26, bestbpmn 0.6.1. Grundlage ist der OWASP Application Security Verification Standard (ASVS) in der Fassung 4.0.3, Stufe 2. Die Nummern beziehen sich auf diese Fassung, weil sie in Werkzeugen und Prüflisten am weitesten verbreitet ist.

## Was geprüft wurde

bestbpmn ist eine reine Browser-Anwendung: eine HTML-Datei (`bestbpmn.html`) bzw. eine statische Web-App mit Service Worker. Es gibt keinen Server, kein Backend, keine Anmeldung und keine Netzwerkzugriffe zu fremden Servern. Angreifbar ist die App daher vor allem über die Dateien, die man öffnet: BPMN-Modelle, Katalogdateien und Sperrdateien in einem geteilten Ordner. Ein Modell von jemand anderem darf weder in der App noch in einem Bericht Code ausführen, die App lahmlegen oder Daten abgreifen.

Geprüft wurden der eigene Code in `apps/web`, `packages/model`, `packages/bpmn-js-extension` und `packages/i18n`, der Build (`apps/web/build`) und die Abhängigkeiten.

## Prüftabelle

| ASVS | Anforderung | Befund | Maßnahme |
| --- | --- | --- | --- |
| 5.3.3 | Ausgabe kontextgerecht maskieren (XSS) | Steckbrief, Gesamtdokument und Personalbedarf maskieren alle Texte aus dem Modell mit `escape()`. Status-Ansicht und DEMI-Matrix ebenso; die übrigen Panels bauen ihr DOM mit `textContent`. Ein Fehler wurde nicht gefunden. | Neuer Test mit Markup in allen Namen, Beschreibungen, Rollen, dem Dateinamen und der Diagrammgrafik für alle drei Berichte (`apps/web/test/security.test.ts`). |
| 5.1.3, 5.3.3 | URLs aus Eingaben nur nach Erlaubnisliste verwenden | Unterlagen (`bestadd:href`) und Links werden im Bericht nur mit `http:`, `https:` und `mailto:` anklickbar, alles andere (`javascript:`, `data:`, `vbscript:`) bleibt Text. Im Modellierer selbst wird keine Adresse aus dem Modell geöffnet. | Keine Änderung nötig; im neuen Test zusätzlich geprüft. |
| 5.1.2 | Schutz vor Mass Assignment / Prototype Pollution | **Befund:** Verzeichnisse, deren Schlüssel aus dem Modell stammen, waren gewöhnliche Objekte. Ein Status mit dem Schlüssel `constructor`, `toString` oder `__proto__` traf geerbte Einträge: Die Prüfung meldete einen falschen `state-key-conflict`, der Statusname war eine Funktion, und die Status-Ansicht brach ab. Gleiches galt für Sprachschlüssel in Übersetzungen und im Katalog und für Typen von Schnittstellen. | Solche Verzeichnisse haben jetzt keinen Prototyp (`dict()` in `packages/model/src/util/dict.ts`), Übersetzungen lesen nur eigene Einträge (`own()`), das Typzeichen nutzt `Object.hasOwn`. Tests in `packages/model/test/security.test.ts`. |
| 5.5.2 | XML sicher verarbeiten (XXE) | bpmn-js liest XML mit `saxen`. Eigene und externe Entitäten werden nicht aufgelöst, ein `DOCTYPE` bleibt wirkungslos; eine Entitäten-Bombe ist daher nicht möglich. | Regressionstest mit internen und externen Entitäten. |
| 5.5.3 | Unsichere Deserialisierung vermeiden | Katalog- und Sperrdateien werden mit `JSON.parse` gelesen und danach Feld für Feld geprüft (`parseCatalog`, `readLock`); unbekannte Felder werden verworfen. | Keine Änderung nötig. |
| 5.2.4 | Kein `eval` und keine dynamische Codeausführung | Weder der eigene Code noch das gebaute Bündel enthalten `eval` oder `new Function`. | Durch die neue Content Security Policy (ohne `unsafe-eval`) auch für künftige Abhängigkeiten erzwungen. |
| 5.2.7 | SVG ohne ausführbaren Inhalt | Die Grafik im Gesamtdokument erzeugt bpmn-js selbst; Texte darin sind maskiert. Der PNG-Export zeichnet das SVG über ein `<img>`, dort laufen keine Skripte. | Test mit Markup in den Beschriftungen der Grafik. |
| 12.1.1 | Größe gelesener Dateien begrenzen | **Befund:** Modelle, Kataloge und Dateien im Ordner wurden ohne Größengrenze gelesen; eine sehr große Datei konnte den Tab lahmlegen. | Höchstens 20 MB je Datei (`apps/web/src/files/limits.ts`) beim Öffnen, Hineinziehen, Doppelklick (installierte App), im Ordner und beim Katalog. Zu große Dateien melden „Die Datei konnte nicht gelesen werden: 25 MB > 20 MB“; das offene Modell bleibt. Test vorhanden. |
| 12.3.1 | Dateinamen aus Eingaben bereinigen | Dateinamen für Speichern und Export entstehen aus dem Modellnamen über `fileNameFor()`: Zeichen, die Windows verbietet, und reservierte Namen (`CON`, `NUL` …) werden ersetzt. | Keine Änderung nötig. |
| 14.4.3 | Content Security Policy | **Befund:** Weder die App noch die Berichte hatten eine Content Security Policy. Der Druckrahmen für Berichte lief mit dem Ursprung der App und hätte Skripte ausführen dürfen. | App: Richtlinie als `<meta>` beim Build. Skripte nur aus dem Build (`'self'`), in der einzelnen Datei genau das eingebettete Skript per SHA-256-Hash; kein `unsafe-eval`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`. Berichte: eigene, strengere Richtlinie (`default-src 'none'`, nur Stil inline und Bilder als `data:`), auch in der gespeicherten HTML-Datei. Druckrahmen mit `sandbox="allow-same-origin allow-modals"`, also ohne Skripte. Tests vorhanden; im Browser für `bestbpmn.html` über `file://` und für die Web-App geprüft: keine Verstöße, Öffnen, PNG-Export und Druck laufen. |
| 14.2.1 | Abhängigkeiten aktuell und ohne bekannte Schwachstellen | `npm audit`: 0 Schwachstellen (Stand 2026-11-26). Alle Versionen sind fest angegeben, `package-lock.json` liegt im Repository. | CI prüft jetzt bei jedem Pull Request mit `npm audit --audit-level=high`. |
| 14.2.3 | Fremde Dateien mit Subresource Integrity laden | bestbpmn lädt nichts von fremden Servern; alles ist im Build enthalten. Der Service Worker beantwortet nur Anfragen an den eigenen Ursprung. | Nicht anwendbar. |
| 8.2.2 | Keine sensiblen Daten im Browser-Speicher | `localStorage` enthält nur Einstellungen (`bestbpmn.language`, `.planning`, `.sidebar`, `.rules`), den eigenen Katalog (`bestbpmn.catalog`) und den Anzeigenamen für Sperren (`bestbpmn.user`). IndexedDB merkt sich nur den Ordner-Handle; die Rechte vergibt der Browser. Keine Kennwörter, Schlüssel oder Modelle. | Keine Änderung nötig. |
| 8.3.4 | Wissen, welche personenbezogenen Daten anfallen | Sperrdateien im geteilten Ordner enthalten den selbst gewählten Anzeigenamen, eine zufällige Sitzungskennung und Zeitstempel. Mehr nicht. | Keine Änderung nötig. |
| 1.14.6 | Keine veralteten clientseitigen Techniken | Kein Flash, kein ActiveX, keine Java-Applets. | Nicht anwendbar. |
| 10.3.2 | Integrität des ausgelieferten Codes | Der Service Worker cached nur die Dateien des eigenen Builds unter einem Cache-Namen aus deren Hash; eine neue Version gilt nach „Neu laden“ oder beim nächsten Start. | Keine Änderung nötig. |

## Nicht anwendbar

| ASVS-Kapitel | Begründung |
| --- | --- |
| V2 Authentifizierung, V3 Sitzungen, V4 Zugriffskontrolle | bestbpmn hat keine Anmeldung und keine Benutzerkonten. Wer eine Datei öffnen darf, regelt das Dateisystem bzw. der Browser beim Ordnerzugriff. Die Sperren im geteilten Ordner sind ein Hinweis gegen gleichzeitiges Bearbeiten, keine Zugriffskontrolle. |
| V6 Kryptografie, V9 Kommunikation | Es werden keine Daten verschlüsselt, signiert oder übertragen. HTTPS beim Ausliefern der Web-App ist Sache des Webservers. |
| V7 Fehlerbehandlung und Protokollierung | Es gibt kein Serverprotokoll. Fehlermeldungen zeigen nur die Meldung des XML-Parsers, keine Interna. |
| V11 Geschäftslogik, V13 API und Webdienste | Es gibt keine Geschäftsvorgänge mit Wirkung nach außen und keine Schnittstellen. Status und Zuständigkeit sind nur Informationen im Modell. |
| V14.4.1–14.4.7 als HTTP-Header | Header setzt der Webserver; für `bestbpmn.html` über `file://` gibt es keine. Die mitgelieferte `web.config` für IIS setzt jetzt `X-Content-Type-Options: nosniff`, `Content-Security-Policy: frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN` und `Referrer-Policy: no-referrer`, die als `<meta>` nicht wirken. Bei einem anderen Webserver sind sie dort einzutragen. |

## Bewusste Restrisiken

- **Stile inline erlaubt** (`style-src 'unsafe-inline'`): bpmn-js, diagram-js und das Eigenschaften-Panel setzen Stilattribute. Über Stil allein lässt sich kein Code ausführen; alle Texte aus dem Modell sind ohnehin maskiert.
- **Druckrahmen mit `allow-same-origin`**: Ohne ihn kann die App den Druck nicht anstoßen. Da `allow-scripts` fehlt und der Bericht eine eigene Richtlinie hat, läuft im Rahmen trotzdem kein Code.
- **Bei `file://`** behandeln Browser den Ursprung eigen; die Richtlinie der einzelnen Datei erlaubt Skripte deshalb ausdrücklich per Hash und Bilder als `data:` und `blob:`.

## Prüfen

- `npm audit --audit-level=high`
- `npm run build && npm test` (enthält `packages/model/test/security.test.ts` und `apps/web/test/security.test.ts`)
- Beim Hinzufügen einer Abhängigkeit: Lizenz prüfen (siehe `CLAUDE.md`) und darauf achten, dass sie ohne `eval` auskommt, sonst blockiert die Content Security Policy sie.
