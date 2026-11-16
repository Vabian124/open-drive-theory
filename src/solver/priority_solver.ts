// SPDX-License-Identifier: AGPL-3.0-only
import type { Actor, Arm, Evaluation, Scenario } from "../schema/scenario.js";
import type { RuleCard, RuleFile } from "../schema/rules.js";
import {
  approachHeading,
  classifyTurn,
  comesFromRight,
  isOpposite,
  pathsInteract,
  type TurnKind,
} from "../schema/geometry.js";

const DIAGRAM_SIGNS = new Set(["NL:B3", "NL:B4", "NL:B5"]);
const YIELD_SIGNS = new Set(["NL:B6", "NL:B7"]);

export type SolveResult = Evaluation;

interface Duty {
  loser: string;
  winner: string;
  ruleId: string;
}

type PairResult = { kind: "duty"; duty: Duty } | { kind: "gap"; id: string } | { kind: "none" };

function empty(gaps: string[]): SolveResult {
  return { gaps, priority_order: [], candidate_yields_to: [], applied_rule_ids: [] };
}

function isDriver(actor: Actor): boolean {
  return actor.type !== "pedestrian";
}

function armMap(scenario: Scenario): Map<string, Arm> {
  return new Map(scenario.infra.arms.map((arm) => [arm.arm_id, arm]));
}

function hasYieldMark(scenario: Scenario, armId: string): boolean {
  const signed = scenario.static_signs.signs.some(
    (sign) => sign.arm_id === armId && YIELD_SIGNS.has(sign.code),
  );
  const teeth = scenario.static_signs.markings.some(
    (marking) => marking.arm_id === armId && marking.type === "give_way_triangles",
  );
  return signed || teeth;
}

function hasSign(scenario: Scenario, armId: string, code: string): boolean {
  return scenario.static_signs.signs.some((sign) => sign.arm_id === armId && sign.code === code);
}

function turnOf(actor: Actor, arms: ReadonlyMap<string, Arm>): TurnKind {
  const from = arms.get(actor.from_arm);
  const to = arms.get(actor.to_arm);
  if (!from || !to) {
    return "straight";
  }
  return classifyTurn(from.angle_deg, to.angle_deg);
}

function sameAxis(a: Actor, b: Actor, arms: ReadonlyMap<string, Arm>): boolean {
  if (a.from_arm === b.from_arm) {
    return true;
  }
  const fromA = arms.get(a.from_arm);
  const fromB = arms.get(b.from_arm);
  return fromA !== undefined && fromB !== undefined && isOpposite(fromA.angle_deg, fromB.angle_deg);
}

function unverifiedGap(card: RuleCard, scenario: Scenario): boolean {
  if (card.rule_id === "RVV-82") {
    return scenario.environment.traffic_officer;
  }
  if (card.rule_id === "RVV-64") {
    return scenario.environment.traffic_lights !== "none";
  }
  return false;
}

function signDuty(a: Actor, b: Actor, scenario: Scenario, arms: ReadonlyMap<string, Arm>): Duty | null {
  if (!pathsInteract(a, b, arms)) {
    return null;
  }
  const aYields = driverYieldsBySign(a, b, scenario);
  const bYields = driverYieldsBySign(b, a, scenario);
  if (aYields === bYields) {
    return null;
  }
  return aYields
    ? { loser: a.id, winner: b.id, ruleId: "RVV-SIGNS-B1-B7" }
    : { loser: b.id, winner: a.id, ruleId: "RVV-SIGNS-B1-B7" };
}

function driverYieldsBySign(ego: Actor, other: Actor, scenario: Scenario): boolean {
  if (!isDriver(ego)) {
    return false;
  }
  const egoYield = hasYieldMark(scenario, ego.from_arm);
  const otherYield = hasYieldMark(scenario, other.from_arm);
  if (egoYield && !otherYield) {
    return true;
  }
  const otherPriority = hasSign(scenario, other.from_arm, "NL:B1");
  const egoPriority = hasSign(scenario, ego.from_arm, "NL:B1");
  return otherPriority && !egoPriority && !egoYield && !otherYield;
}

function exitDuty(a: Actor, b: Actor, arms: ReadonlyMap<string, Arm>): PairResult {
  const aExit = arms.get(a.from_arm)?.curb_type === "beveled";
  const bExit = arms.get(b.from_arm)?.curb_type === "beveled";
  if (aExit && bExit) {
    return { kind: "gap", id: "RVV-54-dual" };
  }
  if (aExit) {
    return { kind: "duty", duty: { loser: a.id, winner: b.id, ruleId: "RVV-54" } };
  }
  if (bExit) {
    return { kind: "duty", duty: { loser: b.id, winner: a.id, ruleId: "RVV-54" } };
  }
  return { kind: "none" };
}

function surfaceDuty(a: Actor, b: Actor, arms: ReadonlyMap<string, Arm>): Duty | null {
  if (!isDriver(a) || !isDriver(b) || !pathsInteract(a, b, arms)) {
    return null;
  }
  const surfaceA = arms.get(a.from_arm)?.surface;
  const surfaceB = arms.get(b.from_arm)?.surface;
  if (surfaceA === "unpaved" && surfaceB === "paved") {
    return { loser: a.id, winner: b.id, ruleId: "RVV-15.2a" };
  }
  if (surfaceB === "unpaved" && surfaceA === "paved") {
    return { loser: b.id, winner: a.id, ruleId: "RVV-15.2a" };
  }
  return null;
}

function tramDuty(a: Actor, b: Actor, arms: ReadonlyMap<string, Arm>): PairResult {
  if (!pathsInteract(a, b, arms)) {
    return { kind: "none" };
  }
  if (a.type === "tram" && b.type === "tram") {
    return { kind: "gap", id: "RVV-15.2b-two-trams" };
  }
  if (b.type === "tram" && isDriver(a)) {
    return { kind: "duty", duty: { loser: a.id, winner: b.id, ruleId: "RVV-15.2b" } };
  }
  if (a.type === "tram" && isDriver(b)) {
    return { kind: "duty", duty: { loser: b.id, winner: a.id, ruleId: "RVV-15.2b" } };
  }
  return { kind: "none" };
}

function rightDuty(a: Actor, b: Actor, arms: ReadonlyMap<string, Arm>): Duty | null {
  if (!isDriver(a) || !isDriver(b) || !pathsInteract(a, b, arms)) {
    return null;
  }
  const headingA = approachHeading(arms.get(a.from_arm)?.angle_deg ?? 0);
  const headingB = approachHeading(arms.get(b.from_arm)?.angle_deg ?? 0);
  if (comesFromRight(headingA, headingB)) {
    return { loser: a.id, winner: b.id, ruleId: "RVV-15.1" };
  }
  if (comesFromRight(headingB, headingA)) {
    return { loser: b.id, winner: a.id, ruleId: "RVV-15.1" };
  }
  return null;
}

function sameRoadDuty(a: Actor, b: Actor, arms: ReadonlyMap<string, Arm>): Duty | null {
  if (!pathsInteract(a, b, arms) || !sameAxis(a, b, arms)) {
    return null;
  }
  const turnA = turnOf(a, arms);
  const turnB = turnOf(b, arms);
  if (turnA !== "straight" && turnB === "straight" && a.type !== "tram") {
    return { loser: a.id, winner: b.id, ruleId: "RVV-18.1" };
  }
  if (turnB !== "straight" && turnA === "straight" && b.type !== "tram") {
    return { loser: b.id, winner: a.id, ruleId: "RVV-18.1" };
  }
  return null;
}

function shortTurnDuty(a: Actor, b: Actor, arms: ReadonlyMap<string, Arm>): Duty | null {
  const fromA = arms.get(a.from_arm);
  const fromB = arms.get(b.from_arm);
  if (!fromA || !fromB || !isOpposite(fromA.angle_deg, fromB.angle_deg) || !pathsInteract(a, b, arms)) {
    return null;
  }
  const turnA = turnOf(a, arms);
  const turnB = turnOf(b, arms);
  if (turnA === "left" && turnB === "right" && a.type !== "tram") {
    return { loser: a.id, winner: b.id, ruleId: "RVV-18.2" };
  }
  if (turnB === "left" && turnA === "right" && b.type !== "tram") {
    return { loser: b.id, winner: a.id, ruleId: "RVV-18.2" };
  }
  return null;
}

function decidePair(
  a: Actor,
  b: Actor,
  scenario: Scenario,
  arms: ReadonlyMap<string, Arm>,
  active: ReadonlySet<string>,
): PairResult {
  if (active.has("RVV-SIGNS-B1-B7")) {
    const signs = signDuty(a, b, scenario, arms);
    if (signs) {
      return { kind: "duty", duty: signs };
    }
  }
  if (active.has("RVV-54")) {
    const exit = exitDuty(a, b, arms);
    if (exit.kind !== "none") {
      return exit;
    }
  }
  const surface = active.has("RVV-15.2a") ? surfaceDuty(a, b, arms) : null;
  const tram = active.has("RVV-15.2b") ? tramDuty(a, b, arms) : { kind: "none" as const };
  if (surface && tram.kind === "duty" && surface.loser !== tram.duty.loser) {
    return { kind: "gap", id: "RVV-15.2a-versus-15.2b" };
  }
  if (tram.kind === "gap") {
    return tram;
  }
  if (surface) {
    return { kind: "duty", duty: surface };
  }
  if (tram.kind === "duty") {
    return tram;
  }
  if (active.has("RVV-15.1")) {
    const right = rightDuty(a, b, arms);
    if (right) {
      return { kind: "duty", duty: right };
    }
  }
  if (active.has("RVV-18.1")) {
    const sameRoad = sameRoadDuty(a, b, arms);
    if (sameRoad) {
      return { kind: "duty", duty: sameRoad };
    }
  }
  if (active.has("RVV-18.2")) {
    const shortTurn = shortTurnDuty(a, b, arms);
    if (shortTurn) {
      return { kind: "duty", duty: shortTurn };
    }
  }
  return { kind: "none" };
}

function orderByDuties(ids: string[], duties: Duty[]): string[] | null {
  const indegree = new Map(ids.map((id) => [id, 0]));
  const next = new Map(ids.map((id) => [id, [] as string[]]));
  for (const duty of duties) {
    next.get(duty.winner)?.push(duty.loser);
    indegree.set(duty.loser, (indegree.get(duty.loser) ?? 0) + 1);
  }
  const ready = ids.filter((id) => indegree.get(id) === 0);
  const ordered: string[] = [];
  while (ready.length > 0) {
    ready.sort((left, right) => ids.indexOf(left) - ids.indexOf(right));
    const current = ready.shift();
    if (!current) {
      break;
    }
    ordered.push(current);
    for (const follower of next.get(current) ?? []) {
      const remaining = (indegree.get(follower) ?? 0) - 1;
      indegree.set(follower, remaining);
      if (remaining === 0) {
        ready.push(follower);
      }
    }
  }
  return ordered.length === ids.length ? ordered : null;
}

export function solve(scenario: Scenario, rules: RuleFile): SolveResult {
  const gaps = rules.hierarchy.filter((card) => !card.verified && unverifiedGap(card, scenario)).map((card) => card.rule_id);
  if (scenario.static_signs.signs.some((sign) => DIAGRAM_SIGNS.has(sign.code))) {
    gaps.push("b3-b4-b5-diagram");
  }
  if (gaps.length > 0) {
    return empty(gaps);
  }

  const active = new Set(rules.hierarchy.filter((card) => card.verified).map((card) => card.rule_id));
  const arms = armMap(scenario);
  const duties: Duty[] = [];
  const pairGaps: string[] = [];
  for (let i = 0; i < scenario.actors.length; i += 1) {
    for (let j = i + 1; j < scenario.actors.length; j += 1) {
      const left = scenario.actors[i];
      const right = scenario.actors[j];
      if (!left || !right) {
        continue;
      }
      const result = decidePair(left, right, scenario, arms, active);
      if (result.kind === "gap") {
        pairGaps.push(result.id);
      } else if (result.kind === "duty") {
        duties.push(result.duty);
      }
    }
  }
  if (pairGaps.length > 0) {
    return empty(pairGaps);
  }

  const ids = scenario.actors.map((actor) => actor.id);
  const priority = orderByDuties(ids, duties);
  if (!priority) {
    return empty(["priority-cycle"]);
  }
  const candidate = scenario.actors.find((actor) => actor.is_candidate);
  const candidateYields = duties
    .filter((duty) => duty.loser === candidate?.id)
    .map((duty) => duty.winner)
    .sort((left, right) => priority.indexOf(left) - priority.indexOf(right));
  const rank = new Map(rules.hierarchy.map((card) => [card.rule_id, card.rank]));
  const applied = [...new Set(duties.map((duty) => duty.ruleId))].sort(
    (left, right) => (rank.get(left) ?? 0) - (rank.get(right) ?? 0),
  );
  return {
    gaps: [],
    priority_order: priority,
    candidate_yields_to: candidateYields,
    applied_rule_ids: applied,
  };
}
