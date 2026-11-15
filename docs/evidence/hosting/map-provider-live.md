# Hosted map-provider activation

Gilir's web service deployed `16f1652ff4a6f3e72a3927008b9418c141104dd0` on 15 November 2026. This is the reviewed and merged [PR #50](https://github.com/Quantomz/nefalos_nasa_hackathon/pull/50), including the earlier Docker build-argument fix. [The public website](https://gilir-web-production.up.railway.app/) now loads the configured map provider and linked logo.

## Release identity

The [Railway read-back](map-provider-2026-11-15/release.json) records web deployment `b8e81057-b40d-4f6c-8df7-e50220191b7e` as SUCCESS at 10:33:49 UTC. The image digest is `sha256:ec5bee09e346eae38dbfaf52a5e314bb4b3a465e45419daaf059eb1595d01a75`. Runtime logs show Next.js listening on port 8080 and ready. No staged changes remain.

| Service | Pinned commit | Action in this release |
| --- | --- | --- |
| Web | `16f1652ff4a6f3e72a3927008b9418c141104dd0` | Rebuilt and deployed with the configured public browser key. |
| Worker | `ec2ef2255ba76d6383d81dad43ff98a70584a850` | Retained its existing source pin and settings. |
| Hourly cleanup | `ec2ef2255ba76d6383d81dad43ff98a70584a850` | Retained its source pin, hourly schedule, and restart policy. No manual restart. |

The application-source differences between these commits are confined to the three location files. Server code, scientific modules, contracts, migrations, scripts, and dependencies are unchanged. That comparison permits this web-only release while retaining the compatible backend. PostgreSQL configuration and networking were not changed.

## Public checks

The [HTTP record](map-provider-2026-11-15/http.json) confirms `/` and `/api/catalogue` return 200, `/dev/fixtures` returns 404, and the catalogue contains 40 entries. `/maptiler-logo.svg` returns 200 with SHA-256 `c2fef38a1e77e9ff774dc1b21a2e931c81eab12191395be726c594404e4bf332`, matching the reviewed asset.

The owner changed the single public key to allow only `gilir-web-production.up.railway.app`. The [origin checks](map-provider-2026-11-15/origins.json) returned 200 for production TileJSON and search, and 403 for localhost, an unknown origin, and a request without an origin. The browser key remains public by design; its value is absent from this evidence.

The browser checks used the actual public homepage, fresh browser storage, installed Chrome, and viewports of 360 by 800 and 1280 by 800 CSS pixels. NASA GIBS and MapTiler responses were real. No provider response was mocked, and no trace, HAR, or video was retained. Screenshots use synthetic test fields near the public place Indramayu.

The [phone globe](map-provider-2026-11-15/live-home-globe-360.png) and [rotated view](map-provider-2026-11-15/live-home-globe-rotated-360.png) show NASA imagery and camera movement. Submitted place search returned Indramayu, and the marked field loaded real satellite imagery with the linked logo. A separate [browser key check](map-provider-2026-11-15/browser-key-check.json) confirmed both widths used the configured public key without recording its value.

The [map interaction report](map-provider-2026-11-15/map-interactions.json) records the final settled-camera checks:

| Width | Field width before / zoomed / restored | Corner drag | Provider responses |
| --- | --- | --- | --- |
| 360 px | 96 / 194 / 96 px | Only corner 1 changed; displayed area changed from about 1 to 1.3 hectares. | 10 NASA images, 103 MapTiler images, one TileJSON, one search, zero failed HTTP responses. |
| 1280 px | 122 / 246 / 122 px | Only corner 1 changed; displayed area changed from about 1 to 1.2 hectares. | 9 NASA images, 156 MapTiler images, one TileJSON, one search, zero failed HTTP responses. |

Both runs observed zero page errors. These are observed response counts, not unique tile counts or quota charges. They do not count requests that produced no HTTP response. Visual inspection separately confirmed rendered imagery and the logo in the [phone before](map-provider-2026-11-15/field-before-drag-360.png) and [after](map-provider-2026-11-15/field-after-drag-360.png) images and [desktop before](map-provider-2026-11-15/field-before-drag-1280.png) and [after](map-provider-2026-11-15/field-after-drag-1280.png) images.

The probe waits for camera movement to settle and refreshes its pointer target after screenshots. It checks visible corner coordinates and field area, rather than requiring the weather lookup point to move. The picker intentionally preserves an existing lookup point while it remains inside the edited field. In both final drags, one handle moved about 34 screen pixels, the other three stayed fixed, and the lookup remained valid and unchanged.

With WebGL2 disabled, both widths completed real place search, marking, coordinate editing, and the next step to crops. The [fallback report](map-provider-2026-11-15/fallback.json) records a loaded linked logo, four unobstructed corner numbers, and no horizontal overflow. The [phone fallback image](map-provider-2026-11-15/fallback-dark-360.png) shows the drawing, scale, numbers, and attribution in dark mode.

## Verification limits

These are hosted component and first-step onboarding checks. They do not complete I3's full planning, results, persistence, or PDF journey, and do not establish physical-phone touch or hardware compatibility. The [earlier API and worker release](current-release.md) retains its separate evidence; no new planning job was submitted for this frontend activation.

The desktop zoomed-in screenshot places the upper-right handle partly under a zoom-control label. The verified drag uses the unobstructed first corner. This check does not establish that every corner remains unobstructed at every zoom and camera position.

The [local logo verification](../F2/logo-2026-11-15.md) records the earlier tests, build, independent source review, and attribution fix. This page records the later deployment separately. The workflow used pstack at `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md` and the Railway skill. No MapTiler plan upgrade or billing change was made.
