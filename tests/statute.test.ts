// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateRoadPosition, generateRoundabout } from "../src/generator/generate.js";
import { narrateHazard, narratePosition, narrateScenario } from "../src/narrator/explain.js";
import { sceneNodes } from "../src/renderer/layout_3d.js";
import { withApproachMotion } from "../src/renderer/motion.js";
import { renderScenarioSvg } from "../src/renderer/svg_2d.js";
import { loadRuleFile } from "../src/schema/loader.js";
import { roadPosition } from "../src/schema/position.js";
import { ScenarioSchema, type Scenario } from "../src/schema/scenario.js";
import { solve } from "../src/solver/priority_solver.js";

const rules = loadRuleFile();

function crossing(input: {
  other?: Scenario["actors"][number]["type"];
  signs?: Scenario["static_signs"]["signs"];
  markings?: Scenario["static_signs"]["markings"];
  environment?: Partial<Scenario["environment"]>;
  candidateSignal?: Scenario["actors"][number]["signal"];
  otherSignal?: Scenario["actors"][number]["signal"];
  candidateOrder?: Scenario["actors"][number]["officer_order"];
  otherOrder?: Scenario["actors"][number]["officer_order"];
  candidateType?: Scenario["actors"][number]["type"];
  intersection?: Scenario["infra"]["intersection_type"];
  road?: Scenario["environment"]["road_condition"];
  speed?: number;
  obstructions?: Scenario["environment"]["obstructions"];
}): Scenario {
  return ScenarioSchema.parse({
    infra: {
      intersection_type: input.intersection ?? "four_way",
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
      road_condition: input.road ?? "dry",
      obstructions: input.obstructions ?? [],
      ...input.environment,
    },
    actors: [
      {
        id: "candidate",
        type: input.candidateType ?? "car",
        from_arm: "arm_0",
        to_arm: "arm_180",
        speed_kmh: input.speed ?? 30,
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

describe("BWBR0004825 toestand 2002-03-30", () => {
  it("quotes that consolidation and keeps the example archive unverified", () => {
    expect(rules.meta.version).toBe("2002-03-30");
    expect(rules.hierarchy.find((card) => card.rule_id === "RVV-64")?.verified).toBe(true);
    expect(rules.hierarchy.find((card) => card.rule_id === "RVV-82")?.verified).toBe(true);
    const example = loadRuleFile("rules/rvv_1990.example.yaml");
    expect(example.hierarchy.find((card) => card.rule_id === "RVV-64")?.verified).toBe(false);
    const yellow = rules.hierarchy.find((card) => card.rule_id === "RVV-30");
    expect(yellow?.verified).toBe(true);
    expect(yellow?.statutory_text_placeholder).toContain("geel zwaai- of knipperlicht");
  });

  it("lets a pedestrian on a crosswalk go first and withholds that duty without the marking", () => {
    const marked = solve(
      crossing({
        other: "pedestrian",
        markings: [{ arm_id: "arm_270", type: "crosswalk" }],
      }),
      rules,
    );
    expect(marked.applied_rule_ids).toEqual(["RVV-49"]);
    expect(marked.candidate_yields_to).toEqual(["other"]);
    expect(marked.priority_order).toEqual(["other", "candidate"]);

    const plain = solve(crossing({ other: "pedestrian" }), rules);
    expect(plain.gaps).toEqual([]);
    expect(plain.applied_rule_ids).toEqual([]);
    expect(plain.candidate_yields_to).toEqual([]);
  });

  it("drops the crosswalk duty for a red pedestrian light and keeps it under a general amber flash", () => {
    const red = solve(
      crossing({
        other: "pedestrian",
        otherSignal: "red",
        markings: [{ arm_id: "arm_270", type: "crosswalk" }],
      }),
      rules,
    );
    expect(red.applied_rule_ids).not.toContain("RVV-49");
    expect(red.candidate_yields_to).toEqual([]);

    const amber = solve(
      crossing({
        other: "pedestrian",
        markings: [{ arm_id: "arm_270", type: "crosswalk" }],
        environment: { traffic_lights: "flashing_amber" },
      }),
      rules,
    );
    expect(amber.gaps).toEqual([]);
    expect(amber.applied_rule_ids).toEqual(["RVV-49"]);
  });

  it("treats a funeral as pedestrians only on a crosswalk", () => {
    const onFoot = solve(
      crossing({
        other: "funeral_procession",
        markings: [{ arm_id: "arm_270", type: "crosswalk" }],
      }),
      rules,
    );
    expect(onFoot.applied_rule_ids).toEqual(["RVV-49"]);

    const onRoad = solve(crossing({ other: "funeral_procession" }), rules);
    expect(onRoad.applied_rule_ids).toEqual([]);
    expect(onRoad.candidate_yields_to).toEqual([]);
    expect(narrateScenario(crossing({ other: "funeral_procession" }), onRoad).explanation.join(" ")).not.toMatch(/RVV-16/);
  });

  it("does not let a military column yield on a crosswalk, and does not invent an order between two columns", () => {
    const column = solve(
      crossing({
        candidateType: "military_column",
        other: "pedestrian",
        markings: [{ arm_id: "arm_270", type: "crosswalk" }],
      }),
      rules,
    );
    expect(column.applied_rule_ids).toEqual(["RVV-16"]);
    expect(column.candidate_yields_to).toEqual([]);
    expect(column.priority_order).toEqual(["candidate", "other"]);

    const pair = solve(
      crossing({
        candidateType: "military_column",
        other: "military_column",
      }),
      rules,
    );
    expect(pair.gaps).toEqual(["RVV-16-two"]);
    expect(pair.priority_order).toEqual([]);
  });

  it("lets every road user yield to a priority vehicle, including one facing a priority road", () => {
    const signed = solve(
      crossing({
        other: "emergency",
        signs: [{ arm_id: "arm_0", code: "NL:B1" }],
      }),
      rules,
    );
    expect(signed.applied_rule_ids).toEqual(["RVV-50"]);
    expect(signed.candidate_yields_to).toEqual(["other"]);
    expect(renderScenarioSvg(crossing({ other: "emergency" }))).toContain('data-cue="blue-beacon"');

    const both = solve(crossing({ candidateType: "emergency", other: "emergency" }), rules);
    expect(both.gaps).toEqual(["RVV-50-two"]);
    expect(both.priority_order).toEqual([]);
  });

  it("keeps a column ahead of ordinary drivers even when the column has a yield sign", () => {
    const result = solve(
      crossing({
        other: "military_column",
        signs: [{ arm_id: "arm_270", code: "NL:B6" }],
        markings: [{ arm_id: "arm_270", type: "give_way_triangles" }],
      }),
      rules,
    );
    expect(result.applied_rule_ids).toEqual(["RVV-16"]);
    expect(result.candidate_yields_to).toEqual(["other"]);
    expect(renderScenarioSvg(crossing({ other: "military_column" }))).toContain('data-cue="military-column"');
  });

  it("gaps active lights and an officer until a colour or gesture exists, then applies that colour or gesture", () => {
    expect(solve(crossing({ environment: { traffic_lights: "active" } }), rules).gaps).toContain("RVV-64");
    expect(solve(crossing({ environment: { traffic_officer: true } }), rules).gaps).toEqual(["RVV-82"]);

    const green = crossing({
      environment: { traffic_lights: "active" },
      candidateSignal: "green",
      otherSignal: "red",
      signs: [{ arm_id: "arm_270", code: "NL:B6" }],
    });
    const lit = solve(green, rules);
    expect(lit.gaps).toEqual([]);
    expect(lit.applied_rule_ids).toEqual(["RVV-68"]);
    expect(lit.candidate_yields_to).toEqual([]);
    expect(renderScenarioSvg(green)).toContain('data-signal="green"');

    const bothGreen = solve(
      crossing({
        environment: { traffic_lights: "active" },
        candidateSignal: "green",
        otherSignal: "green",
        signs: [{ arm_id: "arm_0", code: "NL:B6" }],
        markings: [{ arm_id: "arm_0", type: "give_way_triangles" }],
      }),
      rules,
    );
    expect(bothGreen.applied_rule_ids).toEqual(["RVV-15.1"]);
    expect(bothGreen.candidate_yields_to).toEqual(["other"]);

    expect(
      solve(
        crossing({
          environment: { traffic_lights: "active" },
          candidateSignal: "red",
          otherSignal: "red",
        }),
        rules,
      ).gaps,
    ).toEqual(["RVV-68-both-stop"]);

    const gestured = solve(
      crossing({
        environment: { traffic_officer: true },
        candidateOrder: "go",
        otherOrder: "stop",
      }),
      rules,
    );
    expect(gestured.applied_rule_ids).toEqual(["RVV-82"]);
    expect(gestured.candidate_yields_to).toEqual([]);

    const bothGo = solve(
      crossing({
        environment: { traffic_officer: true },
        candidateOrder: "go",
        otherOrder: "go",
      }),
      rules,
    );
    expect(bothGo.applied_rule_ids).toEqual(["RVV-15.1"]);
  });

  it("leaves flashing amber to the signs and does not treat it as a priority light", () => {
    const result = solve(
      crossing({
        environment: { traffic_lights: "flashing_amber" },
        signs: [{ arm_id: "arm_0", code: "NL:B6" }],
        markings: [{ arm_id: "arm_0", type: "give_way_triangles" }],
      }),
      rules,
    );
    expect(result.gaps).toEqual([]);
    expect(result.applied_rule_ids).toEqual(["RVV-SIGNS-B1-B7"]);
  });

  it("anchors moped and motorcycle position in articles 6, 3 and 10", () => {
    const g12a = generateRoadPosition("ODT-6-AM", "g12a");
    const g11 = generateRoadPosition("ODT-6-AM", "g11");
    const motorcycle = generateRoadPosition("ODT-6-A", "motorcycle");
    expect(roadPosition(g12a)?.text).toContain("fiets/bromfietspad");
    expect(roadPosition(g12a)?.ruleIds).toEqual(["RVV-6"]);
    expect(roadPosition(g11)?.text).toContain("rijbaan");
    expect(roadPosition(g11)?.text).toContain("G11");
    expect(roadPosition(motorcycle)?.ruleIds).toEqual(["RVV-3", "RVV-10"]);
    expect(roadPosition(generateRoadPosition("ODT-6-B", "g11"))).toBeNull();
    const asked = narratePosition(g12a);
    expect(asked?.options).toHaveLength(4);
    expect(asked?.explanation[0]).toContain("RVV-6");
    expect(renderScenarioSvg(g12a)).toContain('data-sign="NL:G12a"');
    expect(renderScenarioSvg(motorcycle)).toContain('data-cycleway="track"');
  });

  it("uses a yield sign on a roundabout and keeps articles 47 and 48 out of the order", () => {
    const scenario = generateRoundabout("ODT-47-B");
    const result = solve(scenario, rules);
    expect(scenario.infra.intersection_type).toBe("roundabout");
    expect(result.applied_rule_ids).toEqual(["RVV-SIGNS-B1-B7"]);
    expect(result.candidate_yields_to).toEqual(["actor_car"]);
    const told = narrateScenario(scenario, result).explanation.join(" ");
    expect(told).toContain("RVV-47 en RVV-48");
    expect(told).toContain("geen voorrang");
    const drawing = renderScenarioSvg(scenario);
    expect(drawing).toContain('data-roundabout="true"');
    expect(drawing).toContain('data-marking="give_way_triangles"');
    expect(sceneNodes(scenario).some((node) => node.kind === "roundabout")).toBe(true);
  });

  it("asks the stopping-distance exercise from article 19 and animates it for five seconds", () => {
    const icy = crossing({ road: "icy", speed: 50 });
    const lesson = narrateHazard(icy);
    expect(lesson?.question).toContain("artikel 19");
    expect(lesson?.explanation.join(" ")).toContain("RVV-19");
    expect(lesson?.options[lesson.correctIndex]).toContain("stoppen");
    expect(narrateHazard(crossing({ road: "dry", speed: 30 }))).toBeNull();
    const blocked = narrateHazard(crossing({ obstructions: [{ type: "parked_truck", near_arm: "arm_0" }] }));
    expect(blocked).not.toBeNull();
    const moving = withApproachMotion(renderScenarioSvg(icy));
    expect(moving).toContain('data-hazard-seconds="5"');
    expect(moving).toContain("5s");
    expect(moving).toContain("prefers-reduced-motion");
  });

  it("prepares the source link without publishing the repository", () => {
    const source = readFileSync(new URL("../src/web/source.ts", import.meta.url), "utf8");
    const element = readFileSync(new URL("../src/web/quiz-element.ts", import.meta.url), "utf8");
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      repository: { url: string };
    };
    expect(source).toContain("https://github.com/Vabian124/open-drive-theory");
    expect(source).not.toContain("PLACEHOLDER");
    expect(manifest.repository.url).toBe("https://github.com/Vabian124/open-drive-theory.git");
    expect(element).toContain("3D-aanzicht");
    expect(element).toContain("Gevaarherkenning");
    expect(element).toContain('import("./mount_3d.js")');
  });
});
