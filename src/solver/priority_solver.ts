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
  return actor.type !== "pedestrian" && actor.type !== "funeral_procession";
}

function isOnFoot(actor: Actor): boolean {
  return actor.type === "pedestrian" || actor.type === "funeral_procession";
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
  if (!isDriver(ego) || !isDriver(other)) {
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
  if (!isDriver(a) || !isDriver(b)) {
    return { kind: "none" };
  }
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
  if (!isDriver(a) || !isDriver(b) || !pathsInteract(a, b, arms) || !sameAxis(a, b, arms)) {
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
  if (!isDriver(a) || !isDriver(b)) {
    return null;
  }
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

function stops(actor: Actor): boolean {
  return actor.signal === "red" || actor.signal === "amber";
}

function officerDuty(a: Actor, b: Actor, scenario: Scenario, arms: ReadonlyMap<string, Arm>): PairResult {
  if (!scenario.environment.traffic_officer || !pathsInteract(a, b, arms)) {
    return { kind: "none" };
  }
  const orderA = a.officer_order;
  const orderB = b.officer_order;
  if ((orderA !== "stop" && orderA !== "go") || (orderB !== "stop" && orderB !== "go")) {
    return { kind: "none" };
  }
  if (orderA === "stop" && orderB === "go") {
    return { kind: "duty", duty: { loser: a.id, winner: b.id, ruleId: "RVV-82" } };
  }
  if (orderB === "stop" && orderA === "go") {
    return { kind: "duty", duty: { loser: b.id, winner: a.id, ruleId: "RVV-82" } };
  }
  if (orderA === "stop" && orderB === "stop") {
    return { kind: "gap", id: "RVV-82-both-stop" };
  }
  return { kind: "none" };
}

function lightDuty(a: Actor, b: Actor, scenario: Scenario, arms: ReadonlyMap<string, Arm>): PairResult {
  if (scenario.environment.traffic_lights !== "active" || !pathsInteract(a, b, arms)) {
    return { kind: "none" };
  }
  const stopA = stops(a);
  const stopB = stops(b);
  if (stopA && b.signal === "green") {
    return { kind: "duty", duty: { loser: a.id, winner: b.id, ruleId: "RVV-68" } };
  }
  if (stopB && a.signal === "green") {
    return { kind: "duty", duty: { loser: b.id, winner: a.id, ruleId: "RVV-68" } };
  }
  if (stopA && stopB) {
    return { kind: "gap", id: "RVV-68-both-stop" };
  }
  return { kind: "none" };
}

function emergencyDuty(a: Actor, b: Actor, arms: ReadonlyMap<string, Arm>): PairResult {
  const aEmergency = a.type === "emergency";
  const bEmergency = b.type === "emergency";
  if (!aEmergency && !bEmergency) {
    return { kind: "none" };
  }
  if (!pathsInteract(a, b, arms)) {
    return { kind: "none" };
  }
  if (aEmergency && bEmergency) {
    return { kind: "gap", id: "RVV-50-two" };
  }
  return aEmergency
    ? { kind: "duty", duty: { loser: b.id, winner: a.id, ruleId: "RVV-50" } }
    : { kind: "duty", duty: { loser: a.id, winner: b.id, ruleId: "RVV-50" } };
}

function hasCrosswalk(scenario: Scenario, armId: string): boolean {
  return scenario.static_signs.markings.some((marking) => marking.arm_id === armId && marking.type === "crosswalk");
}

function crosswalkDuty(a: Actor, b: Actor, scenario: Scenario, arms: ReadonlyMap<string, Arm>): PairResult {
  const foot = isOnFoot(a) ? a : isOnFoot(b) ? b : undefined;
  const driver = foot === a ? b : foot === b ? a : undefined;
  if (!foot || !driver || !isDriver(driver) || driver.type === "military_column" || !pathsInteract(a, b, arms)) {
    return { kind: "none" };
  }
  if (foot.signal === "red") {
    return { kind: "none" };
  }
  if (!hasCrosswalk(scenario, foot.from_arm) && !hasCrosswalk(scenario, driver.from_arm)) {
    return { kind: "none" };
  }
  return { kind: "duty", duty: { loser: driver.id, winner: foot.id, ruleId: "RVV-49" } };
}

function columnDuty(a: Actor, b: Actor, arms: ReadonlyMap<string, Arm>): PairResult {
  const aColumn = a.type === "military_column";
  const bColumn = b.type === "military_column";
  if (!aColumn && !bColumn) {
    return { kind: "none" };
  }
  if (!pathsInteract(a, b, arms)) {
    return { kind: "none" };
  }
  if (aColumn && bColumn) {
    return { kind: "gap", id: "RVV-16-two" };
  }
  return aColumn
    ? { kind: "duty", duty: { loser: b.id, winner: a.id, ruleId: "RVV-16" } }
    : { kind: "duty", duty: { loser: a.id, winner: b.id, ruleId: "RVV-16" } };
}

function decidePair(
  a: Actor,
  b: Actor,
  scenario: Scenario,
  arms: ReadonlyMap<string, Arm>,
  active: ReadonlySet<string>,
): PairResult {
  if (active.has("RVV-82")) {
    const officer = officerDuty(a, b, scenario, arms);
    if (officer.kind !== "none") {
      return officer;
    }
  }
  if (active.has("RVV-68")) {
    const lights = lightDuty(a, b, scenario, arms);
    if (lights.kind !== "none") {
      return lights;
    }
  }
  if (active.has("RVV-50")) {
    const emergency = emergencyDuty(a, b, arms);
    if (emergency.kind !== "none") {
      return emergency;
    }
  }
  if (active.has("RVV-49")) {
    const crossing = crosswalkDuty(a, b, scenario, arms);
    if (crossing.kind !== "none") {
      return crossing;
    }
  }
  if (active.has("RVV-16")) {
    const column = columnDuty(a, b, arms);
    if (column.kind !== "none") {
      return column;
    }
  }
  if (scenario.environment.traffic_lights !== "active" && active.has("RVV-SIGNS-B1-B7")) {
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

function instructionGaps(scenario: Scenario): string[] {
  const gaps: string[] = [];
  if (
    scenario.environment.traffic_officer &&
    scenario.actors.some((actor) => actor.officer_order !== "stop" && actor.officer_order !== "go")
  ) {
    gaps.push("RVV-82");
  }
  if (
    scenario.environment.traffic_lights === "active" &&
    scenario.actors.some((actor) => actor.signal !== "red" && actor.signal !== "amber" && actor.signal !== "green")
  ) {
    gaps.push("RVV-64");
  }
  return gaps;
}

export function solve(scenario: Scenario, rules: RuleFile): SolveResult {
  const gaps = [
    ...instructionGaps(scenario),
    ...rules.hierarchy.filter((card) => !card.verified && unverifiedGap(card, scenario)).map((card) => card.rule_id),
  ];
  if (scenario.static_signs.signs.some((sign) => DIAGRAM_SIGNS.has(sign.code))) {
    gaps.push("b3-b4-b5-diagram");
  }
  const unique = [...new Set(gaps)];
  if (unique.length > 0) {
    return empty(unique);
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
