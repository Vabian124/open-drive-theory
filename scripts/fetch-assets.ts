// SPDX-License-Identifier: AGPL-3.0-only
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SIGN_CODES = ["B1", "B3", "B4", "B5", "B6", "B7", "G11", "G12a"] as const;

function normalizeSvg(raw: string): string {
  const withoutDecl = raw.replace(/<\?xml[^?]*\?>/g, "").trim();
  const viewBoxMatch = withoutDecl.match(/viewBox\s*=\s*"([^"]+)"/i);
  let minX = 0;
  let minY = 0;
  let width = 100;
  let height = 100;
  if (viewBoxMatch?.[1]) {
    const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
    const boxX = parts[0];
    const boxY = parts[1];
    const boxWidth = parts[2];
    const boxHeight = parts[3];
    if (
      parts.length === 4 &&
      boxX !== undefined &&
      boxY !== undefined &&
      boxWidth !== undefined &&
      boxHeight !== undefined &&
      [boxX, boxY, boxWidth, boxHeight].every((part) => Number.isFinite(part)) &&
      boxWidth > 0 &&
      boxHeight > 0
    ) {
      minX = boxX;
      minY = boxY;
      width = boxWidth;
      height = boxHeight;
    }
  }
  const inner = withoutDecl.replace(/^<svg[^>]*>/i, "").replace(/<\/svg>\s*$/i, "");
  const scale = 84 / Math.max(width, height);
  const translateX = 50 - (minX + width / 2) * scale;
  const translateY = 50 - (minY + height / 2) * scale;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">`,
    `<g transform="translate(${translateX.toFixed(3)} ${translateY.toFixed(3)}) scale(${scale.toFixed(5)})">`,
    inner,
    `</g>`,
    `</svg>`,
    ``,
  ].join("\n");
}

async function main(): Promise<void> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const directory = resolve(root, "assets");
  await mkdir(directory, { recursive: true });
  for (const code of SIGN_CODES) {
    const fileName = `Nederlands_verkeersbord_${code}.svg`;
    const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download mislukt voor ${fileName}: ${response.status}`);
    }
    const raw = await response.text();
    if (!raw.includes("<svg")) {
      throw new Error(`Geen SVG ontvangen voor ${fileName}`);
    }
    await writeFile(resolve(directory, fileName), normalizeSvg(raw), "utf8");
  }
}

await main();
