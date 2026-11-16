// SPDX-License-Identifier: AGPL-3.0-only
import type { Actor, Arm } from "../schema/scenario.js";

/** Arm angle, clockwise from south: 0 south, 90 west, 180 north, 270 east. */
export interface Point {
  x: number;
  y: number;
}

export type TurnKind = "straight" | "right" | "left" | "u-turn";

export function norm(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function approachHeading(outwardAngleDeg: number): number {
  return norm(outwardAngleDeg + 180);
}

export function clockwiseDelta(fromDeg: number, toDeg: number): number {
  return norm(toDeg - fromDeg);
}

/** True when the other approach sits in the open half-plane to the driver's right. */
export function comesFromRight(egoHeadingDeg: number, otherHeadingDeg: number): boolean {
  const delta = clockwiseDelta(egoHeadingDeg, otherHeadingDeg);
  return delta > 180 && delta < 360;
}

export function smallestAngleDiff(aDeg: number, bDeg: number): number {
  const delta = Math.abs(norm(aDeg) - norm(bDeg)) % 360;
  return delta > 180 ? 360 - delta : delta;
}

export function isOpposite(aDeg: number, bDeg: number): boolean {
  return Math.abs(smallestAngleDiff(aDeg, bDeg) - 180) <= 5;
}

export function classifyTurn(fromOutwardDeg: number, toOutwardDeg: number): TurnKind {
  const delta = clockwiseDelta(approachHeading(fromOutwardDeg), norm(toOutwardDeg));
  if (delta <= 20 || delta >= 340) {
    return "straight";
  }
  if (delta >= 160 && delta <= 200) {
    return "u-turn";
  }
  if (delta < 180) {
    return "right";
  }
  return "left";
}

/** Outward point on the arm. Y grows north, X grows east. */
export function armPoint(outwardAngleDeg: number): Point {
  const radians = (norm(outwardAngleDeg) * Math.PI) / 180;
  return { x: -Math.sin(radians), y: -Math.cos(radians) };
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/** Interior crossing only. Shared endpoints do not count. */
export function segmentsProperlyIntersect(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const d1 = cross(q2.x - q1.x, q2.y - q1.y, p1.x - q1.x, p1.y - q1.y);
  const d2 = cross(q2.x - q1.x, q2.y - q1.y, p2.x - q1.x, p2.y - q1.y);
  const d3 = cross(p2.x - p1.x, p2.y - p1.y, q1.x - p1.x, q1.y - p1.y);
  const d4 = cross(p2.x - p1.x, p2.y - p1.y, q2.x - p1.x, q2.y - p1.y);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function pathsInteract(a: Actor, b: Actor, arms: ReadonlyMap<string, Arm>): boolean {
  if (a.from_arm === b.from_arm) {
    return a.to_arm !== b.to_arm;
  }
  const aFrom = arms.get(a.from_arm);
  const aTo = arms.get(a.to_arm);
  const bFrom = arms.get(b.from_arm);
  const bTo = arms.get(b.to_arm);
  if (!aFrom || !aTo || !bFrom || !bTo) {
    return false;
  }
  if (segmentsProperlyIntersect(armPoint(aFrom.angle_deg), armPoint(aTo.angle_deg), armPoint(bFrom.angle_deg), armPoint(bTo.angle_deg))) {
    return true;
  }
  if (!isOpposite(aFrom.angle_deg, bFrom.angle_deg)) {
    return false;
  }
  const aTurn = classifyTurn(aFrom.angle_deg, aTo.angle_deg);
  const bTurn = classifyTurn(bFrom.angle_deg, bTo.angle_deg);
  return aTurn !== "straight" || bTurn !== "straight";
}
