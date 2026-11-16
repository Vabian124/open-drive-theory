// SPDX-License-Identifier: AGPL-3.0-only
import { classifyTurn } from "../schema/geometry.js";
import { NarrationSchema, type Narration } from "../schema/narration.js";
import { roadPosition } from "../schema/position.js";
import {
  EvaluationSchema,
  ScenarioSchema,
  type Actor,
  type Evaluation,
  type Scenario,
} from "../schema/scenario.js";

const RULE_GLOSS: Record<string, string> = {
  "RVV-15.1": "Op een kruispunt gaan bestuurders van rechts voor.",
  "RVV-15.2a": "Wie van een onverharde weg komt, laat bestuurders op de verharde weg voorgaan.",
  "RVV-15.2b": "Bestuurders verlenen voorrang aan een tram.",
  "RVV-18.1": "Wie afslaat, laat verkeer dat op dezelfde weg rechtdoor gaat voorgaan.",
  "RVV-18.2": "De korte bocht gaat voor op de lange bocht.",
  "RVV-54": "Wie een uitrit verlaat, laat het overige verkeer voorgaan.",
  "RVV-SIGNS-B1-B7": "Bord B6, bord B7 of haaientanden verplichten tot voorrang verlenen. Bord B1 merkt de voorrangsweg.",
  "RVV-50": "Weggebruikers laten een voorrangsvoertuig voorgaan. Dat voert het blauwe licht en de hoorn van artikel 29.",
  "RVV-49": "Op een voetgangersoversteekplaats laat u de overstekende voetganger voorgaan.",
  "RVV-16": "U mag een militaire kolonne niet doorsnijden.",
  "RVV-68": "Rood of geel licht betekent stop. Groen licht betekent doorgaan.",
  "RVV-82": "U volgt de aanwijzing van de verkeersregelaar. Die gaat boven borden en regels.",
  "RVV-6": "Een bromfiets gebruikt het fiets/bromfietspad, en anders de rijbaan.",
  "RVV-3": "U houdt zoveel mogelijk rechts.",
  "RVV-10": "U gebruikt de rijbaan.",
  "RVV-19": "U moet kunnen stoppen binnen de afstand die u overziet en die vrij is.",
};

function noun(type: Actor["type"]): string {
  switch (type) {
    case "car":
      return "auto";
    case "motorcycle":
      return "motor";
    case "moped":
      return "bromfiets";
    case "tram":
      return "tram";
    case "cyclist":
      return "fietser";
    case "pedestrian":
      return "voetganger";
    case "emergency":
      return "voorrangsvoertuig";
    case "military_column":
      return "militaire kolonne";
    case "funeral_procession":
      return "uitvaartstoet";
    default:
      return "bestuurder";
  }
}

function riding(type: Actor["type"]): string {
  if (type === "car") {
    return "in de auto";
  }
  if (type === "moped") {
    return "op de bromfiets";
  }
  if (type === "motorcycle") {
    return "op de motor";
  }
  return "in uw voertuig";
}

function actorLabel(actor: Actor, candidate: Actor): string {
  if (actor.type === candidate.type) {
    return `andere ${noun(actor.type)}`;
  }
  return noun(actor.type);
}

function maneuver(scenario: Scenario, candidate: Actor): string {
  const from = scenario.infra.arms.find((arm) => arm.arm_id === candidate.from_arm);
  const to = scenario.infra.arms.find((arm) => arm.arm_id === candidate.to_arm);
  const turn = from && to ? classifyTurn(from.angle_deg, to.angle_deg) : "straight";
  if (turn === "right") {
    return "wilt rechtsaf slaan";
  }
  if (turn === "left") {
    return "wilt linksaf slaan";
  }
  if (turn === "u-turn") {
    return "wilt keren";
  }
  return "wilt rechtdoor rijden";
}

function correctText(scenario: Scenario, evaluation: Evaluation, candidate: Actor): string {
  const yielded = evaluation.candidate_yields_to.map((id) => scenario.actors.find((actor) => actor.id === id));
  const labels = yielded.filter((actor): actor is Actor => actor !== undefined).map((actor) => actorLabel(actor, candidate));
  if (labels.length === 0) {
    return "U hoeft niemand voor te laten gaan.";
  }
  const named = labels.map((label) => `${label === "voorrangsvoertuig" ? "het" : "de"} ${label}`);
  if (named.length === 1) {
    return `U moet ${named[0]} voor laten gaan.`;
  }
  return `U moet ${named.join(" en ")} voor laten gaan.`;
}

function mistakePool(scenario: Scenario, evaluation: Evaluation): string[] {
  const rules = new Set(evaluation.applied_rule_ids);
  const other = scenario.actors.find((actor) => !actor.is_candidate);
  const pool: string[] = [];
  if (rules.has("RVV-SIGNS-B1-B7")) {
    pool.push(
      other?.type === "tram"
        ? "De tram gaat altijd voor, ook achter bord B6 en haaientanden."
        : "Haaientanden en bord B6 gelden alleen voor auto's.",
    );
  }
  if (rules.has("RVV-18.1")) {
    pool.push("Een fietser op de fietsstrook hoeft u niet voor te laten gaan.");
  }
  if (rules.has("RVV-15.2a")) {
    pool.push("Een bestuurder van rechts gaat voor, ook vanaf een onverharde weg.");
  }
  if (rules.has("RVV-54")) {
    pool.push("Een uitrit is een gewoon kruispunt, dus bestuurders van rechts gaan voor.");
  }
  if (rules.has("RVV-18.2")) {
    pool.push("De lange bocht gaat voor op de korte bocht.");
  }
  if (rules.has("RVV-15.2b")) {
    pool.push("Een tram moet wachten, want u komt van rechts.");
  }
  if (rules.has("RVV-15.1")) {
    pool.push("U gaat rechtdoor, dus kruisend verkeer wacht op u.");
  }
  if (rules.has("RVV-50")) {
    pool.push("Een voorrangsvoertuig wacht, want u rijdt op de voorrangsweg.");
  }
  if (rules.has("RVV-49")) {
    pool.push("Een voetganger op een zebrapad wacht op bestuurders.");
  }
  if (rules.has("RVV-16")) {
    pool.push("U mag een militaire kolonne doorsnijden als u van rechts komt.");
  }
  if (rules.has("RVV-68")) {
    pool.push("Rood licht geldt alleen als er geen bestuurder van rechts komt.");
  }
  if (rules.has("RVV-82")) {
    pool.push("Een verkeersregelaar geldt alleen als het bord hetzelfde zegt.");
  }
  pool.push(
    "U hoeft niemand voor te laten gaan.",
    "U moet iedere andere bestuurder voor laten gaan.",
    "U mag tegelijk optrekken met de andere bestuurder.",
    "Alleen voetgangers hebben hier voorrang.",
    "Bestuurders van links gaan voor.",
  );
  return pool;
}

function placeCorrect(correct: string, mistakes: string[], salt: string): { options: string[]; correctIndex: number } {
  const wrong: string[] = [];
  for (const item of mistakes) {
    if (item !== correct && !wrong.includes(item)) {
      wrong.push(item);
    }
  }
  let filler = 1;
  while (wrong.length < 3) {
    const extra = `U kiest een volgorde die hier niet geldt (${filler}).`;
    filler += 1;
    if (extra !== correct && !wrong.includes(extra)) {
      wrong.push(extra);
    }
  }
  let hash = 0;
  for (const char of salt) {
    hash = (Math.imul(hash, 33) + char.charCodeAt(0)) >>> 0;
  }
  const correctIndex = hash % 4;
  const options = wrong.slice(0, 3);
  options.splice(correctIndex, 0, correct);
  return { options, correctIndex };
}

function explanation(scenario: Scenario, evaluation: Evaluation, candidate: Actor, move: string): string[] {
  const lines = [`U rijdt ${riding(candidate.type)} en ${move}.`];
  for (const ruleId of evaluation.applied_rule_ids) {
    lines.push(`${ruleId}: ${RULE_GLOSS[ruleId] ?? "Deze vrijgegeven regel beslist de volgorde."}`);
  }
  const order = evaluation.priority_order
    .map((id) => scenario.actors.find((actor) => actor.id === id))
    .filter((actor): actor is Actor => actor !== undefined)
    .map((actor) => (actor.is_candidate ? "u" : `de ${actorLabel(actor, candidate)}`));
  lines.push(`De volgorde om te gaan is: ${order.join(", daarna ")}.`);
  if (scenario.environment.traffic_lights === "active") {
    lines.push("RVV-64: Verkeerslichten gaan boven verkeerstekens die de voorrang regelen.");
  }
  if (scenario.infra.intersection_type === "roundabout") {
    lines.push("RVV-47 en RVV-48 laten een andere plaats op de rijbaan en rechts inhalen toe. Zij wijzen geen voorrang toe.");
  }
  const place = roadPosition(scenario);
  if (place) {
    for (const ruleId of place.ruleIds) {
      lines.push(`${ruleId}: ${place.text}`);
    }
  }
  return lines;
}

function gapLine(gap: string): string {
  if (gap === "RVV-82") {
    return "RVV-82: er is een verkeersregelaar, maar geen aanwijzing per bestuurder.";
  }
  if (gap === "RVV-64") {
    return "RVV-64: de lichten zijn actief, maar er is geen kleur per bestuurder.";
  }
  if (gap === "RVV-68-both-stop") {
    return "RVV-68: beide bestuurders moeten stoppen. Daaruit volgt geen volgorde om te gaan.";
  }
  if (gap === "RVV-82-both-stop") {
    return "RVV-82: beide bestuurders moeten stoppen. Daaruit volgt geen volgorde om te gaan.";
  }
  if (gap === "RVV-50-two") {
    return "RVV-50: twee voorrangsvoertuigen. De tekst wijst geen onderlinge volgorde aan.";
  }
  if (gap === "RVV-16-two") {
    return "RVV-16: twee militaire kolonnes. De tekst wijst geen onderlinge volgorde aan.";
  }
  if (gap === "b3-b4-b5-diagram") {
    return "b3-b4-b5-diagram: dit bord krijgt in deze toestand geen voorrangsplicht.";
  }
  return `${gap}: hieruit volgt geen volgorde.`;
}

export function narrateScenario(scenario: Scenario, evaluation: Evaluation): Narration {
  const parsedScenario = ScenarioSchema.parse(scenario);
  const parsedEvaluation = EvaluationSchema.parse(evaluation);
  const candidate = parsedScenario.actors.find((actor) => actor.is_candidate);
  if (!candidate) {
    throw new Error("Scenario heeft geen kandidaat.");
  }
  if (parsedEvaluation.gaps.length > 0) {
    return NarrationSchema.parse({
      question: "Deze situatie geeft geen volgorde. Wat doet u?",
      options: [
        "U wacht. De ontbrekende aanwijzing, kleur of regel wijst geen volgorde aan.",
        "U rijdt door, want een ontbrekend gegeven telt niet.",
        "U laat alleen verkeer van rechts voorgaan.",
        "U behandelt de situatie als een uitrit.",
      ],
      correctIndex: 0,
      explanation: parsedEvaluation.gaps.map((gap) => gapLine(gap)),
    });
  }
  const move = maneuver(parsedScenario, candidate);
  const question = `U rijdt ${riding(candidate.type)} en ${move}. Wie moet u voor laten gaan?`;
  const correct = correctText(parsedScenario, parsedEvaluation, candidate);
  const placed = placeCorrect(correct, mistakePool(parsedScenario, parsedEvaluation), `${question}|${parsedEvaluation.applied_rule_ids.join(",")}`);
  return NarrationSchema.parse({
    question,
    options: placed.options,
    correctIndex: placed.correctIndex,
    explanation: explanation(parsedScenario, parsedEvaluation, candidate, move),
  });
}

export function narratePosition(scenario: Scenario): Narration | null {
  const place = roadPosition(ScenarioSchema.parse(scenario));
  if (!place) {
    return null;
  }
  const wrong = [
    "U rijdt op het verplichte fietspad, ook als dat bord alleen G11 is.",
    "U houdt het midden van de rijbaan aan.",
    "U gebruikt het trottoir omdat u langzaam rijdt.",
  ];
  return NarrationSchema.parse({
    question: "Welke plaats op de weg schrijft het reglement u voor?",
    options: [place.text, ...wrong],
    correctIndex: 0,
    explanation: place.ruleIds.map((ruleId) => `${ruleId}: ${place.text}`),
  });
}

export function narrateHazard(scenario: Scenario): Narration | null {
  const parsed = ScenarioSchema.parse(scenario);
  const candidate = parsed.actors.find((actor) => actor.is_candidate);
  if (!candidate) {
    return null;
  }
  const blocked = parsed.environment.obstructions.length > 0;
  const icy = parsed.environment.road_condition === "icy";
  const wetFast = parsed.environment.road_condition === "wet" && candidate.speed_kmh >= 45;
  if (!blocked && !icy && !wetFast) {
    return null;
  }
  const reason = icy
    ? "Het wegdek is glad."
    : blocked
      ? "Een obstakel beperkt het vrije zicht."
      : "De weg is nat en uw snelheid is hoog.";
  return NarrationSchema.parse({
    question: `${reason} Wat eist artikel 19 van u?`,
    options: [
      "U moet kunnen stoppen binnen de afstand die u overziet en die vrij is.",
      "Een hulpsysteem houdt de volgafstand aan, dus u hoeft niet te remmen.",
      "Geel knipperlicht wijst u de voorrang toe.",
      "U mag doorrijden zolang u binnen de bebouwde kom blijft.",
    ],
    correctIndex: 0,
    explanation: [
      "RVV-19: De bestuurder moet in staat zijn zijn voertuig tot stilstand te brengen binnen de afstand waarover hij de weg kan overzien en waarover deze vrij is.",
      "Dit is een oefening over artikel 19. Het is geen voorrangsuitspraak.",
    ],
  });
}
