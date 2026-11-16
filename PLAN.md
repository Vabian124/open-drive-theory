# Implementation Roadmap: open-drive-theory

## Phase V0.1 — Headless Engine & Golden Tests (Current Target)

- [x] **Step 1:** Initialize TypeScript config (`tsconfig.json`) and verify `npm test` runs cleanly with Vitest.
- [x] **Step 2:** Implement the 5-layer Zod schemas and inferred TypeScript types in `src/schema/scenario.ts`.
- [x] **Step 3:** Build a YAML loader in `src/schema/loader.ts` that parses `rules/rvv_1990.example.yaml` and `cases/golden_v1.yaml`.
- [x] **Step 4:** Implement trajectory conflict detection (`src/schema/geometry.ts`, shared by the solver and the generator) using `angle_deg` and `connectors` (relative approach: right, opposite, left, same road).
- [x] **Step 5:** Implement the deterministic priority solver (`src/solver/priority_solver.ts`) for the duties the golden cases actually lock, in this order: signs and markings (`RVV-SIGNS-B1-B7`), exit when the arm has `curb_type: "beveled"` (`RVV-54`), unpaved road (`RVV-15.2a`), tram (`RVV-15.2b`), traffic from the right (`RVV-15.1`), straight on the same road (`RVV-18.1`), short turn before long turn (`RVV-18.2`). If `traffic_officer` is true or `traffic_lights` is not `"none"`, emit an explicit gap. Those two cards are unverified and no golden case covers them.
- [x] **Step 6:** Wire up `tests/golden.test.ts` and iterate on `src/solver/` until every case in `cases/golden_v1.yaml` passes. Do not edit that file to make a test pass.

## Phase V0.2 — Seeded Generator & B / AM / A Narrator

- [x] **Step 7:** Implement a deterministic PRNG (`src/generator/prng.ts`) for seeds `ODT-<SEED>-<CATEGORY>`.
- [x] **Step 8:** Build the procedural generator (`src/generator/generate.ts`) with constraint checks (forbid `NL:B1` together with `give_way_triangles` on the same arm).
- [x] **Step 9:** Build the template narrator (`src/narrator/explain.ts`) for categories `B`, `AM`, and `A`, including distractors taken from `distractor_mistakes` rather than from an LLM.

## Phase V1.0 — 2D SVG Renderer, FSRS & Web Component

- [x] **Step 10:** Create `scripts/fetch-assets.ts` to normalize Wikimedia `NL:*` SVG signs into a `100x100` viewBox. The public-domain files live in `assets/` with `assets/manifest.json`, and the renderer embeds them from `src/renderer/official_signs.ts` (no filesystem access in the browser).
- [x] **Step 11:** Build the top-down SVG renderer (`src/renderer/svg_2d.ts`) from layers 1–4, including beveled curbs and unpaved texture.
- [ ] **Step 12:** Integrate `ts-fsrs` (`src/learning/fsrs_tracker.ts`) in `localStorage`, keyed by `applied_rule_ids`.
- [ ] **Step 13:** Build the exercise UI and the `<open-drive-theory-quiz>` web component, with a visible AGPL-3.0 section 13 source link and a control that exports the scenario JSON.

## Later, not in V0.1

- V1.5: short hazard-perception animations and ADAS questions, using `speed_kmh`, `road_condition`, and `obstructions`.
- V2.0: roundabout templates and an optional Three.js skin. The solver stays on layers 1–4.
