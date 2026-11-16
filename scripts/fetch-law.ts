// SPDX-License-Identifier: AGPL-3.0-only
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL = "https://repository.officiele-overheidspublicaties.nl/bwb/BWBR0004825/BWBR0004825.xml";
const USER_AGENT = "open-drive-theory/0.1 (educational; statute import)";

async function main(): Promise<void> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const directory = resolve(root, "docs/law");
  await mkdir(directory, { recursive: true });
  const response = await fetch(SOURCE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Wetdownload antwoordde ${response.status}`);
  }
  const xml = await response.text();
  if (!xml.includes("BWBR0004825") || !xml.includes("<toestand")) {
    throw new Error("Het antwoord is niet de BWB-toestand van BWBR0004825.");
  }
  await writeFile(resolve(directory, "rvv_1990_bwbr0004825.xml"), xml, "utf8");
  const source = {
    identifier: "BWBR0004825",
    title: "Reglement verkeersregels en verkeerstekens 1990",
    source_url: SOURCE_URL,
    retrieved: "2026-11-16",
    format: "BWB XML",
    rights: "Officiële bekendmaking. Wettelijke regelingen vallen niet onder het auteursrecht (Auteurswet artikel 11).",
    note: "Bronbestand. Nog niet gesegmenteerd naar rules/rvv_1990.yaml. rules/rvv_1990.example.yaml blijft het voorbeeld.",
  };
  await writeFile(resolve(directory, "source.json"), `${JSON.stringify(source, null, 2)}\n`, "utf8");
}

await main();
