// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generate } from "../src/generator/generate.js";
import { formatSeed } from "../src/generator/prng.js";
import { renderScenarioSvg } from "../src/renderer/svg_2d.js";
import { loadGoldenFile } from "../src/schema/loader.js";

const golden = loadGoldenFile();
const byId = new Map(golden.cases.map((item) => [item.id, item]));

function caseSvg(id: string): string {
  const item = byId.get(id);
  if (!item) {
    throw new Error(`Ontbrekende golden case ${id}`);
  }
  return renderScenarioSvg(item);
}

describe("svg renderer", () => {
  it("draws every golden case as scalable svg", () => {
    expect(golden.cases).toHaveLength(6);
    for (const item of golden.cases) {
      const svg = renderScenarioSvg(item);
      expect(svg.startsWith("<svg"), item.id).toBe(true);
      expect(svg, item.id).toContain('viewBox="0 0 800 800"');
      expect(svg, item.id).toContain("data-odt-signature=");
      expect(svg, item.id).toContain(">JIJ<");
      expect(renderScenarioSvg(item), item.id).toBe(svg);
    }
  });

  it("shows the exit sidewalk, unpaved texture, signs, shark teeth and tram rails", () => {
    const exit = caseSvg("example_case_03_exit_construction");
    expect(exit).toContain('data-curb="beveled"');
    expect(exit).toContain('data-cue="continuous-sidewalk"');
    expect(exit).toContain('data-cue="entrance-blocks"');

    const unpaved = caseSvg("example_case_04_unpaved_road");
    expect(unpaved).toContain('data-surface="unpaved"');
    expect(unpaved).toContain("unpaved-");

    const lane = caseSvg("example_case_02_straight_same_road_cyclist");
    expect(lane).toContain('data-cycleway="lane"');

    const signs = caseSvg("example_case_05_tram_equal_vs_signs");
    expect(signs).toContain('data-sign="NL:B1"');
    expect(signs).toContain('data-sign="NL:B6"');
    expect(signs).toContain('data-official="true"');
    expect(signs).toContain('data-marking="give_way_triangles"');
    expect(signs).toContain('data-actor="tram"');
    expect(signs).toContain('data-rails="tram"');
  });

  it("draws a separated cycle track when the arm says so", () => {
    const base = byId.get("example_case_01_equal_right");
    if (!base) {
      throw new Error("golden case ontbreekt");
    }
    const track = {
      ...base,
      infra: {
        ...base.infra,
        arms: base.infra.arms.map((arm, index) => (index === 0 ? { ...arm, cycleway: "track" as const } : arm)),
      },
    };
    const svg = renderScenarioSvg(track);
    expect(svg).toContain('data-cycleway="track"');
    expect(svg).toContain('data-cue="verge"');
  });

  it("renders 20 generated seeds without dropping the signature", () => {
    const categories = ["B", "AM", "A"] as const;
    for (let index = 0; index < 20; index += 1) {
      const seed = formatSeed(String(5000 + index), categories[index % categories.length] ?? "B");
      const svg = renderScenarioSvg(generate(seed));
      expect(svg, seed).toContain('viewBox="0 0 800 800"');
      expect(svg, seed).toContain("data-odt-signature=");
      expect(svg, seed).toContain('data-layer="infra"');
    }
  });

  it("stays free of node and sibling imports", () => {
    const source = readFileSync("src/renderer/svg_2d.ts", "utf8");
    expect(source).not.toMatch(/node:fs|node:path|solver|generator|narrator/);
  });
});
