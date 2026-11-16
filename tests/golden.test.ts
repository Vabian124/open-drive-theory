// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import { loadGoldenFile, loadRuleFile } from "../src/schema/loader.js";
import { solve } from "../src/solver/priority_solver.js";

const rules = loadRuleFile();
const golden = loadGoldenFile();

describe("golden_v1", () => {
  it("loads the six frozen cases", () => {
    expect(golden.cases).toHaveLength(6);
  });

  it.each(golden.cases.map((item) => [item.id, item] as const))("%s", (_id, item) => {
    const result = solve(item, rules);
    expect(result.gaps).toEqual([]);
    expect(result.priority_order).toEqual(item.expected.priority_order);
    expect(result.candidate_yields_to).toEqual(item.expected.candidate_yields_to);
    expect(result.applied_rule_ids).toEqual(item.expected.applied_rule_ids);
  });

  it("fails closed when an unverified officer or light rule is in play", () => {
    const base = golden.cases[0];
    if (!base) {
      throw new Error("golden file has no cases");
    }
    const withOfficer = {
      ...base,
      environment: { ...base.environment, traffic_officer: true },
    };
    const withLights = {
      ...base,
      environment: { ...base.environment, traffic_lights: "active" as const },
    };
    expect(solve(withOfficer, rules).gaps).toContain("RVV-82");
    expect(solve(withOfficer, rules).priority_order).toEqual([]);
    expect(solve(withLights, rules).gaps).toContain("RVV-64");
    expect(solve(withLights, rules).priority_order).toEqual([]);
  });
});
