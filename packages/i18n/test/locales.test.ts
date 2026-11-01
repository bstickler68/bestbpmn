import { describe, expect, it } from 'vitest';
import de from '../src/locales/de.json' with { type: 'json' };
import en from '../src/locales/en.json' with { type: 'json' };
import { createI18n, matchLanguage } from '../src/index.js';

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('Systemtexte (ADR 0010)', () => {
  it('haben in jeder Sprache dieselben Schlüssel', () => {
    expect(keys(de).sort()).toEqual(keys(en).sort());
  });

  it('übersetzen mit Platzhaltern', async () => {
    const t = createI18n('de').t;
    expect(t('issue.state-only-in-label', { state: 'Offen' })).toBe(
      'Der Status „Offen“ steht nur in der Beschriftung, nicht als dataState.',
    );
    const tEn = createI18n('en').t;
    expect(tEn('app.save')).toBe('Save');
  });

  it('fällt bei unbekannter Sprache auf Englisch zurück', async () => {
    expect(createI18n('fr').t('app.save')).toBe('Save');
    expect(matchLanguage(['fr-FR', 'de-AT'])).toBe('de');
    expect(matchLanguage(['fr'])).toBe('en');
  });
});
