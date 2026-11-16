// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createFsrsTracker, createMemoryStorage } from "../src/learning/fsrs_tracker.js";

const clock = new Date("2026-11-16T12:00:00Z");

function tracker(storage = createMemoryStorage()) {
  return createFsrsTracker({
    storage,
    now: () => new Date(clock.getTime()),
  });
}

describe("FSRS rule tracker", () => {
  it("raises the priority of a missed rule and schedules it next", () => {
    const practice = tracker();
    const before = practice.getRuleMastery().find((item) => item.ruleId === "RVV-54");
    practice.recordAttempt(["RVV-54"], false);
    const after = practice.getRuleMastery().find((item) => item.ruleId === "RVV-54");
    expect(before).toBeDefined();
    expect(after).toBeDefined();
    expect(after?.misses).toBe((before?.misses ?? 0) + 1);
    expect(after?.due).toBeGreaterThan(before?.due ?? 0);
    expect(after?.state).toBe("Learning");
    expect(practice.getNextFocusRule()).toBe("RVV-54");
  });

  it("restores the same next rule from storage", () => {
    const storage = createMemoryStorage();
    tracker(storage).recordAttempt(["RVV-54"], false);
    const restored = tracker(storage);
    expect(restored.getNextFocusRule()).toBe("RVV-54");
    expect(restored.getRuleMastery().find((item) => item.ruleId === "RVV-54")?.misses).toBe(1);
  });

  it("counts a correct answer without a lapse", () => {
    const practice = tracker();
    practice.recordAttempt(["RVV-15.1"], true);
    const rule = practice.getRuleMastery().find((item) => item.ruleId === "RVV-15.1");
    expect(rule?.reps).toBe(1);
    expect(rule?.lapses).toBe(0);
    expect(rule?.misses).toBe(0);
  });

  it("ignores rule ids outside the tracked set", () => {
    const practice = tracker();
    practice.recordAttempt(["RVV-82"], false);
    expect(practice.getRuleMastery().every((item) => item.misses === 0 && item.reps === 0)).toBe(true);
  });

  it("does not import sibling modules", () => {
    const source = readFileSync(new URL("../src/learning/fsrs_tracker.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/solver\/|generator\/|narrator\/|renderer\/|node:fs|node:path/);
  });
});
