import { describe, expect, it } from 'vitest';
import { formatStateLabel, parseStateLabel } from '../src/index.js';

describe('parseStateLabel', () => {
  it('zerlegt Objekt und Zustand', () => {
    expect(parseStateLabel('Vorgang [Offen]')).toEqual({ object: 'Vorgang', state: 'Offen' });
    expect(parseStateLabel('  Dokument [ In Prüfung ] ')).toEqual({ object: 'Dokument', state: 'In Prüfung' });
  });

  it('liefert ohne Klammer nur das Objekt', () => {
    expect(parseStateLabel('Vorgang')).toEqual({ object: 'Vorgang' });
    expect(parseStateLabel('Vorgang []')).toEqual({ object: 'Vorgang' });
  });

  it('liefert null für leere Beschriftungen', () => {
    expect(parseStateLabel('')).toBeNull();
    expect(parseStateLabel(undefined)).toBeNull();
  });

  it('setzt die Beschriftung wieder zusammen', () => {
    expect(formatStateLabel('Vorgang', 'Offen')).toBe('Vorgang [Offen]');
    expect(formatStateLabel('Vorgang')).toBe('Vorgang');
  });
});
