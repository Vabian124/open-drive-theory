# Technical Specification: open-drive-theory (V0.1 – V1.0)

Seed prefix: `ODT-`. Repository name: `open-drive-theory`.

## 1. Seed & Identification Format

- Every generated scenario is uniquely reproducible via a seed string: `ODT-<SEED>-<CATEGORY>` (for example `ODT-84920-B`, `ODT-10492-AM`, `ODT-55310-A`).
- Categories: `B` (passenger car), `AM` (moped), `A` (motorcycle).

## 2. The 5-Layer Scenario Data Model (`src/schema/`)

Internal data is JSON validated by Zod. Hand-written cases and rule cards are YAML, loaded into the same schema.

Angles follow an OpenDRIVE-style arm, not a hardcoded compass label. In the default screen orientation used by the golden cases:

- `0` = south / bottom (typical candidate entry)
- `90` = west / left
- `180` = north / top
- `270` = east / right

Arbitrary angles are allowed. The solver uses relative headings and crossing connectors, never the words north or east.

### Layer 1: `infra` (geometry and road surface)

- `intersection_type`: `"four_way" | "t_junction" | "exit_construction"` (V2.0 adds `"roundabout"`)
- `arms`: array of branches
  - `arm_id`: string (for example `"arm_0"`)
  - `angle_deg`: number
  - `surface`: `"paved" | "unpaved"` (OSM `surface`)
  - `curb_type`: `"standard" | "beveled"` (`"beveled"` means a continuous sidewalk / exit construction)
  - `cycleway`: `"none" | "lane" | "track"` (`"lane"` is a fietsstrook on the carriageway; `"track"` is a separated cycle track)
- `connectors`: array of `{ from_arm, to_arm, turn: "straight" | "right" | "left" }`

`curb_type: "beveled"` is a legal-visual fact. The renderer must draw the continuous sidewalk and entrance blocks, and the solver may treat the arm as an exit only when that cue is present.

### Layer 2: `static_signs` (signs and road markings)

OSM-style codes. Verified file names on Wikimedia Commons for the import script are `Nederlands_verkeersbord_B6.svg`, `Nederlands_verkeersbord_B7.svg`, and `Nederlands_verkeersbord_G12a.svg`. Other `NL:*` codes follow the same pattern but are not all verified yet.

- `signs`: array of `{ arm_id, code, sub_sign? }`
  - `code`: `"NL:B1" | "NL:B3" | "NL:B4" | "NL:B5" | "NL:B6" | "NL:B7" | "NL:G11" | "NL:G12a"`
  - `sub_sign`: optional, for example `"uitgezonderd motorfietsen"`
- `markings`: array of `{ arm_id, type }`
  - `type`: `"give_way_triangles" | "stop_line" | "crosswalk" | "continuous_line"`

A generator must reject `NL:B1` together with `give_way_triangles` on the same arm.

### Layer 3: `environment`

- `traffic_officer`: boolean (default `false`)
- `traffic_lights`: `"none" | "active" | "flashing_amber"`
- `built_up_area`: boolean
- `road_condition`: `"dry" | "wet" | "icy"` (used from V1.5)
- `obstructions`: array of `{ type: "building" | "parked_truck" | "hedges", near_arm }`

### Layer 4: `actors`

- `id`, `type`: `"car" | "motorcycle" | "moped" | "tram" | "cyclist" | "pedestrian" | "emergency" | "military_column" | "funeral_procession"`
- `from_arm`, `to_arm`, `speed_kmh`
- `is_candidate`: boolean. Exactly one actor is the candidate.
- `signal`: optional `"red" | "amber" | "green"`
- `officer_order`: optional `"stop" | "go"`

### Layer 5: `evaluation` (written only by `src/solver/`)

- `gaps`: named gaps when a verified duty cannot produce an order
- `priority_order`: actor ids, first to go through last to go
- `candidate_yields_to`: actor ids the candidate must let pass first
- `applied_rule_ids`: ids from `rules/`

The narrator builds the Dutch question, the options, and the study panels for position, speed, and hazard. Those texts are not fields of `evaluation`.

The solver reads layers 1–4 and writes layer 5. The renderer reads layers 1–4 and does not import the solver.

## 3. Statutory rules (`rules/`)

The segmented text of RVV 1990 (`BWBR0004825`) belongs in `rules/rvv_1990.yaml`, produced from the statute rather than from memory.

`rules/rvv_1990.yaml` quotes BWBR0004825, toestand 2026-07-01. `rules/rvv_1990.example.yaml` stays the archive. A card with `verified: false` does not invent a duty. An officer without a gesture and active lights without a colour return a gap. Sentences wrapped in `[EXAMPLE]` are not quotations. Two ids are fixed against the statute and must not be swapped:

- `RVV-15.2a` — article 15 lid 2 onder a: a driver on an unpaved road yields to a driver on a paved road.
- `RVV-15.2b` — article 15 lid 2 onder b: a driver yields to the driver of a tram.

## 4. What stays undecided

The live cards quote the duties they implement, including articles 63, 64, 82, and 84, and article 30 as a light that assigns no yield. These points still have no card, and the solver must not invent them:

- A metre threshold for a paved apron on a sand road, and for “same road” beside a separated cycle track.
- The individual Bijlage 1 wording of sign series A, C, D, and F. `NL:B2` and `NL:C1` are public-domain assets, and the scenario schema does not accept them until a card states their duty.
- Articles 62 and 76–81, beyond the haaientanden sentence of article 80 that the sign card already quotes.
