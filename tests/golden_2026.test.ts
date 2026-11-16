// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import { narrateScenario, narrateSpeed } from "../src/narrator/explain.js";
import { renderScenarioSvg } from "../src/renderer/svg_2d.js";
import { loadRuleFile } from "../src/schema/loader.js";
import { ScenarioSchema, type Scenario } from "../src/schema/scenario.js";
import { mopedSpeedLimit } from "../src/schema/speed.js";
import { solve } from "../src/solver/priority_solver.js";

const rules = loadRuleFile();

function scene(input: {
  candidate?: Scenario["actors"][number]["type"];
  other?: Scenario["actors"][number]["type"];
  signs?: Scenario["static_signs"]["signs"];
  markings?: Scenario["static_signs"]["markings"];
  environment?: Partial<Scenario["environment"]>;
  candidateSignal?: Scenario["actors"][number]["signal"];
  otherSignal?: Scenario["actors"][number]["signal"];
  candidateOrder?: Scenario["actors"][number]["officer_order"];
  otherOrder?: Scenario["actors"][number]["officer_order"];
}): Scenario {
  return ScenarioSchema.parse({
    infra: {
      intersection_type: "four_way",
      arms: [0, 90, 180, 270].map((angle) => ({
        arm_id: `arm_${angle}`,
        angle_deg: angle,
        surface: "paved",
        curb_type: "standard",
        cycleway: "none",
      })),
      connectors: [
        { from_arm: "arm_0", to_arm: "arm_180", turn: "straight" },
        { from_arm: "arm_270", to_arm: "arm_90", turn: "straight" },
      ],
    },
    static_signs: { signs: input.signs ?? [], markings: input.markings ?? [] },
    environment: {
      traffic_officer: false,
      traffic_lights: "none",
      built_up_area: true,
      road_condition: "dry",
      obstructions: [],
      ...input.environment,
    },
    actors: [
      {
        id: "candidate",
        type: input.candidate ?? "car",
        from_arm: "arm_0",
        to_arm: "arm_180",
        speed_kmh: 30,
        is_candidate: true,
        signal: input.candidateSignal,
        officer_order: input.candidateOrder,
      },
      {
        id: "other",
        type: input.other ?? "car",
        from_arm: "arm_270",
        to_arm: "arm_90",
        speed_kmh: 30,
        is_candidate: false,
        signal: input.otherSignal,
        officer_order: input.otherOrder,
      },
    ],
  });
}

describe("golden 2026-07-01", () => {
  it("does not let traffic cut a flagged motor funeral unless a higher duty says so", () => {
    const card = rules.hierarchy.find((item) => item.rule_id === "RVV-16");
    expect(card?.statutory_text_placeholder).toContain("uitvaartstoeten van motorvoertuigen");
    expect(card?.statutory_text_placeholder).toContain("artikel 30c");
    expect(card?.statutory_text_placeholder.toLowerCase()).not.toContain("vlag");

    const open = scene({ other: "funeral_procession" });
    const equal = solve(open, rules);
    expect(equal.gaps).toEqual([]);
    expect(equal.applied_rule_ids).toEqual(["RVV-16"]);
    expect(equal.candidate_yields_to).toEqual(["other"]);
    expect(equal.priority_order).toEqual(["other", "candidate"]);
    expect(narrateScenario(open, equal).explanation.join(" ")).toContain("uitvaartstoet");
    expect(renderScenarioSvg(open)).toContain('data-cue="funeral-procession"');

    const signed = solve(
      scene({
        other: "funeral_procession",
        signs: [{ arm_id: "arm_270", code: "NL:B6" }],
        markings: [{ arm_id: "arm_270", type: "give_way_triangles" }],
      }),
      rules,
    );
    expect(signed.applied_rule_ids).toEqual(["RVV-SIGNS-B1-B7"]);
    expect(signed.candidate_yields_to).toEqual([]);
    expect(signed.priority_order).toEqual(["candidate", "other"]);

    const ownSign = solve(
      scene({
        other: "funeral_procession",
        signs: [{ arm_id: "arm_0", code: "NL:B6" }],
        markings: [{ arm_id: "arm_0", type: "give_way_triangles" }],
      }),
      rules,
    );
    expect(ownSign.applied_rule_ids).toEqual(["RVV-SIGNS-B1-B7"]);
    expect(ownSign.candidate_yields_to).toEqual(["other"]);

    const officer = solve(
      scene({
        other: "funeral_procession",
        environment: { traffic_officer: true },
        candidateOrder: "go",
        otherOrder: "stop",
      }),
      rules,
    );
    expect(officer.applied_rule_ids).toEqual(["RVV-82"]);
    expect(officer.candidate_yields_to).toEqual([]);

    const lights = solve(
      scene({
        other: "funeral_procession",
        environment: { traffic_lights: "active" },
        candidateSignal: "green",
        otherSignal: "red",
      }),
      rules,
    );
    expect(lights.applied_rule_ids).toEqual(["RVV-68"]);
    expect(lights.candidate_yields_to).toEqual([]);

    const emergency = solve(scene({ candidate: "funeral_procession", other: "emergency" }), rules);
    expect(emergency.applied_rule_ids).toEqual(["RVV-50"]);
    expect(emergency.candidate_yields_to).toEqual(["other"]);

    expect(solve(scene({ candidate: "funeral_procession", other: "funeral_procession" }), rules).gaps).toEqual([
      "RVV-16-two-funerals",
    ]);
    expect(solve(scene({ candidate: "military_column", other: "funeral_procession" }), rules).gaps).toEqual([
      "RVV-16-unranked",
    ]);
    const columnSign = solve(
      scene({
        candidate: "military_column",
        other: "funeral_procession",
        signs: [{ arm_id: "arm_270", code: "NL:B6" }],
        markings: [{ arm_id: "arm_270", type: "give_way_triangles" }],
      }),
      rules,
    );
    expect(columnSign.applied_rule_ids).toEqual(["RVV-SIGNS-B1-B7"]);
    expect(columnSign.candidate_yields_to).toEqual([]);
  });

  it("uses the current moped speed limits on the carriageway and on G12a", () => {
    const inside = rules.hierarchy.find((item) => item.rule_id === "RVV-20");
    const outside = rules.hierarchy.find((item) => item.rule_id === "RVV-21");
    expect(inside?.statutory_text_placeholder).toContain("30 km per uur");
    expect(inside?.statutory_text_placeholder).toContain("45 km per uur");
    expect(outside?.statutory_text_placeholder).toContain("40 km per uur");
    expect(outside?.statutory_text_placeholder).toContain("45 km per uur");

    const roadIn = scene({ candidate: "moped" });
    const roadOut = scene({ candidate: "moped", environment: { built_up_area: false } });
    const pathIn = scene({ candidate: "moped", signs: [{ arm_id: "arm_0", code: "NL:G12a" }] });
    const pathOut = scene({
      candidate: "moped",
      signs: [{ arm_id: "arm_0", code: "NL:G12a" }],
      environment: { built_up_area: false },
    });
    const cycleLane = scene({ candidate: "moped", signs: [{ arm_id: "arm_0", code: "NL:G11" }] });

    expect(mopedSpeedLimit(roadIn)).toMatchObject({ ruleId: "RVV-20", kmh: 45 });
    expect(mopedSpeedLimit(roadOut)).toMatchObject({ ruleId: "RVV-21", kmh: 45 });
    expect(mopedSpeedLimit(pathIn)).toMatchObject({ ruleId: "RVV-20", kmh: 30 });
    expect(mopedSpeedLimit(pathOut)).toMatchObject({ ruleId: "RVV-21", kmh: 40 });
    expect(mopedSpeedLimit(cycleLane)).toMatchObject({ ruleId: "RVV-20", kmh: 45 });
    expect(mopedSpeedLimit(scene({ candidate: "car", signs: [{ arm_id: "arm_0", code: "NL:G12a" }] }))).toBeNull();

    const asked = narrateSpeed(pathIn);
    expect(asked?.explanation[0]).toContain("RVV-20");
    expect(asked?.options[asked.correctIndex]).toContain("30 km per uur");
    expect(solve(roadIn, rules).applied_rule_ids).not.toContain("RVV-20");
  });
});
