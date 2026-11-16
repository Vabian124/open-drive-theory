// SPDX-License-Identifier: AGPL-3.0-only
import { pathsInteract } from "../schema/geometry.js";
import {
  ScenarioSchema,
  type Actor,
  type Arm,
  type Category,
  type Scenario,
} from "../schema/scenario.js";
import { hashSeed, mulberry32, parseSeed } from "./prng.js";

const PRIORITY_CODES = new Set(["NL:B1", "NL:B3", "NL:B4", "NL:B5", "NL:B6", "NL:B7"]);

type Turn = "straight" | "right" | "left";
type ActorType = Actor["type"];
type Surface = Arm["surface"];
type Curb = Arm["curb_type"];
type Cycleway = Arm["cycleway"];

interface Blueprint {
  ruleId: string;
  intersectionType: Scenario["infra"]["intersection_type"];
  arms: Array<{ angle: number; surface: Surface; curb: Curb; cycleway: Cycleway }>;
  signs: Array<{ angle: number; code: "NL:B1" | "NL:B6" | "NL:B7" }>;
  markings: Array<{ angle: number; type: "give_way_triangles" }>;
  candidate: { from: number; to: number; turn: Turn };
  other: { from: number; to: number; turn: Turn; types: readonly ActorType[] };
}

const VARY_DRIVERS = ["car", "motorcycle", "moped", "cyclist"] as const;

/** Layouts whose geometry keeps one verified rule in force after rotation. */
const BLUEPRINTS: readonly Blueprint[] = [
  {
    ruleId: "RVV-15.1",
    intersectionType: "four_way",
    arms: [0, 90, 180, 270].map((angle) => ({ angle, surface: "paved", curb: "standard", cycleway: "none" })),
    signs: [],
    markings: [],
    candidate: { from: 0, to: 180, turn: "straight" },
    other: { from: 270, to: 90, turn: "straight", types: VARY_DRIVERS },
  },
  {
    ruleId: "RVV-15.2a",
    intersectionType: "four_way",
    arms: [0, 90, 180, 270].map((angle) => ({
      angle,
      surface: angle === 270 ? "unpaved" : "paved",
      curb: "standard",
      cycleway: "none",
    })),
    signs: [],
    markings: [],
    candidate: { from: 0, to: 180, turn: "straight" },
    other: { from: 270, to: 90, turn: "straight", types: VARY_DRIVERS },
  },
  {
    ruleId: "RVV-15.2b",
    intersectionType: "four_way",
    arms: [0, 90, 180, 270].map((angle) => ({ angle, surface: "paved", curb: "standard", cycleway: "none" })),
    signs: [],
    markings: [],
    candidate: { from: 0, to: 180, turn: "straight" },
    other: { from: 90, to: 270, turn: "straight", types: ["tram"] },
  },
  {
    ruleId: "RVV-18.1",
    intersectionType: "t_junction",
    arms: [
      { angle: 0, surface: "paved", curb: "standard", cycleway: "lane" },
      { angle: 180, surface: "paved", curb: "standard", cycleway: "lane" },
      { angle: 270, surface: "paved", curb: "standard", cycleway: "none" },
    ],
    signs: [],
    markings: [],
    candidate: { from: 0, to: 270, turn: "right" },
    other: { from: 0, to: 180, turn: "straight", types: ["cyclist"] },
  },
  {
    ruleId: "RVV-18.2",
    intersectionType: "four_way",
    arms: [0, 90, 180, 270].map((angle) => ({ angle, surface: "paved", curb: "standard", cycleway: "none" })),
    signs: [],
    markings: [],
    candidate: { from: 0, to: 90, turn: "left" },
    other: { from: 180, to: 90, turn: "right", types: VARY_DRIVERS },
  },
  {
    ruleId: "RVV-54",
    intersectionType: "exit_construction",
    arms: [0, 90, 180, 270].map((angle) => ({
      angle,
      surface: "paved",
      curb: angle === 0 ? "beveled" : "standard",
      cycleway: "none",
    })),
    signs: [],
    markings: [],
    candidate: { from: 0, to: 180, turn: "straight" },
    other: { from: 270, to: 90, turn: "straight", types: VARY_DRIVERS },
  },
  {
    ruleId: "RVV-SIGNS-B1-B7",
    intersectionType: "four_way",
    arms: [0, 90, 180, 270].map((angle) => ({ angle, surface: "paved", curb: "standard", cycleway: "none" })),
    signs: [
      { angle: 0, code: "NL:B1" },
      { angle: 180, code: "NL:B1" },
      { angle: 90, code: "NL:B6" },
      { angle: 270, code: "NL:B6" },
    ],
    markings: [
      { angle: 90, type: "give_way_triangles" },
      { angle: 270, type: "give_way_triangles" },
    ],
    candidate: { from: 0, to: 180, turn: "straight" },
    other: { from: 90, to: 270, turn: "straight", types: ["car", "tram", "cyclist", "moped"] },
  },
];

export const FOCUS_RULE_IDS: readonly string[] = BLUEPRINTS.map((blueprint) => blueprint.ruleId);

const CANDIDATE_TYPE: Record<Category, ActorType> = {
  B: "car",
  AM: "moped",
  A: "motorcycle",
};

function pick<T>(rng: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) {
    throw new Error("Kan niet kiezen uit een lege lijst.");
  }
  return item;
}

function candidateHasConflict(scenario: Scenario): boolean {
  const candidate = scenario.actors.find((actor) => actor.is_candidate);
  if (!candidate) {
    return false;
  }
  const arms = new Map(scenario.infra.arms.map((arm) => [arm.arm_id, arm]));
  return scenario.actors.some((actor) => actor.id !== candidate.id && pathsInteract(candidate, actor, arms));
}

/** Rejects combinations the verified rule cards cannot answer, and exits without a conflict. */
export function constraintViolation(scenario: Scenario): string | null {
  if (scenario.environment.traffic_officer) {
    return "traffic_officer";
  }
  if (scenario.environment.traffic_lights !== "none") {
    return "traffic_lights";
  }
  const beveled = scenario.infra.arms.some((arm) => arm.curb_type === "beveled");
  const prioritySign = scenario.static_signs.signs.some((sign) => PRIORITY_CODES.has(sign.code));
  const teethAnywhere = scenario.static_signs.markings.some((marking) => marking.type === "give_way_triangles");
  if (beveled && (prioritySign || teethAnywhere)) {
    return "beveled-with-priority";
  }
  for (const arm of scenario.infra.arms) {
    const hasB1 = scenario.static_signs.signs.some((sign) => sign.arm_id === arm.arm_id && sign.code === "NL:B1");
    const hasTeeth = scenario.static_signs.markings.some(
      (marking) => marking.arm_id === arm.arm_id && marking.type === "give_way_triangles",
    );
    if (hasB1 && hasTeeth) {
      return "b1-with-shark-teeth";
    }
  }
  if (scenario.static_signs.signs.some((sign) => sign.code === "NL:B3" || sign.code === "NL:B4" || sign.code === "NL:B5")) {
    return "unverified-diagram";
  }
  if (!candidateHasConflict(scenario)) {
    return "no-conflict";
  }
  return null;
}

function build(blueprint: Blueprint, rotation: number, category: Category, otherType: ActorType, rng: () => number): Scenario {
  const rotate = (angle: number) => (angle + rotation) % 360;
  const armId = (angle: number) => `arm_${rotate(angle)}`;
  const scenario: Scenario = {
    infra: {
      intersection_type: blueprint.intersectionType,
      arms: blueprint.arms.map((arm) => ({
        arm_id: armId(arm.angle),
        angle_deg: rotate(arm.angle),
        surface: arm.surface,
        curb_type: arm.curb,
        cycleway: arm.cycleway,
      })),
      connectors: [
        {
          from_arm: armId(blueprint.candidate.from),
          to_arm: armId(blueprint.candidate.to),
          turn: blueprint.candidate.turn,
        },
        {
          from_arm: armId(blueprint.other.from),
          to_arm: armId(blueprint.other.to),
          turn: blueprint.other.turn,
        },
      ],
    },
    static_signs: {
      signs: blueprint.signs.map((sign) => ({ arm_id: armId(sign.angle), code: sign.code })),
      markings: blueprint.markings.map((marking) => ({ arm_id: armId(marking.angle), type: marking.type })),
    },
    environment: {
      traffic_officer: false,
      traffic_lights: "none",
      built_up_area: rng() < 0.5,
      road_condition: pick(rng, ["dry", "wet", "icy"] as const),
      obstructions: [],
    },
    actors: [
      {
        id: "candidate",
        type: CANDIDATE_TYPE[category],
        from_arm: armId(blueprint.candidate.from),
        to_arm: armId(blueprint.candidate.to),
        speed_kmh: 20 + Math.floor(rng() * 31),
        is_candidate: true,
      },
      {
        id: `actor_${otherType}`,
        type: otherType,
        from_arm: armId(blueprint.other.from),
        to_arm: armId(blueprint.other.to),
        speed_kmh: 20 + Math.floor(rng() * 31),
        is_candidate: false,
      },
    ],
  };
  return ScenarioSchema.parse(scenario);
}

export function generate(seed: string, focusRuleId?: string): Scenario {
  const parsed = parseSeed(seed);
  const blueprint = focusRuleId
    ? BLUEPRINTS.find((item) => item.ruleId === focusRuleId)
    : undefined;
  if (focusRuleId && !blueprint) {
    throw new Error(`focusRuleId "${focusRuleId}" heeft geen vrijgegeven sjabloon.`);
  }
  const rng = mulberry32(hashSeed(parsed.raw));
  const chosen = blueprint ?? pick(rng, BLUEPRINTS);
  const rotation = pick(rng, [0, 90, 180, 270] as const);
  const otherType = pick(rng, chosen.other.types);
  const scenario = build(chosen, rotation, parsed.category, otherType, rng);
  const violation = constraintViolation(scenario);
  if (violation) {
    throw new Error(`Generator overtrad constraint "${violation}" voor seed ${parsed.raw}.`);
  }
  return scenario;
}
