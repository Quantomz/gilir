# Gilir

**Plan a year of crops, checked against 25 years of NASA weather.**

Gilir is our entry for the **NASA Space Apps Challenge 2026** hackathon, in the challenge
**[Field Shift: Adapting Farms with NASA Data](https://www.spaceappschallenge.org/2026/challenges/field-shift-adapting-farms-with-nasa-data/)**.

A farmer marks a field, picks the crops for the coming year and says when the field is ready.
Gilir replays each possible planting calendar against past seasons of NASA rainfall and weather for that place.
It answers with one planting calendar, the estimated harvest range for each crop and the weeks where rain fell short, or with the specific reason it cannot make a plan.

**Live site:** [gilir.up.railway.app](https://gilir.up.railway.app)

<p>
  <img src="docs/evidence/I3/hosted-2026-11-15/screenshots/1280-globe-visible.png" width="32%" alt="Step 1: a globe drawn with NASA Blue Marble imagery, showing Asia and Australia, with Zoom in and Zoom out buttons.">
  <img src="docs/evidence/I3/hosted-2026-11-15/screenshots/1280-field-after-drag.png" width="32%" alt="A field outline with four corner handles drawn over satellite imagery, with the map credits for NASA, MapTiler and OpenStreetMap below it.">
  <img src="docs/evidence/I3/release-32/result-360.png" width="16%" alt="A phone showing a real result: Your plan, with warnings. In past seasons, rain fell short of what the crops need in about 9 in 10 weeks. Estimated crop development from historical weather. These estimates have not been checked for your area. Rice (paddy), Wheat (grain) and Sweet maize (sweet corn), rain only.">
  <img src="docs/evidence/I3/release-32/timeline-360.png" width="16%" alt="The same result's timeline, headed Planting dates and estimated harvest ranges: three numbered crop bars across the twelve months of the year, with gaps marked After harvest, before the field is free.">
</p>

*The NASA globe and a test field over satellite imagery on the public site, then a real three-crop result from the current release: rice, sweet maize and wheat in one year.
The field is a test box at a public place in Bangkok, not a farm.*

## The problem

A crop can fit on the calendar and still meet dry weeks when it needs the most water.
Rainfall is shifting, and a planting date that worked for a farmer's parents may no longer be the safe one.
The record that could show this is public, but it comes as decades of daily numbers on a grid, which is no use to a farmer holding a phone in a field.

Gilir turns that record into one answer a farmer can read: what to plant, when, and what past seasons say to watch.

## What a farmer does

The interface is designed for accessibility, because farmers are on average an older group, and for low-cost phones in bright sun. There is no account, no sign-in and no landing page: the site opens on the first question.

1. **Where is your farm?** Turn the NASA globe or search for a place, then fit a box to the field. A position can be typed instead, and a list of corners works with no map at all.
2. **Which crops do you want to grow?** Pick from 32 food crops. Every plan includes every crop picked.
3. **Where does your water come from?** Rain only, rain plus backup water, or not sure.
4. **Your rotation.** The day the field is ready, and what grew there in the last 12 months. "I don't remember" is an accepted answer.

Then the farmer taps **Make my plan** and gets one of these:

| Result | What it means |
| --- | --- |
| Your plan | A planting calendar for the year that passed every check Gilir could run |
| Your plan, with warnings | A calendar that fits, with what fell short of a crop's needs in past seasons |
| We can't make a plan yet | Weather records or crop evidence are missing for this request, and the page says which |
| Your crops don't all fit in one year | No calendar fits, and the page says why |
| We couldn't finish the search | The search hit its limit first. This is not proof that the crops cannot fit |
| Something went wrong | The service failed. The farmer's answers are kept |

The result stays on the phone and reopens with no connection. It downloads as a PDF with the same plan, warnings and source period.

## Designed for accessibility

In much of the world farmers are, on average, older than most people who use apps. The interface is designed for older eyes and hands, which may not suit small text and small buttons.

| Need | What the interface does |
| --- | --- |
| Reading small text | Body text is 20 px and the smallest text is 18 px. A **Text size** setting offers Normal, Large and Largest, and spacing and buttons grow with it |
| Bright sun and weak contrast | Dark text on a light page, a **High contrast** setting with black text on white and thicker edges, and a dark theme that follows the phone |
| Reading is tiring or hard | A **Listen** button reads the page aloud. Sentences are short and plain, with one question per page |
| Tapping accurately | Main buttons are 64 px tall and no target is smaller than 48 px |
| Telling things apart without colour | Every status has an icon and words, and timeline bars differ by pattern, so they read in grayscale and in print |
| No mouse or no touch | Every step works by keyboard alone, with a visible focus ring |
| An old or cheap phone | The journey works with no WebGL through a drawing and a list of corners, and motion runs only when the phone allows it |

The body typeface is Atkinson Hyperlegible Next, which was drawn for legibility. The interface has not yet been tested with a screen reader or on a real low-cost phone.

## Where NASA data enters

| NASA data | Fields | What Gilir does with it |
| --- | --- | --- |
| [POWER](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) meteorology | `T2M`, `T2M_MIN`, `T2M_MAX`, `RH2M`, `WS2M`, `PS` | Temperature, humidity, wind and pressure for reference evapotranspiration, and daily temperature for each crop's estimated growth |
| POWER solar radiation | `ALLSKY_SFC_SW_DWN` | Solar energy for reference evapotranspiration |
| IMERG precipitation through POWER | `IMERG_PRECTOT` | Daily rainfall, compared with what each crop needs |
| [GIBS](https://nasa-gibs.github.io/gibs-api-docs/) Blue Marble imagery | Map tiles | The globe a farmer turns to find the farm |

Gilir fetches daily records for the field's grid cell and builds up to 25 past seasons from them. At least 15 complete seasons are required.
Daily temperatures set how fast each crop moves through its growth stages, so the same crop takes longer in a cool place than in a warm one, and each past season gives its own harvest date.
FAO-56 Penman-Monteith gives daily reference evapotranspiration, `ET0`, and crop coefficients give each crop's demand, `ETc = Kc × ET0`.
For each calendar and each past season, Gilir compares rainfall with crop demand in rolling seven-day windows, up to that season's estimated harvest.

Growth-stage heat requirements and temperature thresholds come from the [revised FAO-56 publication](https://openknowledge.fao.org/handle/20.500.14283/cd6621en), and crop coefficients from [1998 FAO-56 Table 12](https://www.fao.org/4/x0490e/x0490e0b.htm).
Every result records its sources, units, grid cell, missing days and method versions, and **View details** shows them.
A field outline does not make NASA's grid finer: every farm in the same cell shares the same records, and the page says so.
See [POWER's meteorological sources](https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/) and the [product definitions in the code](src/server/climate/products.ts).

## How a plan is chosen

The engine freezes the crop models, the weather records, the calculation settings and the farmer's answers.
It estimates each crop's growth for each planting date and each past season. A calendar grows one crop at a time, keeps the field until the latest estimated harvest among those seasons, adds seven days to prepare the field, and fits inside one year from the chosen date.
It prefers calendars without warnings, then compares candidates in one fixed order, lower winning. The farmer does not choose the order.

| Order | What Gilir compares |
| --- | --- |
| 1 | How often rain fell below estimated crop demand, in rolling seven-day windows |
| 2 | The average size of that shortfall |
| 3 | Days without a planned crop |
| 4 | The longest stretch without a planned crop |

Rainfall is the only water supply in the calculation. Saying there is backup water changes the explanation, never the numbers or the ranking.
The same request always gives the same result, and there is no language model in the running product.
A search that stops at its limit does not establish the best possible calendar, and the result says so.

## Try it

Open [gilir.up.railway.app](https://gilir.up.railway.app). On 15 November 2026 these inputs gave the results below on a local copy of the current release, with live NASA POWER data:

| Place | Crops | Field ready | Result |
| --- | --- | --- | --- |
| Bangkok, Thailand | Rice (paddy), Wheat (grain) and Sweet maize (sweet corn) | 1 December 2026 | Plan with warnings: rice from 2 February, sweet maize from 28 May, wheat from 28 August |
| Madrid, Spain | Barley (grain) and Lettuce | 1 March 2027 | Plan with warnings: lettuce from 1 March, barley from 29 July |
| Cairo, Egypt | Maize (grain) | 1 March 2027 | Plan with warnings: maize from 1 March |
| Sydney, Australia | Wheat (grain) | 1 March 2027 | Plan with warnings: wheat from 8 March |
| Helsinki, Finland | Rice (paddy) | 1 May 2027 | Your crops don't all fit in one year: no planting date lets rice finish inside the year |

Every crop in the catalogue has a model wherever the field is. Whether a crop can finish inside the year depends on the place's temperatures.
In the team's checks on recorded NASA data, all 32 crops had at least one workable planting date in Bangkok, Ibadan, Pretoria, Sydney and Cairo, 27 in Madrid and 5 in Helsinki.

## What is verified

| Evidence | What it establishes |
| --- | --- |
| [Global reference models](docs/evidence/global-models/README.md) | The 32 reviewed crop models, growth estimated from temperature, checks on recorded NASA data at seven places, and saved-result compatibility. The [release record](docs/evidence/global-models/verification.md) reports 1,849 passing tests with the database suites enabled |
| [Hosted acceptance](docs/evidence/I3/hosted.md) | On the public site at the earlier 40-crop release, 17 browser cases passed at phone and desktop widths on 15 November 2026: the full journey to a real result, reload during planning, a saved result reopened with the server refused, the PDF, keyboard-only use, no WebGL, missing crop evidence, and a refused request |
| [Assembled journey](docs/evidence/I3/README.md) | The same cases on a local run of the real stack, with screenshots, the downloaded PDFs and a recording |
| [Live runtime acceptance](docs/evidence/I1/README.md) | 28 checks with real NASA data, HTTP, PostgreSQL, separate workers and restart recovery, on the archived release |
| [Archived science cases](docs/evidence/I2/README.md) | Six actual-engine cases on recorded NASA observations, with identical hashes on repeat and an independent FAO calculation, on the earlier fixed-duration release |
| [Climate coverage](docs/evidence/X2/README.md) and [reference calculations](docs/evidence/X3/README.md) | More locations and independent metric examples |
| Interface evidence: [input flow](docs/evidence/F1/README.md), [field picker](docs/evidence/F2/README.md), [results](docs/evidence/F3/README.md), [saved work and PDF](docs/evidence/F4/README.md) | Browser runs of each part at 360 and 1280 px, with screenshots |

The hosted site runs a reviewed, pinned release, so it can be behind `main`. The [deployment record](docs/evidence/hosting/current-release.md) says which release is live.
Runtime, science and hosted evidence cover different paths: a local check does not establish deployment.
None of these checks establishes harvest success or an agronomist's approval. The test fields are illustrative places, not surveyed farms.

## Limits

- **Past seasons, not a forecast.** A plan compares calendars against history. It does not predict next season or a yield.
- **Reference estimates, not local advice.** The crop models estimate growth from temperature using FAO reference values. They have not been calibrated or validated locally, and the result page says "These estimates have not been checked for your area."
- **Reviewed by AI tools, not by an agronomist.** The 32 models were checked against their sources in an AI-assisted technical review. Eight more crops are withheld until their evidence is adequate.
- **Rain only.** The water check leaves out soil-water storage, runoff, irrigation volumes and the standing water a rice paddy needs. In our checks, every plan came back with a rainfall warning.
- **No frost or heat check.** Temperature drives estimated growth and evapotranspiration, but frost survival, heat injury, day length and soil suitability are not assessed.
- **Not measured.** Gilir does not measure soil health or assess pests and weeds. SMAP soil moisture, vegetation imagery and climate projections are not integrated.
- **English only**, with metric units.

The next data work is to resolve the eight withheld crops and to get field validation.

## Privacy

There is no account. The field's corners stay in the browser until the farmer asks for a plan.
A plan request is anonymous and protected by a random token sent in a header, never in an address.
The browser deletes its request from the server once it holds the result, and the server's cleanup removes finished requests after 24 hours.
Map pictures come from NASA and MapTiler, so they can see which area is being viewed, and the page says this beside the map.

## Run locally

Use Node.js 24 and Docker Compose. Run commands from the repository root.

```sh
git clone https://github.com/Quantomz/gilir.git
cd gilir
npm ci
cp .env.example .env
```

Edit `.env`. Choose a local `POSTGRES_PASSWORD` and an available `POSTGRES_PORT`, and match them in `DATABASE_URL` and `TEST_DATABASE_URL`. Keep credentials out of Git.

```sh
docker compose up -d --wait postgres
npm run migrate
npm run dev
```

In a second terminal, start the worker. It needs `WORKER_ID`; the example file's `GILIR_WORKER_ID` does not set it.

```sh
WORKER_ID=local-worker npm run worker
```

Open [http://localhost:3000](http://localhost:3000) and follow the four steps.
With no `NEXT_PUBLIC_MAPTILER_KEY`, the globe still shows NASA imagery and the farm is found by typing a position such as `13.75, 100.50`. The key adds place-name search and satellite close-ups.

Replay the archived science cases against committed NASA snapshots, with no database and no provider requests:

```sh
npx vitest run tests/integration/science
```

Run the repository checks, the production build and the browser journey on fixtures:

```sh
npm run check
npm run build
npx playwright test -c tests/integration/browser/playwright.config.ts
```

The same browser journey runs against the real stack with `I3_LIVE=1`; see the [journey evidence](docs/evidence/I3/README.md).
Database-backed suites need `TEST_DATABASE_URL`, `B3_TEST_DATABASE_URL` and `I1_TEST_DATABASE_URL`, and skip without them. The I1 suites need a dedicated database named `gilir_i1`; the [runtime guide](docs/evidence/I1/README.md#reproduce) describes it. The build downloads Google Fonts and needs network access.

## Architecture

```mermaid
flowchart LR
    Browser[Browser: four steps, result, saved copy, PDF] --> API[Next.js API]
    API --> Jobs[PostgreSQL jobs]
    Jobs --> Worker[Node worker]
    NASA[NASA POWER] --> Cache[Validated climate snapshots]
    Cache --> Worker
    Models[Versioned crop models and archived profiles] --> Engine[Deterministic engine]
    Worker --> Engine
    Engine --> Result[Plan or explicit no-plan result]
    Result --> Browser
```

React and Tailwind draw the interface, MapLibre draws the globe, and the result is stored in the browser's IndexedDB.
Jobs outlive HTTP requests, and frozen inputs and source identities keep retries reproducible.
See the [specification](spec.md), [contracts](docs/contracts.md), [build plan](docs/build-plan.md) and [contributor instructions](AGENTS.md). Planning documents keep some historical status.

## Team and acknowledgments

| Contributor | Work |
| --- | --- |
| [@kyusuku](https://github.com/kyusuku) | Backend, NASA ingestion, durable runtime, and deterministic search |
| [@yslee1106](https://github.com/yslee1106) | Crop registry, climate metrics, and scientific verification |
| [@Quantomz](https://github.com/Quantomz) | Farmer interface: field picker, the four steps, results, saved work, PDF and the browser journey tests |

Thanks to NASA POWER, IMERG, GIBS and FAO for the cited data and methods, and to MapTiler and OpenStreetMap contributors for place search and satellite close-ups.
Acknowledgment does not imply endorsement by NASA or anyone else. The team used AI-assisted development tools.

Code is licensed under [Apache 2.0](LICENSE). Referenced data and publications keep their own terms.
