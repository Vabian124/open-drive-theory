# open-drive-theory

Deterministische oefenengine voor de Nederlandse verkeerstheorie, categorieën auto (B), bromfiets (AM) en motor (A). De voorrang wordt berekend uit geometrie en regelkaarten. Een taalmodel beslist nooit wie er voor mag.

De broncode staat onder de [GNU Affero General Public License v3.0](LICENSE). Die licentie geeft geen recht op de projectnaam, het logo of de domeinen. Zie [TRADEMARKS.md](TRADEMARKS.md).

## Visie

Elke situatie is eerst data: een kruispunt, borden, omgeving en weggebruikers. Daaruit volgt een vaste uitkomst, een Nederlandse meerkeuzevraag en een bovenaanzicht. Dezelfde seed (`ODT-<SEED>-<B|AM|A>`) levert overal dezelfde situatie op.

## Vijf lagen

| Laag | Naam | Inhoud |
| --- | --- | --- |
| 1 | `infra` | Armen met hoek, verharding, band en fietsvoorziening |
| 2 | `static_signs` | Borden (`NL:B1` …) en wegmarkering |
| 3 | `environment` | Lichten, verkeersregelaar, kom, wegdek, obstakels |
| 4 | `actors` | Weggebruikers, waaronder precies één kandidaat |
| 5 | `evaluation` | Alleen de solver schrijft de volgorde en de regel-id's |

Hoeken lopen met de klok mee vanaf het zuiden: `0` onder, `90` links, `180` boven, `270` rechts. Het contract staat in [SPEC.md](SPEC.md). De bouwvolgorde staat in [PLAN.md](PLAN.md).

`src/schema/` is het enige gedeelde contract. Solver, generator, narrator en renderer importeren elkaar niet.

## Aan de slag

```bash
npm install
npm test
npm run typecheck
npm run dev
npm run build
npm run preview
```

`npm run dev` opent de oefenquiz. `npm run build` schrijft die naar `dist/`.

`npm run preview` schrijft `preview/index.html` met de zes golden cases. Dat HTML-bestand blijft buiten git.

Officiële borden en de wettekst opnieuw ophalen:

```bash
npm run fetch-assets
npm run fetch-law
```

## Wat er al staat

- V0.1: Zod-schema, voorrangssolver en `cases/golden_v1.yaml`.
- V0.2: seeded generator en Nederlandse vragen voor B, AM en A.
- V1.0a: bovenaanzicht in SVG, met de publiek-domein borden uit `assets/`.
- V1.0b: FSRS-leerloop per regel en de quiz `<open-drive-theory-quiz>`.

Regels met `verified: false` in `rules/rvv_1990.example.yaml` leveren een gat op, geen verzonnen plicht. De ruwe tekst van het RVV 1990 staat in `docs/law/` en is nog niet tot regelkaarten verwerkt.

## Bijdragen

- Laat `cases/golden_v1.yaml` ongemoeid, tenzij een maintainer daarom vraagt.
- Bepaal voorrang uit hoeken, banden, borden en de hiërarchie. Niet uit een scenario-id of een losse testcombinatie.
- Nieuwe TypeScript-bestanden beginnen met `// SPDX-License-Identifier: AGPL-3.0-only`.
- Een webinterface houdt een zichtbare broncode-link van AGPL-3.0 sectie 13.
- De grondwet voor wijzigingen staat in [.cursorrules](.cursorrules).
