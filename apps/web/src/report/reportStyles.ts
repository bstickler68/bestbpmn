/**
 * Stil der Berichte, fest in die HTML-Datei eingebettet: Die Datei soll auch ohne bestbpmn lesbar sein.
 * Für den Druck (PDF) gilt A4; Grafik und Elementtabelle stehen auf Querformat-Seiten.
 * Schriften: Systemschriften, die unter Windows vorhanden sind (Segoe UI, Arial).
 */
export const REPORT_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body.report { margin: 0 auto; max-width: 1100px; padding: 24px 32px 48px; font: 10.5pt/1.45 "Segoe UI", system-ui, Arial, sans-serif; color: #1f2328; background: #fff; }
.report-head { border-bottom: 2px solid #0969da; margin-bottom: 18px; padding-bottom: 8px; }
.report-kind { margin: 0; color: #0969da; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; font-size: 9pt; }
h1 { margin: 2px 0 4px; font-size: 20pt; line-height: 1.2; }
.report-meta { margin: 0; color: #57606a; font-size: 9pt; }
h2 { font-size: 13pt; margin: 22px 0 8px; padding-bottom: 3px; border-bottom: 1px solid #d0d7de; break-after: avoid; }
h3 { font-size: 11pt; margin: 16px 0 6px; break-after: avoid; }
h4 { font-size: 10pt; margin: 12px 0 4px; color: #57606a; break-after: avoid; }
p { margin: 0 0 6px; }
ul { margin: 0; padding-left: 18px; }
a { color: #0969da; }
code { font-family: Consolas, "Cascadia Mono", monospace; font-size: 9pt; }
.none { color: #57606a; }
.kind, .state { color: #57606a; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 28px; }
.grid section { break-inside: avoid; }
.entries li { margin-bottom: 6px; }
.entries li p { margin: 2px 0 0; color: #3d444d; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #d0d7de; padding: 4px 6px; vertical-align: top; text-align: left; }
thead th { background: #f6f8fa; font-weight: 600; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
.resources-table th, .info-table th { width: 22%; background: #f6f8fa; font-weight: 600; }
.resources-table ul, td ul { padding-left: 16px; }
.diagram { border: 1px solid #d0d7de; padding: 8px; text-align: center; }
.diagram svg { max-width: 100%; height: auto; max-height: 160mm; }
table.elements { font-size: 9pt; }
table.elements .number { white-space: nowrap; font-weight: 600; }
table.elements .name { font-weight: 600; }
table.elements .col-number { width: 4%; }
table.elements .col-type, table.elements .col-kind { width: 10%; }
table.elements .col-name { width: 15%; }
table.elements .col-systems { width: 11%; }
table.elements .col-links { width: 15%; }
table.elements tr.depth-1 td:first-child { padding-left: 14px; }
table.elements tr.depth-2 td:first-child { padding-left: 22px; }
table.elements tr.depth-3 td:first-child { padding-left: 30px; }
table.elements td p { margin: 0 0 4px; }
ul.next { list-style: none; padding: 0; margin: 4px 0 0; color: #0550ae; font-style: italic; }
ul.next li::before { content: "→ "; }
table.status { width: auto; min-width: 50%; }
table.status .number { text-align: right; }
table.raci { width: auto; font-size: 9pt; }
table.raci th, table.raci td { text-align: center; }
table.raci thead th { writing-mode: vertical-rl; transform: rotate(180deg); font-weight: 400; white-space: nowrap; }
table.raci thead th:first-child, table.raci tbody th { writing-mode: horizontal-tb; transform: none; text-align: left; font-weight: 600; }
table.raci td { font-weight: 600; min-width: 20px; }
table.raci td.from-lane { font-style: italic; color: #57606a; }
.raci-legend { color: #57606a; font-size: 9pt; margin-top: 4px; }
.issues li.error { color: #cf222e; }
.issues li.warning { color: #9a6700; }
.ok { color: #1a7f37; }

@page { size: A4; margin: 16mm 14mm 18mm; @bottom-right { content: counter(page) " / " counter(pages); font: 8pt "Segoe UI", Arial, sans-serif; color: #57606a; } }
@page landscape { size: A4 landscape; }
@media print {
  body.report { max-width: none; padding: 0; font-size: 10pt; }
  .graphic, .elements-section { page: landscape; }
  .graphic { break-before: page; }
  .diagram { border: 0; padding: 0; }
  .diagram svg { max-height: 165mm; }
  a { color: inherit; text-decoration: none; }
}
`;
