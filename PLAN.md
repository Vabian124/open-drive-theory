# Implementation Roadmap: open-drive-theory

## Phase V0.1 — Headless Engine & Golden Tests (Current Target)

- [x] **Step 1:** Initialize TypeScript config (`tsconfig.json`) and verify `npm test` runs cleanly with Vitest.
- [x] **Step 2:** Implement the 5-layer Zod schemas and inferred TypeScript types in `src/schema/scenario.ts`.
- [x] **Step 3:** Build a YAML loader in `src/schema/loader.ts` that parses `rules/rvv_1990.example.yaml` and `cases/golden_v1.yaml`.
- [x] **Step 4:** Implement trajectory conflict detection (`src/schema/geometry.ts`, shared by the solver and the generator) using `angle_deg` and `connectors` (relative approach: right, opposite, left, same road).
- [x] **Step 5:** Implement the deterministic priority solver (`src/solver/priority_solver.ts`). The live cards are `rules/rvv_1990.yaml`, quoted from BWBR0004825 in the consolidation of 1 July 2026. An officer without a gesture per driver still returns gap `RVV-82`. Active lights without a colour per driver still return gap `RVV-64`. Flashing amber is article 75 and does not cancel signs. Above the older duties sit article 50 (priority vehicle; article 29 defines the signals, article 30 does not yield), article 49 lid 2 (crosswalk; lid 3 exempts a military column and a motor funeral), and article 16 (do not cut a military column or a motor funeral). Signs, shark teeth, lights, an officer and a priority vehicle still outrank that funeral. Article 9 only permits pedestrians to use the carriageway. Articles 20 and 21 set the moped limits and are not priority duties.
- [x] **Step 6:** Wire up `tests/golden.test.ts` and iterate on `src/solver/` until every case in `cases/golden_v1.yaml` passes. Do not edit that file to make a test pass.

## Phase V0.2 — Seeded Generator & B / AM / A Narrator

- [x] **Step 7:** Implement a deterministic PRNG (`src/generator/prng.ts`) for seeds `ODT-<SEED>-<CATEGORY>`.
- [x] **Step 8:** Build the procedural generator (`src/generator/generate.ts`) with constraint checks (forbid `NL:B1` together with `give_way_triangles` on the same arm).
- [x] **Step 9:** Build the template narrator (`src/narrator/explain.ts`) for categories `B`, `AM`, and `A`, including distractors taken from `distractor_mistakes` rather than from an LLM.

## Phase V1.0 — 2D SVG Renderer, FSRS & Web Component

- [x] **Step 10:** Create `scripts/fetch-assets.ts` to normalize Wikimedia `NL:*` SVG signs into a `100x100` viewBox. The public-domain files live in `assets/` with `assets/manifest.json`, and the renderer embeds them from `src/renderer/official_signs.ts` (no filesystem access in the browser).
- [x] **Step 11:** Build the top-down SVG renderer (`src/renderer/svg_2d.ts`) from layers 1–4, including beveled curbs and unpaved texture.
- [x] **Step 12:** Integrate `ts-fsrs` (`src/learning/fsrs_tracker.ts`) in `localStorage`, keyed by `applied_rule_ids`. Fuzz stays off. Node tests use an in-memory storage stand-in.
- [x] **Step 13:** Build the exercise UI and the `<open-drive-theory-quiz>` web component, with a visible AGPL-3.0 section 13 source link and a control that exports the scenario JSON.

## V1.5 — Gevaarherkenning

- [x] A five-second approach animation (`src/renderer/motion.ts`) when the road is icy, blocked, or wet at 45 km/h or more.
- [x] The study question cites article 19 from the 1 July 2026 text. It does not invent a following distance or an ADAS duty.

## V2.0 — Rotonde en optionele 3D-huid

- [x] Roundabout templates yield through bord B6 or haaientanden. Articles 47 and 48 only relax keep-right and allow passing on the right.
- [x] The Three.js skin (`src/web/mount_3d.ts`) loads after the button click. The solver still reads only layers 1–4.

## Publicatie

De bronlink wijst naar `https://github.com/Vabian124/open-drive-theory`. `.github/workflows/deploy.yml` bouwt met `npm run build` en publiceert `dist` naar GitHub Pages.
