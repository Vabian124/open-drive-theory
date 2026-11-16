// SPDX-License-Identifier: AGPL-3.0-only
import { generate } from "../generator/generate.js";
import { formatSeed, parseSeed } from "../generator/prng.js";
import type { FsrsTracker } from "../learning/fsrs_tracker.js";
import { narrateScenario } from "../narrator/explain.js";
import { renderScenarioSvg } from "../renderer/svg_2d.js";
import type { RuleFile } from "../schema/rules.js";
import type { Category, Evaluation, Scenario } from "../schema/scenario.js";
import { solve } from "../solver/priority_solver.js";

export type QuizMode = "adaptive" | "random";

export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizView {
  seed: string;
  category: Category;
  mode: QuizMode;
  focusRuleId: string | null;
  scenario: Scenario;
  evaluation: Evaluation;
  svg: string;
  question: string;
  options: QuizOption[];
  correctOptionId: string;
  explanation: string[];
}

export interface QuizFeedback {
  correct: boolean;
  selectedOptionId: string;
  selectedAnswer: string;
  correctOptionId: string;
  explanation: string[];
  appliedRuleIds: string[];
}

export interface BugReport {
  seed: string;
  scenario: Scenario;
  evaluation: Evaluation;
  selectedAnswer: string | null;
}

export interface QuizController {
  start(request: { category: Category; mode: QuizMode; seed?: string }): QuizView;
  answer(optionId: string): QuizFeedback;
  next(): QuizView;
  bugReport(): BugReport;
}

interface CurrentQuestion {
  view: QuizView;
  selected: QuizOption | null;
  feedback: QuizFeedback | null;
}

export function createQuizController(options: {
  rules: RuleFile;
  tracker: FsrsTracker;
  tokens?: () => string;
}): QuizController {
  const { rules, tracker } = options;
  let sequence = 0;
  const tokens =
    options.tokens ??
    ((): string => {
      sequence += 1;
      return `Q${sequence.toString(36)}${Date.now().toString(36)}`;
    });
  let preferredCategory: Category = "B";
  let mode: QuizMode = "adaptive";
  let current: CurrentQuestion | null = null;

  function present(category: Category, nextMode: QuizMode, seed: string | undefined): QuizView {
    const resolved = seed ?? formatSeed(tokens(), category);
    const parsed = parseSeed(resolved);
    const focusRuleId = nextMode === "adaptive" ? tracker.getNextFocusRule() : null;
    const scenario = focusRuleId ? generate(parsed.raw, focusRuleId) : generate(parsed.raw);
    const evaluation = solve(scenario, rules);
    const narration = narrateScenario(scenario, evaluation);
    return {
      seed: parsed.raw,
      category: parsed.category,
      mode: nextMode,
      focusRuleId,
      scenario,
      evaluation,
      svg: renderScenarioSvg(scenario),
      question: narration.question,
      options: narration.options.map((text, index) => ({ id: `opt-${index}`, text })),
      correctOptionId: `opt-${narration.correctIndex}`,
      explanation: narration.explanation,
    };
  }

  return {
    start(request): QuizView {
      preferredCategory = request.category;
      mode = request.mode;
      const view = present(request.category, request.mode, request.seed);
      current = { view, selected: null, feedback: null };
      return view;
    },
    answer(optionId: string): QuizFeedback {
      if (!current) {
        throw new Error("Er is nog geen vraag.");
      }
      if (current.feedback && current.selected) {
        return current.feedback;
      }
      const option = current.view.options.find((item) => item.id === optionId);
      if (!option) {
        throw new Error(`Onbekende optie "${optionId}".`);
      }
      const correct = option.id === current.view.correctOptionId;
      tracker.recordAttempt(current.view.evaluation.applied_rule_ids, correct);
      const feedback: QuizFeedback = {
        correct,
        selectedOptionId: option.id,
        selectedAnswer: option.text,
        correctOptionId: current.view.correctOptionId,
        explanation: current.view.explanation,
        appliedRuleIds: [...current.view.evaluation.applied_rule_ids],
      };
      current = { view: current.view, selected: option, feedback };
      return feedback;
    },
    next(): QuizView {
      if (!current?.feedback) {
        throw new Error("Beantwoord de vraag eerst.");
      }
      const view = present(preferredCategory, mode, undefined);
      current = { view, selected: null, feedback: null };
      return view;
    },
    bugReport(): BugReport {
      if (!current) {
        throw new Error("Er is nog geen vraag.");
      }
      return {
        seed: current.view.seed,
        scenario: current.view.scenario,
        evaluation: current.view.evaluation,
        selectedAnswer: current.selected?.text ?? null,
      };
    },
  };
}
