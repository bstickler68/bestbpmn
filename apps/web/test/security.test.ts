import { afterEach, describe, expect, it } from 'vitest';
import Modeler from 'bpmn-js/lib/Modeler';
import { createI18n } from '@bestbpmn/i18n';
import { bestbpmnModdleExtensions, bestbpmnModule, type StatusCheck } from '@bestbpmn/bpmn-js-extension';
import template from '../../../templates/processes/dokumentenfreigabe.bpmn?raw';
import { contentSecurityPolicy, inlineScripts, insertPolicy } from '../build/csp';
import { FileTooLargeError, MAX_FILE_BYTES, readText } from '../src/files/limits';
import { printHtml } from '../src/report/print';
import { fullHtml, profileHtml, REPORT_CSP, staffingHtml, type ReportInput } from '../src/report/report';

/**
 * Sicherheitsprüfungen nach OWASP ASVS 4.0.3, Level 2 (siehe docs/sicherheit.md):
 * Ausgabe-Maskierung in Berichten, Content Security Policy, Druckrahmen ohne Skripte, Größengrenze.
 */
const t = createI18n('de').t;
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

/** Markup, das im Bericht nur als Text erscheinen darf. */
const PAYLOAD = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>"'`;
const xmlAttr = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xmlText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Die Vorlage mit Markup in allen Namen, Beschreibungen, Rollen und Links. */
const hostile = template
  .replace(/ name="([^"]*)"/g, (_m, name: string) => ` name="${name}${xmlAttr(PAYLOAD)}"`)
  .replace(/(<bpmn:documentation[^>]*>)/g, `$1${xmlText(PAYLOAD)}`)
  .replace(/group\(authors\)/g, `group(${xmlText(PAYLOAD)})`)
  .replace('https://example.org/wiki/dokumentvorlagen', 'javascript:window.__xss=3');

/** Kein Element und kein Attribut aus dem Modell darf als Markup wirken. */
function expectInert(html: string) {
  const doc = parse(html);
  expect(doc.querySelectorAll('script, img, iframe, object, embed, form, base')).toHaveLength(0);
  const handlers = [...doc.querySelectorAll('*')].flatMap((el) => [...el.attributes].filter((a) => /^on/i.test(a.name)));
  expect(handlers).toEqual([]);
  expect([...doc.querySelectorAll('a')].filter((a) => !/^(https?:|mailto:)/i.test(a.getAttribute('href') ?? ''))).toEqual([]);
  // Die Richtlinie steht direkt nach dem Zeichensatz, also vor allem Inhalt aus dem Modell.
  const policy = doc.head.querySelector('meta[http-equiv="Content-Security-Policy"]');
  expect(policy?.getAttribute('content')).toBe(REPORT_CSP);
  expect(doc.head.firstElementChild!.nextElementSibling).toBe(policy);
}

let container: HTMLElement | undefined;
afterEach(() => {
  container?.remove();
  container = undefined;
  delete (window as { __xss?: number }).__xss;
});

async function hostileInput(): Promise<ReportInput> {
  container = document.createElement('div');
  container.style.cssText = 'width:1000px;height:600px';
  document.body.appendChild(container);
  const modeler: any = new Modeler({ container, additionalModules: [bestbpmnModule], moddleExtensions: bestbpmnModdleExtensions });
  await modeler.importXML(hostile);
  return {
    t,
    language: 'de',
    definitions: modeler.getDefinitions(),
    fileName: `${PAYLOAD}.bpmn`,
    svg: (await modeler.saveSVG()).svg,
    statusModels: (modeler.get('bestbpmnStatusCheck') as StatusCheck).getModels(),
  };
}

describe('Berichte maskieren alles aus dem Modell (ASVS 5.3.3)', () => {
  it('Steckbrief, Gesamtdokument samt Grafik und Personalbedarf', async () => {
    const input = await hostileInput();
    for (const html of [profileHtml(input), fullHtml(input), staffingHtml(input)]) {
      expectInert(html);
    }
    const full = parse(fullHtml(input));
    // Der Text ist da, nur eben als Text.
    expect(full.body.textContent).toContain('<img src=x onerror=');
    expect(full.querySelector('.diagram svg')).not.toBeNull();
    expect(full.querySelector('.diagram')!.textContent).toContain('<script>');
    expect((window as { __xss?: number }).__xss).toBeUndefined();
  });
});

describe('Drucken (ASVS 14.4.3)', () => {
  it('führt im Druckrahmen kein Skript aus', async () => {
    let sandbox: string | null = null;
    const observer = new MutationObserver(() => {
      sandbox ??= document.querySelector('iframe')?.getAttribute('sandbox') ?? null;
    });
    observer.observe(document.body, { childList: true });
    // Bewusst ohne Richtlinie im Dokument: Der Rahmen allein muss das Skript schon aufhalten.
    await printHtml('<!doctype html><title>x</title><script>parent.__xss = 1</script><img src="data:," onerror="parent.__xss = 2">', 'x');
    observer.disconnect();
    expect(sandbox).toBe('allow-same-origin allow-modals');
    expect((window as { __xss?: number }).__xss).toBeUndefined();
  });
});

describe('Content Security Policy der App (ASVS 14.4.3)', () => {
  it('erlaubt Skripte nur aus dem Build oder per Hash', async () => {
    const policy = contentSecurityPolicy();
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/);
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");

    const html = '<!doctype html><html><head><meta charset="utf-8" /><title>x</title></head><body><script type="module">\nconsole.log(1)\n</script></body></html>';
    const scripts = inlineScripts(html);
    expect(scripts).toEqual(['\nconsole.log(1)\n']);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(scripts[0]));
    const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
    const withPolicy = insertPolicy(html, contentSecurityPolicy([hash]));
    expect(withPolicy).toContain(`script-src 'self' 'sha256-${hash}'`);
    expect(parse(withPolicy).head.children[1]!.getAttribute('http-equiv')).toBe('Content-Security-Policy');
    expect(() => insertPolicy('<html><head></head></html>', policy)).toThrow();
  });
});

describe('Größengrenze beim Lesen von Dateien (ASVS 12.1.1)', () => {
  it('liest kleine Dateien und weist zu große ab', async () => {
    expect(await readText(new Blob(['<xml/>']))).toBe('<xml/>');
    await expect(readText(new Blob(['x'.repeat(11)]), 10)).rejects.toBeInstanceOf(FileTooLargeError);
    expect(new FileTooLargeError(MAX_FILE_BYTES + 1).message).toBe('21 MB > 20 MB');
  });
});
