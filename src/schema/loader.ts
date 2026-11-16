// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { GoldenFileSchema, type GoldenFile } from "./scenario.js";
import { RuleFileSchema, type RuleFile } from "./rules.js";

function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

function readYaml(filePath: string): unknown {
  return parse(readFileSync(filePath, "utf8"));
}

export function loadRuleFile(filePath = resolve(repoRoot(), "rules/rvv_1990.yaml")): RuleFile {
  return RuleFileSchema.parse(readYaml(filePath));
}

export function loadGoldenFile(filePath = resolve(repoRoot(), "cases/golden_v1.yaml")): GoldenFile {
  return GoldenFileSchema.parse(readYaml(filePath));
}
