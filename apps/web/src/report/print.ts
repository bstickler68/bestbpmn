/**
 * Druckt ein HTML-Dokument über den Druckdialog des Browsers. Dort lässt es sich auch als PDF
 * speichern („Als PDF speichern“ in Edge und Chrome, „In PDF speichern“ in Firefox).
 * Der Bericht läuft in einem unsichtbaren Rahmen, damit die App selbst unverändert bleibt.
 */
export function printHtml(html: string, title: string): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    const previousTitle = document.title;
    const done = () => {
      document.title = previousTitle;
      frame.remove();
      resolve();
    };
    frame.addEventListener('load', () => {
      const view = frame.contentWindow!;
      // Manche Browser nehmen den Titel des Fensters als Dateinamen für das PDF.
      document.title = title;
      view.addEventListener('afterprint', () => setTimeout(done, 0), { once: true });
      view.focus();
      view.print();
      // Ohne „afterprint“ (z. B. in manchen Testumgebungen) nach einer Weile aufräumen.
      setTimeout(done, 60_000);
    });
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
