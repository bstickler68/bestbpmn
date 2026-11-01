import { describe, expect, it } from 'vitest';
import { inlineSafe } from '../build/singleFile';

describe('Einbetten in die einzelne HTML-Datei', () => {
  it('lässt kein Element vorzeitig enden', () => {
    const code = 'const a = "</script>"; const b = "<!-- x -->"; const c = "</SCRIPT >";';
    const safe = inlineSafe(code, 'script');
    expect(safe).not.toMatch(/<\/script/i);
    expect(safe).not.toContain('<!--');
    // Gleicher Wert in JavaScript.
    expect(new Function(`${safe}; return [a, b, c];`)()).toEqual(['</script>', '<!-- x -->', '</SCRIPT >']);
  });

  it('schützt das Ende des Stil-Elements', () => {
    expect(inlineSafe('a::after { content: "</style>" }', 'style')).toBe('a::after { content: "<\\/style>" }');
  });
});
