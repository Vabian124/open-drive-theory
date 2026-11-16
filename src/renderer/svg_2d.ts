// SPDX-License-Identifier: AGPL-3.0-only
import { armPoint, classifyTurn, type TurnKind } from "../schema/geometry.js";
import type { Actor, Arm, Scenario } from "../schema/scenario.js";

const SIZE = 800;
const CENTER = 400;
const ARM_OUTER = 348;
const ROAD_HALF = 40;

interface Vec {
  x: number;
  y: number;
}

function fmt(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svgOutward(angleDeg: number): Vec {
  const point = armPoint(angleDeg);
  const length = Math.hypot(point.x, point.y) || 1;
  return { x: point.x / length, y: -point.y / length };
}

/** Right-hand side of a driver travelling toward the junction. */
function approachRight(outward: Vec): Vec {
  return { x: outward.y, y: -outward.x };
}

function at(outward: Vec, right: Vec, along: number, side: number): Vec {
  return {
    x: CENTER + outward.x * along + right.x * side,
    y: CENTER + outward.y * along + right.y * side,
  };
}

function headingFromUp(outward: Vec): number {
  const travelX = -outward.x;
  const travelY = -outward.y;
  return (Math.atan2(travelX, -travelY) * 180) / Math.PI;
}

function signature(scenario: Scenario): string {
  const payload = JSON.stringify({
    t: scenario.infra.intersection_type,
    a: scenario.infra.arms.map((arm) => [arm.arm_id, arm.angle_deg, arm.surface, arm.curb_type, arm.cycleway]),
    s: scenario.static_signs.signs.map((sign) => [sign.arm_id, sign.code, sign.sub_sign ?? ""]),
    m: scenario.static_signs.markings.map((marking) => [marking.arm_id, marking.type]),
    p: scenario.actors.map((actor) => [actor.id, actor.type, actor.from_arm, actor.to_arm, actor.is_candidate]),
  });
  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function band(outward: Vec, right: Vec, inner: number, outer: number, side: number, half: number): string {
  const corners = [
    at(outward, right, inner, side + half),
    at(outward, right, outer, side + half),
    at(outward, right, outer, side - half),
    at(outward, right, inner, side - half),
  ];
  return corners.map((corner) => `${fmt(corner.x)},${fmt(corner.y)}`).join(" ");
}

function asphalt(condition: Scenario["environment"]["road_condition"]): string {
  if (condition === "wet") {
    return "#2c3440";
  }
  if (condition === "icy") {
    return "#8ea0b0";
  }
  return "#3e4652";
}

function armPolygon(arm: Arm, condition: Scenario["environment"]["road_condition"], patternId: string): string {
  const outward = svgOutward(arm.angle_deg);
  const right = approachRight(outward);
  const inner = arm.curb_type === "beveled" ? ROAD_HALF + 36 : 0;
  const fill = arm.surface === "unpaved" ? `url(#${patternId})` : asphalt(condition);
  return `<polygon data-arm="${esc(arm.arm_id)}" data-surface="${arm.surface}" data-curb="${arm.curb_type}" data-cycleway="${arm.cycleway}" points="${band(outward, right, inner, ARM_OUTER, 0, ROAD_HALF)}" fill="${fill}" stroke="#2a3038" stroke-width="1"/>`;
}

function beveledCurb(arm: Arm): string {
  const outward = svgOutward(arm.angle_deg);
  const right = approachRight(outward);
  const sidewalk = band(outward, right, ROAD_HALF, ROAD_HALF + 34, 0, ROAD_HALF + 18);
  const leftStone = band(outward, right, ROAD_HALF - 2, ROAD_HALF + 36, -(ROAD_HALF + 8), 10);
  const rightStone = band(outward, right, ROAD_HALF - 2, ROAD_HALF + 36, ROAD_HALF + 8, 10);
  const blocks = [-28, -14, 0, 14, 28]
    .map((side) => {
      const center = at(outward, right, ROAD_HALF + 16, side);
      return `<rect data-cue="entrance-blocks" x="${fmt(center.x - 5)}" y="${fmt(center.y - 7)}" width="10" height="14" fill="#6e5b45" stroke="#3f3428" transform="rotate(${fmt(headingFromUp(outward))} ${fmt(center.x)} ${fmt(center.y)})"/>`;
    })
    .join("");
  return `<g data-curb="beveled" data-arm="${esc(arm.arm_id)}"><polygon data-cue="continuous-sidewalk" points="${sidewalk}" fill="#f7f4ee" stroke="#5c564c" stroke-width="2"/><polygon data-cue="beveled-curb" points="${leftStone}" fill="#b7aa96" stroke="#5c564c"/><polygon data-cue="beveled-curb" points="${rightStone}" fill="#b7aa96" stroke="#5c564c"/>${blocks}</g>`;
}

function cyclewayLane(arm: Arm): string {
  if (arm.cycleway !== "lane") {
    return "";
  }
  const outward = svgOutward(arm.angle_deg);
  const right = approachRight(outward);
  const strip = band(outward, right, ROAD_HALF + 36, ARM_OUTER - 8, ROAD_HALF - 16, 8);
  const inner = at(outward, right, ROAD_HALF + 50, ROAD_HALF - 24);
  const outer = at(outward, right, ARM_OUTER - 16, ROAD_HALF - 24);
  return `<g data-cycleway="lane" data-arm="${esc(arm.arm_id)}"><polygon points="${strip}" fill="#d85a4a" opacity="0.95"/><line data-cue="lane-line" x1="${fmt(inner.x)}" y1="${fmt(inner.y)}" x2="${fmt(outer.x)}" y2="${fmt(outer.y)}" stroke="#f4f4f4" stroke-width="2" stroke-dasharray="8 7"/></g>`;
}

function cyclewayTrack(arm: Arm): string {
  if (arm.cycleway !== "track") {
    return "";
  }
  const outward = svgOutward(arm.angle_deg);
  const right = approachRight(outward);
  const verge = band(outward, right, ROAD_HALF + 4, ARM_OUTER - 8, ROAD_HALF + 22, 12);
  const track = band(outward, right, ROAD_HALF + 8, ARM_OUTER - 12, ROAD_HALF + 40, 9);
  return `<g data-cycleway="track" data-arm="${esc(arm.arm_id)}"><polygon data-cue="verge" points="${verge}" fill="#7d9a62"/><polygon points="${track}" fill="#c45348"/></g>`;
}

function marking(arm: Arm, type: Scenario["static_signs"]["markings"][number]["type"]): string {
  const outward = svgOutward(arm.angle_deg);
  const right = approachRight(outward);
  if (type === "give_way_triangles") {
    const teeth = [-18, 0, 18]
      .map((side) => {
        const left = at(outward, right, 92, side - 7);
        const rightPoint = at(outward, right, 92, side + 7);
        const apex = at(outward, right, 112, side);
        return `<polygon points="${fmt(left.x)},${fmt(left.y)} ${fmt(rightPoint.x)},${fmt(rightPoint.y)} ${fmt(apex.x)},${fmt(apex.y)}" fill="#f7f7f7"/>`;
      })
      .join("");
    return `<g data-marking="give_way_triangles" data-arm="${esc(arm.arm_id)}">${teeth}</g>`;
  }
  if (type === "stop_line") {
    const start = at(outward, right, 86, -ROAD_HALF + 8);
    const end = at(outward, right, 86, ROAD_HALF - 8);
    return `<line data-marking="stop_line" data-arm="${esc(arm.arm_id)}" x1="${fmt(start.x)}" y1="${fmt(start.y)}" x2="${fmt(end.x)}" y2="${fmt(end.y)}" stroke="#f7f7f7" stroke-width="5"/>`;
  }
  if (type === "crosswalk") {
    const stripes = [-2, -1, 0, 1, 2]
      .map((index) => {
        const start = at(outward, right, 128, index * 12);
        const end = at(outward, right, 148, index * 12);
        return `<line x1="${fmt(start.x)}" y1="${fmt(start.y)}" x2="${fmt(end.x)}" y2="${fmt(end.y)}" stroke="#f7f7f7" stroke-width="6"/>`;
      })
      .join("");
    return `<g data-marking="crosswalk" data-arm="${esc(arm.arm_id)}">${stripes}</g>`;
  }
  const start = at(outward, right, 70, 0);
  const end = at(outward, right, ARM_OUTER - 24, 0);
  return `<line data-marking="continuous_line" data-arm="${esc(arm.arm_id)}" x1="${fmt(start.x)}" y1="${fmt(start.y)}" x2="${fmt(end.x)}" y2="${fmt(end.y)}" stroke="#f7f7f7" stroke-width="2"/>`;
}

function signGlyph(code: Scenario["static_signs"]["signs"][number]["code"]): string {
  if (code === "NL:B1") {
    return `<rect x="-12" y="-12" width="24" height="24" transform="rotate(45)" fill="#f5d000" stroke="#ffffff" stroke-width="3"/>`;
  }
  if (code === "NL:B6") {
    return `<polygon points="-16,-12 16,-12 0,16" fill="#ffffff" stroke="#d00000" stroke-width="3"/>`;
  }
  if (code === "NL:B7") {
    const points = Array.from({ length: 8 }, (_, index) => {
      const angle = Math.PI / 8 + index * (Math.PI / 4);
      return `${fmt(16 * Math.cos(angle))},${fmt(-16 * Math.sin(angle))}`;
    }).join(" ");
    return `<polygon points="${points}" fill="#c1121f" stroke="#ffffff" stroke-width="2"/><text y="4" text-anchor="middle" font-size="8" font-family="sans-serif" fill="#ffffff">STOP</text>`;
  }
  if (code === "NL:G11" || code === "NL:G12a") {
    const extra = code === "NL:G12a" ? `<circle cx="7" cy="4" r="3" fill="none" stroke="#ffffff" stroke-width="1.5"/>` : "";
    return `<circle r="16" fill="#1d4ed8" stroke="#ffffff" stroke-width="2"/><circle cx="-6" cy="4" r="3" fill="none" stroke="#ffffff" stroke-width="1.5"/><circle cx="5" cy="4" r="3" fill="none" stroke="#ffffff" stroke-width="1.5"/><path d="M-6,4 L0,-6 L6,4" fill="none" stroke="#ffffff" stroke-width="1.5"/>${extra}`;
  }
  const side =
    code === "NL:B4" ? `<line x1="-10" y1="0" x2="0" y2="0" stroke="#111" stroke-width="2"/>` : code === "NL:B5" ? `<line x1="0" y1="0" x2="10" y2="0" stroke="#111" stroke-width="2"/>` : `<line x1="-10" y1="0" x2="10" y2="0" stroke="#111" stroke-width="2"/>`;
  return `<polygon points="0,-16 14,12 -14,12" fill="#fff7e6" stroke="#d00000" stroke-width="2"/><line x1="0" y1="-8" x2="0" y2="8" stroke="#111" stroke-width="3"/>${side}`;
}

function signs(scenario: Scenario, arms: ReadonlyMap<string, Arm>): string {
  const counts = new Map<string, number>();
  return scenario.static_signs.signs
    .map((sign) => {
      const arm = arms.get(sign.arm_id);
      if (!arm) {
        return "";
      }
      const slot = counts.get(sign.arm_id) ?? 0;
      counts.set(sign.arm_id, slot + 1);
      const outward = svgOutward(arm.angle_deg);
      const right = approachRight(outward);
      const position = at(outward, right, 150 + slot * 42, ROAD_HALF + 28);
      const plate = sign.sub_sign
        ? `<rect x="-18" y="18" width="36" height="12" fill="#ffffff" stroke="#222"/><text y="27" text-anchor="middle" font-size="6" font-family="sans-serif">${esc(sign.sub_sign)}</text>`
        : "";
      return `<g data-sign="${esc(sign.code)}" data-arm="${esc(sign.arm_id)}" transform="translate(${fmt(position.x)} ${fmt(position.y)})">${signGlyph(sign.code)}${plate}</g>`;
    })
    .join("");
}

function actorTurn(scenario: Scenario, actor: Actor): TurnKind {
  const connector = scenario.infra.connectors.find(
    (item) => item.from_arm === actor.from_arm && item.to_arm === actor.to_arm,
  );
  if (connector) {
    return connector.turn;
  }
  const from = scenario.infra.arms.find((arm) => arm.arm_id === actor.from_arm);
  const to = scenario.infra.arms.find((arm) => arm.arm_id === actor.to_arm);
  if (!from || !to) {
    return "straight";
  }
  return classifyTurn(from.angle_deg, to.angle_deg);
}

function turnMark(turn: TurnKind): string {
  if (turn === "left") {
    return `<path data-turn="left" d="M0,-20 L-10,-30 L-2,-30" fill="none" stroke="#111" stroke-width="2"/>`;
  }
  if (turn === "right") {
    return `<path data-turn="right" d="M0,-20 L10,-30 L2,-30" fill="none" stroke="#111" stroke-width="2"/>`;
  }
  if (turn === "u-turn") {
    return `<path data-turn="u-turn" d="M4,-18 L4,-28 L-4,-28" fill="none" stroke="#111" stroke-width="2"/>`;
  }
  return `<path data-turn="straight" d="M0,-18 L0,-30 M-4,-26 L0,-32 L4,-26" fill="none" stroke="#111" stroke-width="2"/>`;
}

function actorBody(actor: Actor): string {
  const fill = actor.is_candidate ? "#2f6fed" : "#c44536";
  switch (actor.type) {
    case "motorcycle":
      return `<circle cx="0" cy="-11" r="3" fill="#222"/><circle cx="0" cy="11" r="3" fill="#222"/><rect x="-3" y="-12" width="6" height="24" rx="2" fill="${fill}"/>`;
    case "moped":
      return `<circle cx="0" cy="-10" r="3.5" fill="#222"/><circle cx="0" cy="10" r="3.5" fill="#222"/><rect x="-4" y="-11" width="8" height="22" rx="3" fill="#7b2cbf"/>`;
    case "tram":
      return `<rect x="-11" y="-26" width="22" height="52" rx="3" fill="#f4d35e" stroke="#222"/><rect x="-8" y="-20" width="16" height="8" fill="#d7ecff"/><line x1="0" y1="-26" x2="0" y2="-32" stroke="#222"/>`;
    case "cyclist":
      return `<circle cx="0" cy="-8" r="4" fill="#2a9d8f"/><circle cx="-6" cy="6" r="4" fill="none" stroke="#222" stroke-width="1.5"/><circle cx="6" cy="6" r="4" fill="none" stroke="#222" stroke-width="1.5"/><path d="M-6,6 L0,-4 L6,6" fill="none" stroke="#222"/>`;
    case "pedestrian":
      return `<circle cx="0" cy="-8" r="5" fill="#6d597a"/><rect x="-4" y="-2" width="8" height="14" rx="2" fill="#6d597a"/>`;
    case "emergency":
      return `<rect x="-9" y="-16" width="18" height="32" rx="4" fill="#e63946" stroke="#111"/><rect x="-7" y="-16" width="14" height="4" fill="#8ecae6"/>`;
    default:
      return `<rect x="-9" y="-16" width="18" height="32" rx="4" fill="${fill}" stroke="#1b1b1b"/><rect x="-7" y="-14" width="14" height="7" rx="1" fill="#d7ecff"/>`;
  }
}

function actors(scenario: Scenario, arms: ReadonlyMap<string, Arm>): string {
  return scenario.actors
    .map((actor, index) => {
      const arm = arms.get(actor.from_arm);
      if (!arm) {
        return "";
      }
      const outward = svgOutward(arm.angle_deg);
      const right = approachRight(outward);
      const onLane = actor.type === "cyclist" && arm.cycleway === "lane";
      const side = onLane ? ROAD_HALF - 16 : 0;
      const along = onLane ? 280 : actor.is_candidate ? 188 : 250;
      const position = at(outward, right, along, side);
      const labelAt = at(outward, right, along + 42, side);
      const badge = actor.is_candidate
        ? `<text data-badge="JIJ" x="${fmt(labelAt.x)}" y="${fmt(labelAt.y)}" text-anchor="middle" font-size="14" font-family="sans-serif" font-weight="700" fill="#7a4b00">JIJ</text>`
        : "";
      return `<g data-actor="${esc(actor.type)}" data-actor-id="${esc(actor.id)}" data-candidate="${actor.is_candidate ? "true" : "false"}" transform="translate(${fmt(position.x)} ${fmt(position.y)}) rotate(${fmt(headingFromUp(outward))})">${actor.is_candidate ? `<circle r="28" fill="#f4c430" fill-opacity="0.35"/>` : ""}${actorBody(actor)}${turnMark(actorTurn(scenario, actor))}</g>${badge}`;
    })
    .join("");
}

function rails(scenario: Scenario, arms: ReadonlyMap<string, Arm>): string {
  const trams = scenario.actors.filter((actor) => actor.type === "tram");
  if (trams.length === 0) {
    return "";
  }
  const lines = trams
    .map((tram) => {
      const from = arms.get(tram.from_arm);
      const to = arms.get(tram.to_arm);
      if (!from || !to) {
        return "";
      }
      const start = at(svgOutward(from.angle_deg), approachRight(svgOutward(from.angle_deg)), ARM_OUTER - 20, 0);
      const middle = { x: CENTER, y: CENTER };
      const end = at(svgOutward(to.angle_deg), approachRight(svgOutward(to.angle_deg)), ARM_OUTER - 20, 0);
      return [
        [start, middle],
        [middle, end],
      ]
        .map(([point, next]) => {
          if (!point || !next) {
            return "";
          }
          return [-3, 3]
            .map((offset) => {
              const dx = next.x - point.x;
              const dy = next.y - point.y;
              const length = Math.hypot(dx, dy) || 1;
              const nx = (-dy / length) * offset;
              const ny = (dx / length) * offset;
              return `<line x1="${fmt(point.x + nx)}" y1="${fmt(point.y + ny)}" x2="${fmt(next.x + nx)}" y2="${fmt(next.y + ny)}" stroke="#6b6256" stroke-width="2"/>`;
            })
            .join("");
        })
        .join("");
    })
    .join("");
  return `<g data-rails="tram">${lines}</g>`;
}

function environment(scenario: Scenario, arms: ReadonlyMap<string, Arm>): string {
  const blocks = scenario.environment.obstructions
    .map((obstruction) => {
      const arm = arms.get(obstruction.near_arm);
      if (!arm) {
        return "";
      }
      const outward = svgOutward(arm.angle_deg);
      const right = approachRight(outward);
      const position = at(outward, right, 300, -(ROAD_HALF + 36));
      const fill = obstruction.type === "hedges" ? "#3f7d4e" : obstruction.type === "parked_truck" ? "#8d6a43" : "#9aa0a6";
      return `<rect data-obstruction="${obstruction.type}" x="${fmt(position.x - 16)}" y="${fmt(position.y - 12)}" width="32" height="24" rx="2" fill="${fill}"/>`;
    })
    .join("");
  const lights =
    scenario.environment.traffic_lights === "none"
      ? ""
      : scenario.infra.arms
          .map((arm) => {
            const outward = svgOutward(arm.angle_deg);
            const position = at(outward, approachRight(outward), 78, -(ROAD_HALF + 14));
            const lamp = scenario.environment.traffic_lights === "flashing_amber" ? "#f4c430" : "#f7f7f7";
            return `<g data-signal="${scenario.environment.traffic_lights}" transform="translate(${fmt(position.x)} ${fmt(position.y)})"><rect x="-5" y="-12" width="10" height="24" rx="2" fill="#222"/><circle cy="-6" r="2" fill="${lamp}"/></g>`;
          })
          .join("");
  const officer = scenario.environment.traffic_officer
    ? `<g data-officer="true" transform="translate(${CENTER} ${CENTER})"><circle cy="-8" r="6" fill="#f2c14e"/><rect x="-5" y="-1" width="10" height="16" fill="#1d4e89"/></g>`
    : "";
  return `${blocks}${lights}${officer}`;
}

export function renderScenarioSvg(scenario: Scenario): string {
  const sig = signature(scenario);
  const patternId = `unpaved-${sig}`;
  const arms = new Map(scenario.infra.arms.map((arm) => [arm.arm_id, arm]));
  const mark = (parseInt(sig.slice(0, 2), 16) % 7) * 0.01;
  const junctionUnpaved = scenario.infra.arms.every((arm) => arm.surface === "unpaved");
  const junctionFill = junctionUnpaved ? `url(#${patternId})` : asphalt(scenario.environment.road_condition);
  const ground = scenario.environment.built_up_area ? "#e7e1d6" : "#d7e4c8";
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" data-odt-signature="${sig}">`,
    `<metadata>odt-signature:${sig}</metadata>`,
    `<defs><pattern id="${patternId}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#c6a36a"/><circle cx="2" cy="2" r="0.8" fill="#8d6b3a"/><circle cx="6" cy="5" r="0.7" fill="#a98450"/></pattern></defs>`,
    `<rect data-built-up="${scenario.environment.built_up_area ? "true" : "false"}" data-road-condition="${scenario.environment.road_condition}" width="${SIZE}" height="${SIZE}" fill="${ground}"/>`,
    `<g data-layer="infra">${scenario.infra.arms.map((arm) => armPolygon(arm, scenario.environment.road_condition, patternId)).join("")}<circle cx="${fmt(CENTER + mark)}" cy="${fmt(CENTER)}" r="${fmt(ROAD_HALF + 2)}" fill="${junctionFill}" data-signature-mark="1"/></g>`,
    `<g data-layer="cycleways">${scenario.infra.arms.map((arm) => cyclewayTrack(arm) + cyclewayLane(arm)).join("")}</g>`,
    `<g data-layer="exit">${scenario.infra.arms.filter((arm) => arm.curb_type === "beveled").map((arm) => beveledCurb(arm)).join("")}</g>`,
    `<g data-layer="markings">${scenario.static_signs.markings.map((item) => { const arm = arms.get(item.arm_id); return arm ? marking(arm, item.type) : ""; }).join("")}</g>`,
    `<g data-layer="rails">${rails(scenario, arms)}</g>`,
    `<g data-layer="signs">${signs(scenario, arms)}</g>`,
    `<g data-layer="environment">${environment(scenario, arms)}</g>`,
    `<g data-layer="actors">${actors(scenario, arms)}</g>`,
    `</svg>`,
  ];
  return parts.join("");
}
