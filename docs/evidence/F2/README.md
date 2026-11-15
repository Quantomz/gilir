# F2 field picker browser evidence

The later [15 November live verification](live-2026-11-15.md) ran all 17 real-provider cases successfully and inspected actual globe and satellite imagery. Account-plan attribution and hosted activation remain separate checks.

The original runs below are **fixture evidence** or **mocked evidence**. At the time of those runs, the live criterion was **BLOCKED** because that build container had no MapTiler key and its network proxy refused the provider hosts.

The runs drive the real field picker in Chromium under `next dev`. A stand-in answers every request that would leave the machine (`tests/frontend/location/support/providers.ts`). NASA GIBS and MapTiler tiles are one synthetic 256 px checkerboard. Place searches get canned answers for Indramayu, Labasa and Ushuaia. Every field the page shows is judged in Node by the contract's own parser, the server's own request handler, and an independent strictly-inside test. All shapes are synthetic test shapes, not farm data.

## What the tags in test titles mean

Test titles and this page tag each case with the card requirement it checks, from R1 to R26. Each tag means:

| Tag | Requirement |
| --- | --- |
| R1 | A farmer can find a place anywhere in the world. No country filter, and any latitude and longitude. |
| R2 | The map is MapLibre GL JS in its globe projection. |
| R3 | The globe turns and zooms, and the same page zooms in close enough to outline a field. |
| R4 | Tiles and search use the public browser key `NEXT_PUBLIC_MAPTILER_KEY`, and only provider requests carry it. |
| R5 | The map providers' credits are visible without a press. |
| R6 | A place search is sent on Search or Enter, never per keystroke. |
| R7 | The farmer draws and edits one closed polygon: move, add and remove corners. |
| R8 | Every emitted field is `[lng, lat]` corners with a lookup point inside, and passes the contract's parser. |
| R9 | Geometry uses only the installed Turf packages. |
| R10 | The area is shown as approximate. |
| R11 | A field across 180° is normalised before its lookup point is chosen. |
| R12 | A concave field gets a lookup point strictly inside. |
| R13 | The page says how the place was found and never implies field-level weather. |
| R14 | A 2D fallback works without WebGL2. |
| R15 | The coordinate and corner controls work by keyboard and screen reader. |
| R16 | No key, a failed search or no WebGL each leave usable controls and a visible explanation. |
| R17 | Provider access stays inside `src/features/location`. |
| R18 | Browser checks use a normal, a concave and a dateline fixture with a lookup point inside. |
| R19 | Rotation, search, zoom, polygon edit and fallback work in a real configured browser. This is the card's live criterion. |
| R20 | No key is needed for component tests or coordinate input. |
| R21 | The card's commands run, and their evidence is kept here. |
| R22 | The layout works at 360 px and on a desktop: no sideways scroll, 48 px targets, statuses in words. |
| R23 | A field comes back from the slot's `value` after navigation or a reload. |
| R24 | The browser refuses the same self-crossing shapes as the server. |
| R25 | No precise geometry, key or farm input reaches a log, a third party or git. |
| R26 | No word claims field-level weather or validated worldwide coverage. |

## Commands and results

Each command ran from the repository root on 15 November 2026, with Node 24 first on `PATH`. `env -u CLAUDECODE -u AI_AGENT` stops `next dev` from rewriting AGENTS.md. The runs used a local Playwright configuration that extends `playwright.config.ts` and starts its own dev server on port 3100, so it never reuses a server from another checkout. With the repository's own configuration, `CI=1` has the same effect.

| Key | Command | Observed | Kind |
| --- | --- | --- | --- |
| Pl, Pn | `env -u CLAUDECODE -u AI_AGENT -u NEXT_PUBLIC_MAPTILER_KEY PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test tests/frontend/location/lab.spec.ts tests/frontend/location/no-webgl.spec.ts` | 45 passed in 7.4 minutes ([fixture-runs.log](fixture-runs.log)) | fixture evidence |
| Pm | `NEXT_PUBLIC_MAPTILER_KEY=pw-dummy-key env -u CLAUDECODE -u AI_AGENT PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test tests/frontend/location/provider.spec.ts` | 10 passed in 2.3 minutes ([mocked-runs.log](mocked-runs.log)) | mocked evidence |
| PL | `env -u CLAUDECODE -u AI_AGENT -u NEXT_PUBLIC_MAPTILER_KEY PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test tests/frontend/location/live.spec.ts` | 17 skipped, each with the reason "BLOCKED: needs NEXT_PUBLIC_MAPTILER_KEY and network access to api.maptiler.com and gibs.earthdata.nasa.gov" ([live-blocked.log](live-blocked.log)) | **BLOCKED** |
| V | `npx vitest run tests/frontend/location` | 10 files passed, 263 tests passed, none left as todo. The same with `env -u NEXT_PUBLIC_MAPTILER_KEY`. | component tests |
| C | `env -u CLAUDECODE -u AI_AGENT npm run check` | exit 0. 66 files passed and 7 skipped. 1,075 tests passed, 29 skipped and 37 todo, none of them in tests/frontend/location. Module boundaries passed. | repository check |
| B | `env -u CLAUDECODE -u AI_AGENT npm run build` | exit 0. `/` and `/dev/fixtures` prerendered, and the MapLibre worker file was emitted. | production build |

The lab and no-WebGL files skip themselves when a key is set, and the provider file skips unless the key is `pw-dummy-key`. So the fixture runs and the mocked run each need their own dev server.

## Screenshots

Each screenshot is the viewport at the stated width, with the part under test scrolled into view. Next's development badge is hidden. The tests write them to the Playwright output folder, and they were then copied here. They come from the run before the logs above. The source changes between the two runs touched comments only, so the pages look the same. A new file inside the project makes `next dev` rebuild and refresh every open page, so the tests never write into this folder while they run. Playwright empties its output folder at the start of each run, so this copy step ran after each one:

```sh
for name in globe-360 globe-1280 lab-normal-360 lab-concave-1280 lab-dateline-360 lab-dateline-1280 page-one-360 \
  page-one-1280 page-one-marked-360 page-one-refused-360 page-one-refused-1280 lab-no-pictures-360 \
  no-webgl-fixture-360 no-webgl-dateline-360 no-webgl-largest-text-360 provider-indramayu-box-360 provider-credits-360; do
  find test-results -name "$name.png" -exec cp {} docs/evidence/F2/ \;
done
```

| File | Viewport | Case | Kind | What it shows |
| --- | --- | --- | --- | --- |
| [globe-360.png](globe-360.png), [globe-1280.png](globe-1280.png) | 360x740, 1280x800 | lab [R2] | fixture | F1's page 1 with no field yet. The globe projection shows the whole sphere, covered in the synthetic tile. |
| [lab-normal-360.png](lab-normal-360.png) | 360x740 | lab [R18][R23] NORMAL | fixture | The fixture field, about 119 hectares, with 4 corner handles and its lookup point inside. |
| [lab-concave-1280.png](lab-concave-1280.png) | 1280x800 | lab [R18][R12] CONCAVE | fixture | The U shape typed in the corner list. Its lookup point sits in the U's base, not in the gap. |
| [lab-dateline-360.png](lab-dateline-360.png), [lab-dateline-1280.png](lab-dateline-1280.png) | 360x740, 1280x800 | lab [R18][R11] DATELINE | fixture | The Fiji field across 180° drawn as one small rectangle in the middle of the map, not around the world. |
| [page-one-360.png](page-one-360.png), [page-one-1280.png](page-one-1280.png) | 360x740, 1280x800 | lab [R23] page 1 | fixture | The U field marked inside F1's page 1 at `/`, with F1's dock and "Next: crops". |
| [page-one-marked-360.png](page-one-marked-360.png) | 360x740 | lab [R22] next step in view | fixture | F1's page 1 right after "Mark my field" from a tap on the globe. The whole map and its 4 corner handles sit between F1's top bar and dock. |
| [page-one-refused-360.png](page-one-refused-360.png), [page-one-refused-1280.png](page-one-refused-1280.png) | 360x740, 1280x800 | lab [R22] next step in view | fixture | Corner 2 dragged across the opposite side. The corner is back, and "Two sides would cross, so the corner went back." shows on the map. |
| [lab-no-pictures-360.png](lab-no-pictures-360.png) | 360x740 | lab [R16] no pictures | fixture | NASA's pictures aborted. The globe shows its plain ocean and grid, and an L field typed in the corner list. |
| [no-webgl-fixture-360.png](no-webgl-fixture-360.png) | 360x740 | no-webgl [R14][R16] | fixture | WebGL off. The fixture on the 2D drawing with corners 1 to 4, a scale and north. |
| [no-webgl-dateline-360.png](no-webgl-dateline-360.png) | 360x740 | no-webgl [R14][R12][R11] | fixture | WebGL off. The Fiji field typed with the keyboard alone, drawn as one rectangle. |
| [no-webgl-largest-text-360.png](no-webgl-largest-text-360.png) | 360x740 | no-webgl [R22] | fixture | WebGL off, on F1's page 1 at F1's Largest text. The drawing fits with no sideways scroll. |
| [provider-indramayu-box-360.png](provider-indramayu-box-360.png) | 360x740 | provider [R3] | mocked | A canned "Indramayu" answer chosen and "Mark my field" pressed. A 1 hectare box over the synthetic MapTiler tiles. |
| [provider-credits-360.png](provider-credits-360.png) | 360x740 | provider [R5] | mocked | The credits line names NASA EOSDIS GIBS, © MapTiler and © OpenStreetMap contributors, without a press. |

No trace, video or HAR file is kept. No file here holds a key. The only key in any of these files is the dummy `pw-dummy-key`, in one test name in mocked-runs.log.

## The card's criteria

| Card item | Evidence | Status |
| --- | --- | --- |
| Browser checks select a normal field, a concave field and a dateline fixture with an inside lookup point. | lab NORMAL, CONCAVE and DATELINE at 360 and 1280 px. no-webgl "Tab only: the U shape, then the Fiji corners". | passed, fixture evidence |
| Globe rotation, submitted place search, zoom, polygon edit and fallback controls work in a real configured browser. | live.spec.ts, all 17 cases listed below. | **BLOCKED** |
| No key is required to run component tests or coordinate input. | V ran with no key set. lab and no-webgl ran with the key unset, and lab "[R16][R20] with no key the slot says so" sent nothing but NASA requests. | passed, fixture evidence |
| Public attribution is visible. | lab [R5] with no key, and provider [R5] with the stand-in key, both at 18 px or more without a press. | passed, fixture and mocked evidence |

These cases support the live criterion but never pass it, as the card says.

- **Fixture.** lab [R3] turns the globe by dragging, and zooms by mouse and by keyboard, over the synthetic tiles. Another lab [R3] case clicks in space beside the sphere: no place is chosen and a marked box stays put, while a click on the sphere still does both. lab [R22] checks that each next step is in view on F1's page 1, and that at Large and Largest text the map stays at least 480 px wide with no corner handle under a zoom button. lab [R7] and [R7][R12] drag corners, add a corner and make a concave field. lab [R7] puts back a corner dragged across a side. lab [R15][R22] edits a corner with Tab alone. no-webgl shows the drawing, its explanation and the corner list.
- **Mocked.** provider [R6] shows that typing sends nothing and Enter sends exactly one search. provider [R16] covers each search failure: refused (403), busy (429), no answer, past the time limit and no place found. Each shows its own words, and a typed position still marks a field afterwards. provider [R25] shows that no request carries a coordinate of the field.

The field also reaches F1. lab [R23] marks a U field on F1's page 1 at `/`. "Next: crops" opens page 2, and Back shows the same field from F1's draft. After a reload that hands the field back to F1 as its initial input, the same corners and lookup show again. A reload through saved answers is **NOT RUN**: local storage belongs to F4 and is not built yet, and `localPlans.load` throws on this branch.

## Original live cases, blocked at that run

Each case below runs at 360 and 1280 px, except the last, which runs at 360 px. Each needs a MapTiler key restricted to the test origin and a network that reaches both providers, and runs with `F2_LIVE=1`. Their bodies had not run against the real providers during the original evidence run. See the later live verification above for the successful run.

1. [R19][R3] the globe shows NASA's Blue Marble far out and turns when dragged
2. [R19][R6] a submitted search for 'Indramayu' returns real places; choosing one moves the camera there
3. [R19][R1] submitted searches for 'Labasa' (Fiji) and 'Ushuaia' each return a place on the right side of the world
4. [R19][R3] 'Mark my field', then zoom to where single fields show in MapTiler's satellite pictures
5. [R19][R7] drag a corner, add a corner, remove a corner: the size words and data-lookup follow
6. [R19][R15] with the globe showing, the corner list still marks a typed field
7. [R19][R5] the credits line holds every name in each provider's own TileJSON attribution, and MapTiler's logo rule is checked against its terms
8. [R19] the satellite TileJSON path in provider.ts answers 200, and its tile size and zoom range are what the map uses
9. [R19][R14] with WebGL off, a real submitted search still names the place, and 'Mark my field' plus the corner list mark a field on the drawing

## Limits

- Chromium only, under `next dev`. No run used `next start`, another browser or a real phone.
- Drags use a mouse pointer. Touch on a real phone was not tried.
- "Use my location" has jsdom tests only. No browser here gave a position.
- The tile and search stand-ins follow the shapes provider.ts reads. They say nothing about what MapTiler or NASA really send. Until live cases 7 and 8 run, the satellite TileJSON path, its tile size and its attribution text in provider.ts are unverified.
- The corner inputs ask for the full keyboard, because the iPhone decimal pad has no minus sign. No real iPhone was available to see it.
