import type { Plugin } from 'vite';

/**
 * Content Security Policy der App (OWASP ASVS 4.0.3, 14.4.3). bestbpmn lädt nichts von fremden
 * Servern; Skripte kommen nur aus dem Build. Stile bleiben inline erlaubt, weil bpmn-js und das
 * Eigenschaften-Panel Stilattribute setzen. Grafiken und Schriften dürfen data:- und blob:-URLs
 * sein (eingebettete Schrift, PNG-Export). `frame-ancestors` wirkt nur als HTTP-Header und fehlt
 * deshalb hier; die Berichte haben eine eigene, strengere Richtlinie.
 *
 * @param hashes SHA-256 (Base64) der Inline-Skripte der Seite (nur die einzelne Datei); sie werden per Hash erlaubt.
 */
export function contentSecurityPolicy(hashes: string[] = []): string {
  return [
    "default-src 'self'",
    `script-src 'self'${hashes.map((hash) => ` 'sha256-${hash}'`).join('')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/** Setzt die Richtlinie als erstes Element in `<head>`. */
export function insertPolicy(html: string, policy: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}" />`;
  const charset = /<meta charset="utf-8"\s*\/?>/i;
  if (!charset.test(html)) {
    throw new Error('Content Security Policy: <meta charset> fehlt in index.html.');
  }
  return html.replace(charset, (tag) => `${tag}\n    ${meta}`);
}

/** Web-App (mit Service Worker): Skripte nur als eigene Dateien, daher ohne Hashes. */
export function csp(): Plugin {
  return {
    name: 'bestbpmn-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => insertPolicy(html, contentSecurityPolicy()),
    },
  };
}

/** Alle Inline-Skripte einer Seite, genau wie der Browser sie für den Hash liest. */
export function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!);
}
