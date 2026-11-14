# Applicability limits

The [captured probes](applicability-probes.json) exercised the public `resolveRegistry` entrypoint of E1 PR #33 at `090626a6b172fb05901a5e4fafa15be497bcae7e`, using the latest release. They used illustrative coordinates and artificial annual climate inputs. They are real resolver executions with synthetic inputs, not NASA observations or field trials.

| Coordinate (longitude, latitude) | Selected profile | Runs |
| --- | --- | --- |
| 8, 12 | Humid-Nigeria maize | Same selection in all three climate cases |
| 45, 5 | East-African highland maize | Same selection in all three climate cases |
| 80, 20 | Indian dry/cool-season maize | Same selection in all three climate cases |
| -119, 36 | Californian winter wheat | Same selection in all three climate cases |

The three cases were unavailable annual climate, synthetic -20 C/0 mm, and synthetic 45 C/10,000 mm. All 12 calls selected one profile without gaps. This shows that annual climate evidence did not change these regional selections. It does not establish the actual climate or elevation at the coordinates.

All 86 latest profiles use regional rectangles with empty exclusions. The lookup accepts coordinates and annual climate, but has no planting date, elevation, cultivar, harvest-management or frozen-soil input. Source-specific humid/highland/season/soil conditions therefore remain disclosures rather than enforced applicability gates. Approximate rectangles are E1-authored mappings, not published FAO boundaries. These are limits to the scope of validation; they do not by themselves prove that every selection is unsuitable.

All planting windows are recommendations. The engine constrains dates only for `hard_constraint` windows. A recommendation can supply candidate dates without forbidding others. This is implemented contract behavior. The audit does not convert indicative source planting months into mandatory constraints or invent climate/elevation cutoffs.

FAO's stage lengths are regional examples, and its coefficients have management and climate conditions. The source review records the relevant qualifications; numerical agreement alone cannot establish local suitability. [FAO-56 Chapter 6](https://www.fao.org/4/x0490e/x0490e0b.htm)

The probes were captured during X1 investigation. They are separate from the committed core numeric runner. No historical plan, warning fraction, live NASA cohort or end-to-end application was replayed here.
