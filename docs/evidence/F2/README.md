# F2 field picker browser evidence

## Live verification and the code it covered

The [15 November live verification](live-2026-11-15.md) ran all 17 real-provider cases successfully and inspected actual globe and satellite imagery. It verifies the component against live providers on localhost. It does not establish deployment, complete F2 attribution for a Free account, or complete I3's assembled farmer journey. Account-plan attribution and hosted activation remain separate checks.

That run tested the F2 code that PR #43 merged, from commit 34f58c1. The main commit it names, a0fba59, holds the same files under `src/features/location` and `tests/frontend/location`. This branch has changed F2 since then:

- **Positions.** A position with lat and lon labels is read, and a boundary typed back to its first corner is accepted. A position is also read when it is typed in Arabic-Indic, Persian, Devanagari, Bengali, Thai or full-width digits, with labels or hemispheres written as words in English, Indonesian, Spanish, German or Russian, or with a spaced dash between its numbers. Text is held back as unclear, not sent to the place search, when it has a number with its own sign and a decimal point, a label beside a decimal, two neighbouring decimals in range with one to 2 places, degrees and minutes, a pair with a mark on each number, a plus code, a what3words address, a grid reference, or a map link with or without https://. Of the review's 405 probe forms, no position or link reaches the place search. These are rules, not a proof: a position written some other way could still be sent. A name with an ordinal, a kilometre mark or a floor is still searched (2368ef8, 60dd52e, 67eebe1).
- **The globe.** It stays through a WebGL context that MapLibre restores. Only a context still lost after 3 seconds becomes the drawing, and focus on the map's buttons then moves to the corner list. The pictures notice judges only the pictures the current zoom draws (d014909, fac7779).
- **Layout.** The map, the answer to Search and a typed position stay in view. A strip of page stays below the map for a thumb to scroll by, and in two columns the map gives way to its credits (1ec7860, 06f2535). At a larger text size a narrow map's zoom buttons stand in a column of circles at its edge, and the camera frames a place or a field above the logo and any message, so every corner handle can be pressed (b804198).
- **Credits.** They name only what the map area shows: nothing on the drawing with no key, and the place search alone on the drawing with a key (ed074e4).
- **Smaller changes.** The location help names "the small icon beside the web address", the pin has one shape on both surfaces, and the jsdom cases call browser APIs directly (0cb6162, 4ec018b).
- **MapTiler's linked logo** is a teammate's work on main, PR #50 (16f1652), merged into this branch in 214982b. It is live-verified on main's code: see [the logo verification](logo-2026-11-15.md). This branch's own earlier logo (0b9dddb) was dropped in that merge.

This branch's own changes have fixture evidence and mocked evidence only. None of them is live-verified, and the logo is not live-verified together with them, until the live suite runs again with a key. This container cannot run it: it has no key, and its network proxy refuses api.maptiler.com and gibs.earthdata.nasa.gov. So the live result for this branch's code is **NOT RUN**, and each live case reports itself skipped as BLOCKED.

## Fixture and mocked runs

The runs below are **fixture evidence** or **mocked evidence**. They drive the real field picker in Chromium under `next dev`. A stand-in answers every request that would leave the machine (`tests/frontend/location/support/providers.ts`). NASA GIBS and MapTiler tiles are one synthetic 256 px checkerboard. MapTiler's logo is main's copy of MapTiler's own file, which the app serves at `/maptiler-logo.svg`, so it needs no stand-in. Place searches get canned answers for Indramayu, Labasa and Ushuaia. Every field the page shows is judged in Node by the contract's own parser, the server's own request handler, and an independent strictly-inside test. All shapes are synthetic test shapes, not farm data.

### What the tags in test titles mean

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

### Commands and results

Each command ran from the repository root on 15 November 2026, with Node 24 first on `PATH`. `env -u CLAUDECODE -u AI_AGENT` stops `next dev` from rewriting AGENTS.md. The runs used a local Playwright configuration that extends `playwright.config.ts` and starts its own dev server on port 3100, so it never reuses a server from another checkout. With the repository's own configuration, `CI=1` has the same effect.

| Key | Command | Observed | Kind |
| --- | --- | --- | --- |
| Pl, Pn | `env -u CLAUDECODE -u AI_AGENT -u NEXT_PUBLIC_MAPTILER_KEY PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test tests/frontend/location/lab.spec.ts tests/frontend/location/no-webgl.spec.ts` | 63 passed in 8.8 minutes ([fixture-runs.log](fixture-runs.log)). The fourth review traced the browser warning "Can't perform a React state update on a component that hasn't mounted yet" to Next's development hot reloader, which refreshes a page that is still loading when a project file changes. It is not F2's, and a production build has no hot reloader. | fixture evidence |
| Pm | `NEXT_PUBLIC_MAPTILER_KEY=pw-dummy-key env -u CLAUDECODE -u AI_AGENT PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test tests/frontend/location/provider.spec.ts` | 29 passed in 3.8 minutes ([mocked-runs.log](mocked-runs.log)) | mocked evidence |
| PL | `env -u CLAUDECODE -u AI_AGENT -u NEXT_PUBLIC_MAPTILER_KEY PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test tests/frontend/location/live.spec.ts` | 17 skipped ([live-blocked.log](live-blocked.log)). The skip in live.spec.ts gives the reason "BLOCKED: needs NEXT_PUBLIC_MAPTILER_KEY and network access to api.maptiler.com and gibs.earthdata.nasa.gov". | **NOT RUN** for this branch |
| V | `npx vitest run tests/frontend/location` | 10 files passed, 281 tests passed, none left as todo. The shell set no key, and the cases that need one stub it. | component tests |
| C | `env -u CLAUDECODE -u AI_AGENT npm run check` | exit 0. Typecheck passed. 81 files passed and 5 skipped. 1,459 tests passed and 33 skipped, none of them in tests/frontend/location. Module boundaries passed. | repository check |
| B | `env -u CLAUDECODE -u AI_AGENT npm run build` | exit 0. `/` and `/dev/fixtures` prerendered, and the MapLibre worker file was emitted. | production build |

The lab and no-WebGL files skip themselves when a key is set, and the provider file skips unless the key is `pw-dummy-key`. So the fixture runs and the mocked run each need their own dev server.

### Screenshots

Each screenshot is the viewport at the stated width, with the part under test scrolled into view. Next's development badge is hidden. The tests write them to the Playwright output folder, and they were then copied here. This round re-took the 11 screenshots that the merge of main and this round's fixes changed: the four no-webgl ones, page-one-largest-marked-360, page-one-search-answer-largest-360, and provider-close-ups-refused-360, provider-credits-360, provider-indramayu-box-360, provider-logo-normal-360 and provider-logo-largest-320. It added provider-logo-large-320 and provider-logo-large-1280, and removed provider-no-webgl-logo-360, whose case main's fallback-footer cases replace. The rest were kept. A new file inside the project makes `next dev` rebuild and refresh every open page, so the tests never write into this folder while they run. Playwright empties its output folder at the start of each run, so this copy step ran after each one:

```sh
for name in globe-360 globe-1280 lab-normal-360 lab-concave-1280 lab-dateline-360 lab-dateline-1280 page-one-360 \
  page-one-1280 page-one-marked-360 page-one-refused-360 page-one-refused-1280 lab-no-pictures-360 \
  no-webgl-fixture-360 no-webgl-dateline-360 no-webgl-largest-text-360 page-one-search-answer-largest-360 \
  page-one-largest-marked-360 page-one-typing-1280 no-webgl-typing-1280 provider-indramayu-box-360 provider-credits-360 \
  provider-close-ups-refused-360 provider-logo-normal-360 provider-logo-large-320 provider-logo-largest-320 \
  provider-logo-large-1280; do
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
| [no-webgl-fixture-360.png](no-webgl-fixture-360.png) | 360x740 | no-webgl [R14][R16] | fixture | WebGL off. The fixture on the 2D drawing with corners 1 to 4, a scale and north, and "A drawing, not a photo" below the drawing. |
| [no-webgl-dateline-360.png](no-webgl-dateline-360.png) | 360x740 | no-webgl [R14][R12][R11] | fixture | WebGL off. The Fiji field typed with the keyboard alone, drawn as one rectangle. |
| [no-webgl-largest-text-360.png](no-webgl-largest-text-360.png) | 360x740 | no-webgl [R22] | fixture | WebGL off, on F1's page 1 at F1's Largest text. The drawing fits with no sideways scroll. |
| [page-one-search-answer-largest-360.png](page-one-search-answer-largest-360.png) | 360x740 | lab [R16][R22] answer in view | fixture | Largest text, no key. "-6.326, 200" searched: "Longitude goes from -180 to 180." sits above F1's dock, and the box shows the whole typed position. |
| [page-one-largest-marked-360.png](page-one-largest-marked-360.png) | 360x740 | lab [R22] strip | fixture | Largest text, a box marked and the map at the top. The zoom buttons are circles in a column at the map's right edge. A strip of page about 52 px tall stays between the map and F1's dock, and a swipe there scrolls the page. |
| [page-one-typing-1280.png](page-one-typing-1280.png), [no-webgl-typing-1280.png](no-webgl-typing-1280.png) | 1280x800 | lab and no-webgl [R22] two columns | fixture | Corner 3's latitude being typed. The globe with its credit and privacy lines, and with WebGL off the drawing, stay in view on the right above F1's dock. The drawing has no map picture credit. |
| [provider-indramayu-box-360.png](provider-indramayu-box-360.png) | 360x740 | provider [R3] | mocked | A canned "Indramayu" answer chosen and "Mark my field" pressed. A 1 hectare box over the synthetic MapTiler tiles, with main's MapTiler logo in the map's bottom left. |
| [provider-credits-360.png](provider-credits-360.png) | 360x740 | provider [R5] | mocked | The credits line names NASA EOSDIS GIBS, © MapTiler and © OpenStreetMap contributors, without a press. Main's MapTiler logo sits on the map just above it. |
| [provider-close-ups-refused-360.png](provider-close-ups-refused-360.png) | 360x740 | provider [R16] refused key | mocked | NASA's pictures answer and MapTiler's are refused, as with a bad key. The world view showed NASA's pictures with no notice. On the field marked from there, "The map pictures didn’t load. …" shows. |
| [provider-logo-normal-360.png](provider-logo-normal-360.png), [provider-logo-large-320.png](provider-logo-large-320.png), [provider-logo-largest-320.png](provider-logo-largest-320.png), [provider-logo-large-1280.png](provider-logo-large-1280.png) | 360x740 Normal, 320x568 Large and Largest, 1280x600 Large | provider [R5][R22] corners reachable | mocked | F1's page 1 with a box marked from a typed position, and main's MapTiler logo in the map's bottom left. At Large and Largest text on a map under 36rem wide the zoom buttons are circles in a column at the right edge. The box sits above the logo, and no zoom button or logo touches a corner handle. |

No trace, video or HAR file is kept. No file here holds a key. The only key in any of these files is the dummy `pw-dummy-key`, in one test name in mocked-runs.log. The live verification's own files are in [live-2026-11-15](live-2026-11-15/).

## The card's criteria

| Card item | Evidence | Status |
| --- | --- | --- |
| Browser checks select a normal field, a concave field and a dateline fixture with an inside lookup point. | lab NORMAL, CONCAVE and DATELINE at 360 and 1280 px. no-webgl "Tab only: the U shape, then the Fiji corners". | passed, fixture evidence |
| Globe rotation, submitted place search, zoom, polygon edit and fallback controls work in a real configured browser. | live.spec.ts, all 17 cases listed below, in the [15 November live verification](live-2026-11-15.md). | passed live for the code at 34f58c1. **NOT RUN** for this branch's later code, BLOCKED here. |
| No key is required to run component tests or coordinate input. | V ran with no key set. lab and no-webgl ran with the key unset, and lab "[R16][R20] with no key the slot says so" sent nothing but NASA requests. | passed, fixture evidence |
| Public attribution is visible. | lab [R5] with no key, and provider [R5] with the stand-in key, both at 18 px or more without a press. With WebGL off the drawing shows no pictures, so no-webgl [R14][R16][R5] shows no picture credit and sends no picture request. MapTiler's linked logo is main's (#50): its picker.test.tsx case, its provider [R5] and [R5][R14] cases, and its live case 7, which [the logo verification](logo-2026-11-15.md) ran against real providers. This branch's provider [R5][R22] case checks the logo beside a marked box at four sizes. | text credits passed, fixture and mocked evidence, and live for the code at 34f58c1. The linked logo passed live on main's code (#50) and with mocked evidence on this branch. Live **NOT RUN** for this branch. |

These cases support the live criterion but never pass it, as the card says.

- **Fixture.** lab [R3] turns the globe by dragging, and zooms by mouse and by keyboard, over the synthetic tiles. Another lab [R3] case clicks in space beside the sphere: no place is chosen and a marked box stays put, while a click on the sphere still does both. lab [R22] checks that each next step is in view on F1's page 1, and that at Normal text at 900x700, Large at 1280x800 and Largest at both, the map stays at least 480 px wide and a press on each corner handle's centre reaches the handle. lab [R7] and [R7][R12] drag corners, add a corner and make a concave field. lab [R7] puts back a corner dragged across a side. lab [R15][R22] edits a corner with Tab alone. no-webgl shows the drawing, its explanation and the corner list.
- **Fixture, from the review's fixes.** lab [R14] keeps the globe when MapLibre restarts its busy workers on a return to the foreground, and when a lost WebGL context comes back. A context that stays lost becomes the drawing after a short wait, and focus on "Zoom in" moves to the corner list's heading. lab and no-webgl [R22] keep the map in view in two columns while corner 3 is typed, and lab [R22][R5] keeps the map with its credit and privacy lines between F1's bars at 1280x800 and 1280x600. lab [R22] leaves a strip at least 48 px tall between the map and F1's dock at Normal, Large and Largest text on a 360x740 phone, a 320x568 phone and a 740x360 phone on its side, and a touch swipe there scrolls the page. On its side at Largest text that leaves a map 73 px tall. lab [R16][R22] brings the answer to Search into view above F1's dock. lab [R20][R22] shows a whole typed position in the search box at Large and Largest text.
- **Mocked.** provider [R6] shows that typing sends nothing and Enter sends exactly one search. provider [R16] covers each search failure: refused (403), busy (429), no answer, past the time limit and no place found. Each shows its own words, and a typed position still marks a field afterwards. provider [R16] also refuses MapTiler alone, as with a bad key: the world view shows NASA's pictures with no notice, and the pictures notice shows on the marked field. With NASA refused and MapTiler answering, the notice shows at the world view and goes once the field's close-ups show. provider [R14][R16] shows the notice when the pictures fail after a lost WebGL context comes back. provider [R16][R22] brings the places found and a failed search into view above F1's dock. provider [R22][R5] keeps the map with the NASA and MapTiler credits and the privacy line between F1's bars in two columns at 1280x720 Normal and Large and at 1280x800 Large. provider [R25] shows that no request carries a coordinate of the field. provider [R5][R22], at 360x740 Normal, 320x568 Large and Largest, and 1280x600 Large text, shows main's linked logo in the map's bottom left on F1's page 1, and on a marked box a press on each corner's centre reaches its handle, with no zoom button or logo touching one and no layout problem. It failed in 3 of the 4 views before b804198. provider [R14][R5], with a key and WebGL off on a 740x360 phone at Large and Largest text, shows the box north up inside the drawing with a scale in metres. At eab36db that case showed "∞ km" and "NaN km". Main's [R5][R14] cases keep the drawing's corner numbers clear of its footer and scale.

The field also reaches F1. lab [R23] marks a U field on F1's page 1 at `/`. "Next: crops" opens page 2, and Back shows the same field from F1's draft. After a reload that hands the field back to F1 as its initial input, the same corners and lookup show again. A reload through saved answers is **NOT RUN**. F4's local storage reached this branch with the merge of main, but no F2 case reloads through it.

## Live cases

Each case below runs at 360 and 1280 px, except the last, which runs at 360 px. Each needs a MapTiler key restricted to the test origin and a network that reaches both providers, and runs with `F2_LIVE=1`. All 17 passed in the [15 November live verification](live-2026-11-15.md) for the code at 34f58c1 ([its log](live-2026-11-15/live-run.log)). Main's #50 made case 7 assert the linked logo and its loaded picture, and ran all 17 again against real providers ([its log](logo-2026-11-15/live-browser.log)). Here every case skips as BLOCKED ([live-blocked.log](live-blocked.log)), so for this branch they are **NOT RUN**.

1. [R19][R3] the globe shows NASA's Blue Marble far out and turns when dragged
2. [R19][R6] a submitted search for 'Indramayu' returns real places; choosing one moves the camera there
3. [R19][R1] submitted searches for 'Labasa' (Fiji) and 'Ushuaia' each return a place on the right side of the world
4. [R19][R3] 'Mark my field', then zoom to where single fields show in MapTiler's satellite pictures
5. [R19][R7] drag a corner, add a corner, remove a corner: the size words and data-lookup follow
6. [R19][R15] with the globe showing, the corner list still marks a typed field
7. [R19][R5] the provider credits and linked MapTiler logo are visible
8. [R19] the satellite TileJSON path in provider.ts answers 200, and its tile size and zoom range are what the map uses
9. [R19][R14] with WebGL off, a real submitted search still names the place, and 'Mark my field' plus the corner list mark a field on the drawing

## Limits

- The runs here use Chromium only, under `next dev`. None used `next start`, another browser or a real phone. The live verification used installed Google Chrome, also under `next dev`.
- Drags use a mouse pointer. One case swipes with touch events sent through Chromium's DevTools protocol. Touch on a real phone was not tried.
- The worker restart is forced by keeping MapLibre's worker busy and dispatching `visibilitychange`, and the context loss by `WEBGL_lose_context`. A real phone leaving and coming back to the page was not tried.
- "Use my location" has jsdom tests only. No browser here gave a position.
- The tile and search stand-ins follow the shapes provider.ts reads. They say nothing about what MapTiler or NASA really send. The live verification checked the satellite TileJSON path, its tile size and its attribution text (cases 7 and 8) for the code at 34f58c1, and those parts of provider.ts have not changed since.
- At Largest text on a 320x568 phone the zoom buttons' labels covered the top two corner handles of a marked box. 06f2535 made a partial overlap a full one, by shortening the map. b804198 fixes it at the sizes the provider case runs. Other sizes and text sizes rest on the same rule but were not each tried.
- Open, not fixed this round. In two columns on a short window the map gives its height to its credits: at 1280x600 Large text it is 190 px tall, and a box marked there has its handles close together because the camera frames it above the logo. A floor for the map hid the credits under F1's dock at Large text, so it was not kept.
- Open, not fixed this round. Between zoom 5 and 7, where NASA's and MapTiler's pictures both draw, "The map pictures didn’t load. …" shows when one source fails while the other's pictures fill the map.
- The position rules hold some addresses back as unclear, because they look the same as a position: a grid address whose two numbers both carry a hemisphere letter and read in range ("50 N 100 E Provo"), and two kilometre marks with one decimal joined by a comma or a dash ("KM 4.5 - 5.5 Jalan Raya"). With a key the message then offers the nearest town's name.
- The corner inputs ask for the full keyboard, because the iPhone decimal pad has no minus sign. No real iPhone was available to see it.
- On a phone on its side (740x360) F1's bars leave a band of 195, 166 and 137 px at Normal, Large and Largest text. To keep a strip of page to scroll by, the map is 131, 102 and 73 px tall there, too small to drag corners at Largest. The corner list still works, and so does holding the phone upright.
