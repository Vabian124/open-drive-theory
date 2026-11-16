// SPDX-License-Identifier: AGPL-3.0-only
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_URL = "https://repository.officiele-overheidspublicaties.nl/bwb/BWBR0004825/manifest.xml";
const USER_AGENT = "open-drive-theory/2.0 (educational; statute import)";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentExpression(manifest: string, today: string): { date: string; url: string } {
  const found = new Map<string, string>();
  const pattern = /(\d{4}-\d{2}-\d{2})_0\/xml\/BWBR0004825_(\d{4}-\d{2}-\d{2})_0\.xml/g;
  for (const match of manifest.matchAll(pattern)) {
    const date = match[1];
    if (date && date === match[2] && date <= today) {
      found.set(date, match[0]);
    }
  }
  const date = [...found.keys()].sort().at(-1);
  const path = date ? found.get(date) : undefined;
  if (!date || !path || date === "2002-03-30") {
    throw new Error("Het manifest wijst geen huidige toestand van BWBR0004825 aan.");
  }
  return {
    date,
    url: `https://repository.officiele-overheidspublicaties.nl/bwb/BWBR0004825/${path}`,
  };
}

async function main(): Promise<void> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const directory = resolve(root, "docs/law");
  await mkdir(directory, { recursive: true });
  const manifestResponse = await fetch(MANIFEST_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!manifestResponse.ok) {
    throw new Error(`Manifest antwoordde ${manifestResponse.status}`);
  }
  const expression = currentExpression(await manifestResponse.text(), todayIso());
  const response = await fetch(expression.url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Wetdownload antwoordde ${response.status}`);
  }
  const xml = await response.text();
  if (!xml.includes("BWBR0004825") || !xml.includes(`inwerkingtreding="${expression.date}"`)) {
    throw new Error("Het antwoord is niet de gevraagde BWB-toestand van BWBR0004825.");
  }
  if (!xml.includes("uitvaartstoeten van motorvoertuigen")) {
    throw new Error("De download mist de huidige tekst van artikel 16.");
  }
  await writeFile(resolve(directory, "rvv_1990_bwbr0004825.xml"), xml, "utf8");
  const source = {
    identifier: "BWBR0004825",
    title: "Reglement verkeersregels en verkeerstekens 1990",
    source_url: expression.url,
    citation: `https://wetten.overheid.nl/BWBR0004825/${expression.date}`,
    retrieved: todayIso(),
    toestand: expression.date,
    format: "BWB XML",
    rights: "Officiële bekendmaking. Wettelijke regelingen vallen niet onder het auteursrecht (Auteurswet artikel 11).",
    note: `Toestand g=${expression.date}. Geciteerde kaarten staan in rules/rvv_1990.yaml. rules/rvv_1990.example.yaml blijft het voorbeeldarchief.`,
  };
  await writeFile(resolve(directory, "source.json"), `${JSON.stringify(source, null, 2)}\n`, "utf8");
}

await main();
