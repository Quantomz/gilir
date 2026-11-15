# X1 temperature audit, partition A

The goal is to check whether the 13 assigned crop purposes have source-backed temperature rules that preserve the source's variable, exposure period, sensitive stage and applicability.

**ISSUES.** Subject is E1 PR #33 at `090626a6b172fb05901a5e4fafa15be497bcae7e`. Nineteen unique rules were examined. Fifteen have demonstrated operational mapping problems. Four Gourdji-based heat rules remain unverified because the original full text was inaccessible. Their accessible Teixeira co-citation also demonstrably uses different variables or numbers. No rule earns an exact source-backed pass in this slice.

The [JSON companion](x1-temperature-a.json) records every subject field, explicit source-comparison fields, precise primary URLs and sections, access observations, applicability, uncertainty and per-rule verdict. The subject inventory enumerated rules only. It was not an independent oracle. This is an independent agent audit, with no human or agronomist approval claim.

## Method and confidence

Read-only comparison against spec sections 3.3 and 5.3, `profiles.ts` and `sources.ts`. Full published articles or author repository copies were read for Teixeira, Vargas, Silva, Frederiks, Luo, Prasad 2015, Djanaguiraman, Sita, Bishop, Alharbi, Priya, Kaya and Hnilickova. Publisher abstracts were inspected for Brooking and groundnut 2000. Patel and Hall's complete abstract was exposed by the publisher's search index, but direct access returned 403. Abstract-only evidence does not certify unobserved methods.

Pstack used `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md`, its Investigation playbook and the assigned swarm partition. Throughput checkpoint is n/a for read-only investigation. No nested agents, profile edits, tests, full check, build or remote comments were performed. JSON syntax and 19-record coverage were inspected as artifact verification.

## Source-mapping acceptance issues and verification gaps

Spec 5.3 requires the exact supported variable, period and stage. An honest limitations paragraph documents a changed model but does not validate it. A tested treatment temperature, cultivar LT50 or field-site mean does not establish an isolated daily damage threshold.

Temperature does not affect fixed ranking under the spec. These findings concern warning accuracy and source-backed release acceptance. They do not establish that ranking changed.

| Rule ID | Outcome and specific source comparison |
| --- | --- |
| `maize-heat-mid-tmax-35` | Unverified overall. Teixeira's 35 C numerical onset matches, but its variable is deliberately daytime Tday and its window is 30 reproductive days. Whole-middle daily Tmax is different. Gourdji original was inaccessible. |
| `wheat-heat-mid-tmax-34` | Unverified overall. Teixeira's onset is 27 C Tday, not 34 C Tmax. Gourdji is the claimed 34 C source but its original was inaccessible. |
| `rice-heat-mid-tmax-36` | Unverified overall. Teixeira's wetland-rice onset is 35 C Tday, not 36 C Tmax. Gourdji original was inaccessible. |
| `soybean-heat-mid-tmax-39` | Unverified overall. Teixeira uses 35 C onset and 40 C limit on Tday, not a 39 C Tmax onset. Gourdji original was inaccessible. |
| `common-bean-heat-mid-tmax-30` | Unsupported mapping. The 30 C quotation matches, but Silva describes mean daily maximum; neither background citation establishes one-day exposure or the exact FAO middle stage. |
| `common-bean-heat-mid-tmin-20` | Unsupported mapping. The 20 C nighttime quotation matches. Nighttime temperature is not established as daily Tmin, duration is unspecified and stage is an implementation assumption. |
| `wheat-frost-mid-tmin-minus3.5` | Unsupported mapping. The -3.5 C warmer endpoint matches canopy air after head emergence. Weather-screen daily Tmin and the whole middle stage differ. |
| `barley-frost-whole-tmin-minus12.9` | Unsupported mapping. The endpoint matches a cultivar LT50 range, with hardening and freezing-test context. Whole-season daily Tmin is not that measurement. |
| `barley-frost-mid-tmin-minus4` | Unsupported mapping. About -4 to -5 C canopy air after head emergence becomes screen Tmin across all middle days. |
| `sorghum-heat-mid-tmean-31` | Unsupported mapping. Mean 31 C matches a paired 36/26 C regime. Prasad's temperature experiment lasted ten days, with a continuous response above mean 25 C. Djanaguiraman treated booting through seed set. Neither establishes a universal one-day >=31 boundary. |
| `sorghum-heat-mid-tmean-35` | Unsupported mapping. Arithmetic 40/30 to mean 35 does not establish a one-day boundary. The review reports a regime failure point; Prasad 2015 uses ten-day exposure. |
| `sorghum-cold-mid-tmin-10` | Unsupported mapping against accessible abstract. Five 25/10 C cycles in CK60 x Tx415 during a narrow meiotic window become any <=10 C night across all middle days. Full original methods remain unverified. |
| `groundnut-heat-mid-tmax-37` | Unsupported mapping. The review's 37 C air number matches, but the original abstract describes 2-6 day exposures and floral-bud >36 C effects in morning or whole-day heat, with no afternoon-only effect. |
| `lentil-heat-mid-tmax-32` | Unsupported mapping. Seven-day paired max/min >32/20 C at flowering/pod fill becomes an independent one-day Tmax >32 C across all middle days. |
| `faba-bean-heat-mid-tmax-28` | Unsupported mapping. Approximately 28 C is a fitted t50 for flowers present during five-day paired chamber exposure in winter cultivar Wizard. It is not damage onset or a one-day Tmax boundary. |
| `faba-bean-frost-mid-tmin-minus4` | Unsupported threshold. Field events were -4.19 C and -3.9 C, the latter with eight freezing hours. They do not fit a universal -4 C boundary; <=-4 excludes the reported -3.9 C value. This arithmetic comparison is not a replay of a Gilir warning. |
| `mung-bean-heat-mid-tmax-36` | Unsupported mapping. Background >36/28 C is a day/night pair. The experiment used sustained heat through maturity in SML668. Dropping night and duration does not locate a daily 36 C onset. |
| `cowpea-heat-mid-tmin-24` | Unsupported mapping against accessible abstract. The 24 C value is a site mean minimum paired with maximum 41 C and long photoperiods. It is not an isolated daily Tmin onset; genotypes varied. |
| `sunflower-frost-whole-tmin-minus4` | Unsupported mapping. Four hours at -4 C at V2/V4 becomes any daily minimum across every stage. The separate -3 C ten-hour experiment at 6-8 leaves cannot supply an all-stage -4 C threshold. |

The first four rows are deliberate evidence-gap verdicts, not a claim that the inaccessible Gourdji paper was disproved. Teixeira's variable/window disagreement is independently verified in [section 2.3.1 and Table 2, p.208](https://www.ukm.my/ipi/wp-content/uploads/2013/07/6.2013Global-hot-spots-of-heat-stress-on-agricultural-crops-due-to-climate-change.pdf). Exact stage and measurement problems in cereal frost follow [Frederiks pp.3490-3493](https://era.dpi.qld.gov.au/id/eprint/4854/1/Post-head-emergence%20frost%20in%20wheat%20and%20barley.pdf).

Paired regimes, treatment periods and response definitions are explicit in [Prasad's Methods and Figures 1-4](https://www.frontiersin.org/journals/plant-science/articles/10.3389/fpls.2015.00820/pdf), [Sita's Reproductive biology methods](https://www.frontiersin.org/journals/plant-science/articles/10.3389/fpls.2017.00744/full), and [Bishop's Methods and subset-yield Results](https://onlinelibrary.wiley.com/doi/10.1111/jac.12172). Individual rule citations and remaining primary access limits are in the JSON.

## Numerical qualifications

Most problems preserve a quoted number while changing its operational meaning. They must be kept separate from numerical disagreement.

Kaya's Table 1 gives SY Gibraltar at V4 as 80.7% damaged and 73.3% dead. Adjacent article prose calls 80.7% dead. The subject repeats the conflicted mortality maximum. Mean mortality 4.1% and 19.4% matches. Preserve the internal inconsistency instead of claiming a clean maximum-mortality match. See [Kaya Table 1 and adjacent Results](https://pmc.ncbi.nlm.nih.gov/articles/PMC12599371/).

Priya's abstract lists a 45/28 C heat treatment, but Methods says 45/30 C. The subject follows Methods. Record that source inconsistency without treating the abstract as an independent replication. See [Priya Abstract and Raising of plants](https://www.nature.com/articles/s41598-019-44163-w).

## Remaining access gaps

Gourdji 2013 original full text was blocked through DOI and IOP article/PDF variants. Original full texts were also unavailable or unread for Prasad 2006, Brooking 1976, Patel and Hall 1990, Vara Prasad 2000 groundnut, Prasil 2007, Rainey and Griffiths 2005, Porch 2010, Delahunty 2015 and Kaur 2015. Reviews and later papers establish their own quoted statements only. They do not certify the unexamined original methods.

Release evidence should retain unsupported rules as unassessed until an exact supported mapping can be encoded, or until an independently reviewed policy explicitly changes the specification. This audit does not invent replacement daily thresholds from treatment contrasts.
