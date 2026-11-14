# FAO source comparison

**ISSUES** at E1 PR #33, commit `090626a6b172fb05901a5e4fafa15be497bcae7e`. The [source comparison](fao-source-comparison.json) distinguishes publication cells, observed implementation values and qualifications. It is an agent audit, not human or agronomist approval.

The source table maps all 86 latest profiles (42 crop purposes) to 71 Table 11 rows and 42 Table 12 rows. Each profile was checked for four stage lengths, printed total, historical allocation, planting months, source region label and three Kc values. Durations use days; Kc is dimensionless. All 258 coefficient selections agree with a row, inherited group value or published range. This does not validate their applicability at every farm.

The `support` counts are 67 supported, 14 qualified and 5 literal-source discrepancies, limited to those checked dimensions. The first release has 12 profiles: 11 supported and one qualified for its latitude-hemisphere interpretation. There are 229 profile instances across the four real releases; the source audit found their timing/Kc/applicability equal to the corresponding latest records. These are repeated instances of 86 profiles, not 229 independent scientific validations.

## Owner follow-up

| Item | Source comparison | Required clarification |
| --- | --- | --- |
| Sorghum | Stages sum to 125; total cell says 130. | Distinguish derived duration from published total. |
| Mung bean and cowpea | Stages sum to 100; total cell says 110. | Preserve the unresolved source conflict. |
| Eggplant | Stages sum to 140; total cell says 40. | Preserve the unresolved source conflict. |
| Idaho sweet maize | Late-cell `103` may mean 10 plus footnote 3. That interpretation gives total 100, versus printed 110. | Do not certify the interpretation as a literal match. |
| Dry faba | Generic 90/100-day rows coexist with a separately labelled 235-day dry row. | Establish dry-harvest applicability of the shorter rows; the longer row does not prove they are wrong. |
| Faba management | Kc 1.15 matches, but conditional tall-stalk guidance is absent. | Record the management qualification. |
| Sweet pepper | `25/30` initial days and April/June become 30 days and continuous April–June. | Explain the pairing and intervening May. |

E1 already warns about the conflicting totals. The concern is the meaning of `publishedDurationDays`, not proof that a particular corrected duration is agronomically right. Exact row locators and source facts are retained in the JSON. [FAO-56, Chapter 6, Tables 11–12](https://www.fao.org/4/x0490e/x0490e0b.htm)

Other qualifications include paired month/region interpretations, groundnut's ambiguous date layout, rainy-season labels without calendar months, harvest methods, initial-stage wetting, rice ponding, and climate adjustment. Each is recorded separately from numerical agreement. Geographic enforcement is examined in [the applicability note](applicability.md).

## Access and reproduction limits

Primary FAO HTML was inspected and its capture hash is recorded. A FAO-hosted reproduction was also visually inspected at printed AII-3 (PDF page 62) to check faba/groundnut layout. It reproduces the table; it is not a second independent agronomic experiment. [AquaCrop 4.0 annexes](https://www.fao.org/fileadmin/user_upload/faowater/docs/AquaCropV40Annexes.pdf#page=62)

Full publications and local browser captures are not bundled. Used factual cells, citations and comparisons are retained. The compact file stores only exceptional `checks`; `checkedFields` names the scope, and an empty exceptions array does not certify unlisted fields. `selectedImplementation` is an observation, not an expected-data oracle.
