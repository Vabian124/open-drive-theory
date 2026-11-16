// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { constraintViolation, FOCUS_RULE_IDS, generate } from "../src/generator/generate.js";
import { formatSeed, hashSeed, mulberry32, parseSeed } from "../src/generator/prng.js";
import { narrateScenario } from "../src/narrator/explain.js";
import { ScenarioSchema } from "../src/schema/scenario.js";
import { loadRuleFile } from "../src/schema/loader.js";
import { solve } from "../src/solver/priority_solver.js";

const rules = loadRuleFile();

describe("seeded generator", () => {
  it("parses and formats ODT seeds", () => {
    expect(parseSeed("ODT-84920-AM")).toMatchObject({ seed: "84920", category: "AM" });
    expect(formatSeed("84920", "B")).toBe("ODT-84920-B");
    expect(() => parseSeed("CBR-1-B")).toThrow();
  });

  it("repeats the same Mulberry32 sequence for one seed", () => {
    const left = mulberry32(hashSeed("ODT-84920-B"));
    const right = mulberry32(hashSeed("ODT-84920-B"));
    expect([left(), left(), left()]).toEqual([right(), right(), right()]);
  });

  it("rebuilds the same scenario JSON from the same seed", () => {
    const first = generate("ODT-84920-B");
    const second = generate("ODT-84920-B");
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(generate("ODT-84920-A").actors.find((actor) => actor.is_candidate)?.type).toBe("motorcycle");
  });

  it("keeps each focus rule in the solved result", () => {
    for (const ruleId of FOCUS_RULE_IDS) {
      const scenario = generate("ODT-42-B", ruleId);
      const evaluation = solve(scenario, rules);
      expect(evaluation.gaps, ruleId).toEqual([]);
      expect(evaluation.applied_rule_ids, ruleId).toContain(ruleId);
      expect(constraintViolation(scenario), ruleId).toBeNull();
    }
  });

  it("does not let generator or narrator import the solver", () => {
    const generator = readFileSync("src/generator/generate.ts", "utf8");
    const narrator = readFileSync("src/narrator/explain.ts", "utf8");
    expect(generator).not.toMatch(/solver/);
    expect(narrator).not.toMatch(/solver/);
  });

  it("runs 100 seeds through generate, solve and narrate", () => {
    const rng = mulberry32(0x0d7e);
    const categories = ["B", "AM", "A"] as const;
    for (let index = 0; index < 100; index += 1) {
      const number = Math.floor(rng() * 1_000_000);
      const category = categories[Math.floor(rng() * categories.length)] ?? "B";
      const seed = formatSeed(String(number), category);
      const scenario = ScenarioSchema.parse(generate(seed));
      expect(constraintViolation(scenario), seed).toBeNull();
      const evaluation = solve(scenario, rules);
      expect(evaluation.gaps, seed).toEqual([]);
      const narration = narrateScenario(scenario, evaluation);
      expect(narration.options, seed).toHaveLength(4);
      expect(new Set(narration.options).size, seed).toBe(4);
      expect(narration.explanation.some((line) => evaluation.applied_rule_ids.some((ruleId) => line.includes(ruleId))), seed).toBe(true);
    }
  });
});
