// SPDX-License-Identifier: AGPL-3.0-only
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderScenarioSvg } from "../src/renderer/svg_2d.js";
import { loadGoldenFile } from "../src/schema/loader.js";

function html(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const golden = loadGoldenFile();
const cards = golden.cases
  .map((item) => {
    const svg = renderScenarioSvg(item);
    return `<article><h2>${html(item.id)}</h2><p>${html(item.description)}</p>${svg}</article>`;
  })
  .join("");

const page = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8"/>
  <title>open-drive-theory preview</title>
  <style>
    body { margin: 0; font-family: sans-serif; background: #f6f3ee; color: #1c1c1c; }
    h1 { margin: 24px; font-size: 1.4rem; }
    main { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 16px; padding: 0 24px 24px; }
    article { background: #fff; border: 1px solid #ddd; padding: 12px; }
    article svg { width: 100%; height: auto; }
    h2 { font-size: 1rem; margin: 0 0 8px; }
    p { margin: 0 0 8px; }
    footer { padding: 16px 24px 32px; }
  </style>
</head>
<body>
  <h1>open-drive-theory — golden cases</h1>
  <main>${cards}</main>
  <footer>Aangedreven door open-drive-theory (AGPL-3.0-only). <a href="https://www.gnu.org/licenses/agpl-3.0.html">Licentietekst</a>. De broncode staat in deze repository.</footer>
</body>
</html>
`;

const output = resolve(root, "preview/index.html");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, page, "utf8");
console.log(output);
