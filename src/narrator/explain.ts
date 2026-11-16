// SPDX-License-Identifier: AGPL-3.0-only
import { classifyTurn } from "../schema/geometry.js";
import { NarrationSchema, type Narration } from "../schema/narration.js";
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
  if (labels.length === 1) {
    return `U moet de ${labels[0]} voor laten gaan.`;
  }
  return `U moet de ${labels.join(" en de ")} voor laten gaan.`;
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
  return lines;
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
      question: "Deze situatie gebruikt een regel die nog niet is vrijgegeven. Wat doet u?",
      options: [
        "U wacht tot de ontbrekende regel is vastgesteld.",
        "U rijdt door, want een onbekende regel telt niet.",
        "U laat alleen verkeer van rechts voorgaan.",
        "U behandelt de situatie als een uitrit.",
      ],
      correctIndex: 0,
      explanation: parsedEvaluation.gaps.map((gap) => `Nog niet vrijgegeven: ${gap}.`),
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
