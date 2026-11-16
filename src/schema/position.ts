// SPDX-License-Identifier: AGPL-3.0-only
import type { Scenario } from "./scenario.js";

export interface RoadPosition {
  ruleIds: readonly string[];
  text: string;
}

function signOnArm(scenario: Scenario, armId: string, code: "NL:G11" | "NL:G12a"): boolean {
  return scenario.static_signs.signs.some((sign) => sign.arm_id === armId && sign.code === code);
}

/** Place on the road. This is not a priority order. */
export function roadPosition(scenario: Scenario): RoadPosition | null {
  const candidate = scenario.actors.find((actor) => actor.is_candidate);
  const arm = scenario.infra.arms.find((item) => item.arm_id === candidate?.from_arm);
  if (!candidate || !arm) {
    return null;
  }
  if (candidate.type === "moped") {
    if (signOnArm(scenario, arm.arm_id, "NL:G12a")) {
      return {
        ruleIds: ["RVV-6"],
        text: "Bord G12a wijst een fiets/bromfietspad aan. Artikel 6 lid 1: u gebruikt dat pad.",
      };
    }
    if (signOnArm(scenario, arm.arm_id, "NL:G11")) {
      return {
        ruleIds: ["RVV-6"],
        text: "Bord G11 is een verplicht fietspad, geen fiets/bromfietspad. Artikel 6 lid 2: dat pad ontbreekt, dus u gebruikt de rijbaan.",
      };
    }
    return null;
  }
  if (candidate.type !== "motorcycle") {
    return null;
  }
  const separated =
    arm.cycleway === "track" || signOnArm(scenario, arm.arm_id, "NL:G11") || signOnArm(scenario, arm.arm_id, "NL:G12a");
  if (!separated) {
    return null;
  }
  return {
    ruleIds: ["RVV-3", "RVV-10"],
    text: "Artikel 3 lid 1: u houdt zoveel mogelijk rechts. Artikel 10 lid 1: u gebruikt de rijbaan, niet het fietspad of het fiets/bromfietspad.",
  };
}
