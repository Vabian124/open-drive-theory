// SPDX-License-Identifier: AGPL-3.0-only
import type { Scenario } from "./scenario.js";

export interface MopedSpeedLimit {
  ruleId: "RVV-20" | "RVV-21";
  kmh: 30 | 40 | 45;
  text: string;
}

function hasG12a(scenario: Scenario, armId: string): boolean {
  return scenario.static_signs.signs.some((sign) => sign.arm_id === armId && sign.code === "NL:G12a");
}

/** Maximum speed for a moped. This is not a priority order. */
export function mopedSpeedLimit(scenario: Scenario): MopedSpeedLimit | null {
  const candidate = scenario.actors.find((actor) => actor.is_candidate);
  if (!candidate || candidate.type !== "moped") {
    return null;
  }
  const onCycleMopedPath = hasG12a(scenario, candidate.from_arm);
  if (scenario.environment.built_up_area) {
    if (onCycleMopedPath) {
      return {
        ruleId: "RVV-20",
        kmh: 30,
        text: "Op het fiets/bromfietspad binnen de bebouwde kom geldt 30 km per uur. Artikel 20, onderdeel b, onder 1.",
      };
    }
    return {
      ruleId: "RVV-20",
      kmh: 45,
      text: "Op de rijbaan binnen de bebouwde kom geldt 45 km per uur. Artikel 20, onderdeel b, onder 2.",
    };
  }
  if (onCycleMopedPath) {
    return {
      ruleId: "RVV-21",
      kmh: 40,
      text: "Op het fiets/bromfietspad buiten de bebouwde kom geldt 40 km per uur. Artikel 21, onderdeel b, onder 1.",
    };
  }
  return {
    ruleId: "RVV-21",
    kmh: 45,
    text: "Op de rijbaan buiten de bebouwde kom geldt 45 km per uur. Artikel 21, onderdeel b, onder 2.",
  };
}
