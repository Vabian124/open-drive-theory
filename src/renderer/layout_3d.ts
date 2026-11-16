// SPDX-License-Identifier: AGPL-3.0-only
import { armPoint } from "../schema/geometry.js";
import type { Scenario } from "../schema/scenario.js";

export interface SceneNode {
  id: string;
  kind: string;
  x: number;
  z: number;
}

/** Top-down positions for an optional 3D skin. The solver does not read this. */
export function sceneNodes(scenario: Scenario): SceneNode[] {
  const arms = new Map(scenario.infra.arms.map((arm) => [arm.arm_id, arm]));
  const nodes: SceneNode[] = scenario.actors.map((actor) => {
    const arm = arms.get(actor.from_arm);
    const point = armPoint(arm?.angle_deg ?? 0);
    return { id: actor.id, kind: actor.type, x: point.x * 4, z: -point.y * 4 };
  });
  if (scenario.infra.intersection_type === "roundabout") {
    nodes.push({ id: "roundabout", kind: "roundabout", x: 0, z: 0 });
  }
  return nodes;
}
