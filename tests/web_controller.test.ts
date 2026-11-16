// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createFsrsTracker, createMemoryStorage } from "../src/learning/fsrs_tracker.js";
import { loadRuleFile } from "../src/schema/loader.js";
import { createQuizController, type QuizMode } from "../src/web/controller.js";
import type { Category } from "../src/schema/scenario.js";

const rules = loadRuleFile();

function quiz(mode: QuizMode = "adaptive") {
  let token = 0;
  const storage = createMemoryStorage();
  const tracker = createFsrsTracker({
    storage,
    now: () => new Date("2026-11-16T12:00:00Z"),
  });
  const controller = createQuizController({
    rules,
    tracker,
    tokens: () => {
      token += 1;
      return `T${token}`;
    },
  });
  return { controller, tracker, mode };
}

describe("quiz controller", () => {
  it.each(["B", "AM", "A"] as const)("grades, updates FSRS, exports a report, and advances for %s", (category: Category) => {
    const { controller, tracker } = quiz();
    const first = controller.start({ category, mode: "adaptive" });
    expect(first.category).toBe(category);
    expect(first.options.map((option) => option.id)).toEqual(["opt-0", "opt-1", "opt-2", "opt-3"]);
    expect(new Set(first.options.map((option) => option.text)).size).toBe(4);
    expect(first.svg).toContain("<svg");
    expect(first.evaluation.applied_rule_ids.length).toBeGreaterThan(0);
    expect(first.focusRuleId).toBeTruthy();

    const wrong = first.options.find((option) => option.id !== first.correctOptionId);
    expect(wrong).toBeDefined();
    const feedback = controller.answer(wrong?.id ?? "");
    expect(feedback.correct).toBe(false);
    expect(feedback.appliedRuleIds).toEqual(first.evaluation.applied_rule_ids);
    expect(feedback.appliedRuleIds).toContain(tracker.getNextFocusRule());

    const report = controller.bugReport();
    expect(Object.keys(report).sort()).toEqual(["evaluation", "scenario", "seed", "selectedAnswer"]);
    expect(report.seed).toBe(first.seed);
    expect(report.scenario).toEqual(first.scenario);
    expect(report.evaluation).toEqual(first.evaluation);
    expect(report.selectedAnswer).toBe(wrong?.text);

    const following = controller.next();
    expect(following.seed).not.toBe(first.seed);
    expect(following.category).toBe(category);
    expect(following.focusRuleId).toBe(tracker.getNextFocusRule());
    expect(following.options).toHaveLength(4);
  });

  it("keeps a supplied seed and can run in random mode", () => {
    const { controller } = quiz("random");
    const view = controller.start({ category: "B", mode: "random", seed: "ODT-84920-B" });
    expect(view.seed).toBe("ODT-84920-B");
    expect(view.focusRuleId).toBeNull();
    expect(view.svg).toContain('data-candidate="true"');
  });

  it("records a correct answer without treating it as a lapse", () => {
    const { controller, tracker } = quiz();
    const view = controller.start({ category: "A", mode: "adaptive" });
    const feedback = controller.answer(view.correctOptionId);
    expect(feedback.correct).toBe(true);
    const practiced = tracker.getRuleMastery().filter((item) => feedback.appliedRuleIds.includes(item.ruleId));
    expect(practiced.every((item) => item.reps === 1 && item.misses === 0)).toBe(true);
  });

  it("ships the shadow-dom widget, the source footer, and the page shell", () => {
    const element = readFileSync(new URL("../src/web/quiz-element.ts", import.meta.url), "utf8");
    const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const controller = readFileSync(new URL("../src/web/controller.ts", import.meta.url), "utf8");
    expect(element).toContain("attachShadow");
    expect(element).toContain("Aangedreven door open-drive-theory (AGPL-3.0)");
    expect(element).toContain("Bekijk broncode");
    expect(element).toContain("Meld twijfelgeval");
    expect(element).not.toMatch(/node:fs|node:path/);
    expect(controller).not.toMatch(/node:fs|node:path/);
    expect(page).toContain("<open-drive-theory-quiz");
    const source = readFileSync(new URL("../src/web/source.ts", import.meta.url), "utf8");
    expect(source).toContain("https://github.com/Vabian124/open-drive-theory");
    expect(source).not.toContain("PLACEHOLDER");
  });
});
