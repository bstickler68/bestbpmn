# @bestbpmn/i18n

Systemtexte von bestbpmn auf Englisch und Deutsch (PRAXIQ-ADR 0010). Englisch ist Standard- und Rückfallsprache.

- `src/locales/en.json`, `src/locales/de.json`: Texte für Modellierer und Oberfläche, inklusive der Meldungen der Modellprüfung unter `issue.<code>`. Beide Dateien haben dieselben Schlüssel; ein Test prüft das.
- `src/locales/bpmn-de.json`: deutsche Ergänzungen für das bpmn.io-Eigenschaftenpanel. Die Texte von bpmn-js selbst kommen aus `bpmn-js-i18n`.
- `createI18n(language)` liefert eine sofort nutzbare i18next-Instanz, `matchLanguage(navigator.languages)` die passende unterstützte Sprache.

Eine neue Sprache braucht eine weitere JSON-Datei mit denselben Schlüsseln und einen Eintrag in `resources`.
