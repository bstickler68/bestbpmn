import type { Plugin } from 'vite';

/** Macht Inhalt sicher für ein `<script>`- bzw. `<style>`-Element im HTML. */
export function inlineSafe(code: string, tag: 'script' | 'style'): string {
  // `</script` beendet das Element vorzeitig, `<!--` versetzt den Parser in einen Sonderzustand.
  // In JavaScript bedeuten `<\/` und `<\!--` dasselbe wie vorher; in CSS reicht das Schließen-Tag.
  const close = new RegExp(`</(${tag})`, 'gi');
  const safe = code.replace(close, '<\\/$1');
  return tag === 'script' ? safe.replace(/<!--/g, '<\\!--') : safe;
}

/**
 * Packt die App in eine einzige HTML-Datei: Skript und Stil stehen direkt in der Seite, Grafiken
 * und Schriften als data:-URL. So läuft `bestbpmn.html` per Doppelklick über `file://`, ohne Server
 * und ohne Netzwerk.
 */
export function singleFile(fileName = 'bestbpmn.html'): Plugin {
  return {
    name: 'bestbpmn-single-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const page = bundle['index.html'];
      if (!page || page.type !== 'asset') {
        this.error('index.html fehlt im Build.');
      }
      let html = String(page.source);
      for (const [name, item] of Object.entries(bundle)) {
        if (item.type === 'chunk') {
          if (!item.isEntry) {
            this.error(`Zusätzlicher Code-Teil ${name}: Für eine einzelne Datei darf es nur einen geben.`);
          }
          const tag = new RegExp(`<script\\b[^>]*\\bsrc="[^"]*${escapeRegExp(name)}"[^>]*></script>`);
          if (!tag.test(html)) {
            this.error(`Skript ${name} nicht in index.html gefunden.`);
          }
          html = html.replace(tag, () => `<script type="module">\n${inlineSafe(item.code, 'script')}\n</script>`);
          delete bundle[name];
        } else if (name.endsWith('.css')) {
          const tag = new RegExp(`<link\\b[^>]*\\bhref="[^"]*${escapeRegExp(name)}"[^>]*>`);
          html = html.replace(tag, () => `<style>\n${inlineSafe(String(item.source), 'style')}\n</style>`);
          delete bundle[name];
        }
      }
      // Was Vite nicht selbst eingebettet hat (z. B. die alte SVG-Schrift von bpmn-js mit `#bpmn`
      // im Verweis), wird hier zur data:-URL. Der Teil nach `#` bleibt erhalten.
      for (const [name, item] of Object.entries(bundle)) {
        if (item.type !== 'asset' || name === 'index.html') {
          continue;
        }
        const base = name.split('/').pop()!;
        const data = `data:${mimeType(base)};base64,${Buffer.from(item.source).toString('base64')}`;
        const reference = new RegExp(`(?:\\.{0,2}/)?(?:assets/)?${escapeRegExp(base)}(?:\\?[^)"'#\\s]*)?`, 'g');
        if (reference.test(html)) {
          html = html.replace(reference, data);
          delete bundle[name];
        }
      }
      const rest = Object.keys(bundle).filter((name) => name !== 'index.html');
      if (rest.length) {
        this.error(`Nicht eingebettete Dateien: ${rest.join(', ')}`);
      }
      page.source = html;
      page.fileName = fileName;
    },
  };
}

const MIME_TYPES: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  eot: 'application/vnd.ms-fontobject',
};

function mimeType(name: string): string {
  return MIME_TYPES[name.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream';
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
