# Every result state in Chromium

Fixture evidence: the six shared synthetic snapshots and F3's variants, served through a stubbed `/api` to the real HTTP client and shown by Results inside F1's `AppFrame` on `/`. This is not live end-to-end evidence.

Written by `tests/frontend/results/results.spec.ts` with `F3_EVIDENCE=1`. Each row was walked at Normal text, then at Largest through F1's own Text size sheet. Storage is F4's real IndexedDB port in a fresh browser profile. F1 saved each result when it finished, and the saved line is what Results read back.

| Snapshot | State | Width | Title | Status | Saved line | Sideways at Normal, Largest | Page height at Normal, Largest (px) | Actions in order | Full page |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| plan | plan | 360 | Keep last year’s rotation | This order passed every check we could run. | Saved on this device. | no, no | 4870, 8080 | Download PDF, View details, Change my answers, Clear saved data | [shots/plan-360-full.jpg](shots/plan-360-full.jpg) |
| plan | plan | 1280 | Keep last year’s rotation | This order passed every check we could run. | Saved on this device. | no, no | 2870, 4326 | Download PDF, View details, Change my answers, Clear saved data | [shots/plan-1280-full.jpg](shots/plan-1280-full.jpg) |
| plan_with_warnings | plan_with_warnings | 360 | Your plan, with warnings | With warnings. | Saved on this device. | no, no | 6625, 11005 | Download PDF, View details, Change my answers, Clear saved data | [shots/plan_with_warnings-360-full.jpg](shots/plan_with_warnings-360-full.jpg) |
| plan_with_warnings | plan_with_warnings | 1280 | Your plan, with warnings | With warnings. | Saved on this device. | no, no | 3796, 5501 | Download PDF, View details, Change my answers, Clear saved data | [shots/plan_with_warnings-1280-full.jpg](shots/plan_with_warnings-1280-full.jpg) |
| insufficient_data | insufficient_data | 360 | We can’t make a plan yet | No plan yet. | This result is saved on this device. | no, no | 2859, 4549 | Change my answers, Download PDF, View details, Clear saved data | [shots/insufficient_data-360-full.jpg](shots/insufficient_data-360-full.jpg) |
| insufficient_data | insufficient_data | 1280 | We can’t make a plan yet | No plan yet. | This result is saved on this device. | no, no | 1557, 2657 | Change my answers, Download PDF, View details, Clear saved data | [shots/insufficient_data-1280-full.jpg](shots/insufficient_data-1280-full.jpg) |
| no_calendar_fit | no_calendar_fit | 360 | Your crops don’t all fit in one year | No plan. | This result is saved on this device. | no, no | 2886, 4602 | Change my answers, Download PDF, View details, Clear saved data | [shots/no_calendar_fit-360-full.jpg](shots/no_calendar_fit-360-full.jpg) |
| no_calendar_fit | no_calendar_fit | 1280 | Your crops don’t all fit in one year | No plan. | This result is saved on this device. | no, no | 1641, 2809 | Change my answers, Download PDF, View details, Clear saved data | [shots/no_calendar_fit-1280-full.jpg](shots/no_calendar_fit-1280-full.jpg) |
| search_incomplete | search_incomplete | 360 | We couldn’t finish the search | No plan yet. | This result is saved on this device. | no, no | 2858, 4719 | Change my answers, Download PDF, View details, Clear saved data | [shots/search_incomplete-360-full.jpg](shots/search_incomplete-360-full.jpg) |
| search_incomplete | search_incomplete | 1280 | We couldn’t finish the search | No plan yet. | This result is saved on this device. | no, no | 1598, 2719 | Change my answers, Download PDF, View details, Clear saved data | [shots/search_incomplete-1280-full.jpg](shots/search_incomplete-1280-full.jpg) |
| service_error | service_error | 360 | Something went wrong while making your plan | No new plan. | This result is saved on this device. | no, no | 2781, 4532 | Change my answers, Download PDF, View details, Clear saved data | [shots/service_error-360-full.jpg](shots/service_error-360-full.jpg) |
| service_error | service_error | 1280 | Something went wrong while making your plan | No new plan. | This result is saved on this device. | no, no | 1562, 2610 | Change my answers, Download PDF, View details, Clear saved data | [shots/service_error-1280-full.jpg](shots/service_error-1280-full.jpg) |
| changed | plan | 360 | Your plan | This order passed every check we could run. | Saved on this device. | no, no | 7630, 12453 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| changed | plan | 1280 | Your plan | This order passed every check we could run. | Saved on this device. | no, no | 4684, 6645 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| skipped | plan | 360 | Your plan | This order passed every check we could run. | Saved on this device. | no, no | 4182, 6562 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| skipped | plan | 1280 | Your plan | This order passed every check we could run. | Saved on this device. | no, no | 2406, 3695 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| no_recommendation | plan | 360 | Your plan | This order passed every check we could run. | Saved on this device. | no, no | 5763, 9425 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| no_recommendation | plan | 1280 | Your plan | This order passed every check we could run. | Saved on this device. | no, no | 3537, 5191 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| several_crops | plan | 360 | Your plan | This order passed every check we could run. | Saved on this device. | no, no | 5765, 9051 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| several_crops | plan | 1280 | Your plan | This order passed every check we could run. | Saved on this device. | no, no | 3228, 4772 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| temperature | plan_with_warnings | 360 | Your plan, with warnings | With warnings. | Saved on this device. | no, no | 6950, 11501 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| temperature | plan_with_warnings | 1280 | Your plan, with warnings | With warnings. | Saved on this device. | no, no | 3844, 5603 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| context | plan | 360 | Keep last year’s rotation | This order passed every check we could run. | Saved on this device. | no, no | 5513, 9156 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| context | plan | 1280 | Keep last year’s rotation | This order passed every check we could run. | Saved on this device. | no, no | 3293, 4820 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| insights | insufficient_data | 360 | We can’t make a plan yet | No plan yet. | This result is saved on this device. | no, no | 4561, 7475 | Change my answers, Download PDF, View details, Clear saved data | in the run's output only |
| insights | insufficient_data | 1280 | We can’t make a plan yet | No plan yet. | This result is saved on this device. | no, no | 2699, 3960 | Change my answers, Download PDF, View details, Clear saved data | in the run's output only |
| structural | no_calendar_fit | 360 | Your crops don’t all fit in one year | No plan. | This result is saved on this device. | no, no | 2743, 4439 | Change my answers, Download PDF, View details, Clear saved data | in the run's output only |
| structural | no_calendar_fit | 1280 | Your crops don’t all fit in one year | No plan. | This result is saved on this device. | no, no | 1575, 2687 | Change my answers, Download PDF, View details, Clear saved data | in the run's output only |
| fatal | service_error | 360 | Something went wrong while making your plan | No new plan. | This result is saved on this device. | no, no | 2667, 4377 | Change my answers, Download PDF, View details, Clear saved data | in the run's output only |
| fatal | service_error | 1280 | Something went wrong while making your plan | No new plan. | This result is saved on this device. | no, no | 1539, 2610 | Change my answers, Download PDF, View details, Clear saved data | in the run's output only |
| run_provenance | plan | 360 | Keep last year’s rotation | This order passed every check we could run. | Saved on this device. | no, no | 4760, 7895 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| run_provenance | plan | 1280 | Keep last year’s rotation | This order passed every check we could run. | Saved on this device. | no, no | 2808, 4242 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| no_preparation | plan | 360 | Keep last year’s rotation | This order passed every check we could run. | Saved on this device. | no, no | 4668, 7794 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| no_preparation | plan | 1280 | Keep last year’s rotation | This order passed every check we could run. | Saved on this device. | no, no | 2685, 4074 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| limit_plan | plan | 360 | Keep last year’s rotation | This order passed every check we could run. | Saved on this device. | no, no | 5443, 9137 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| limit_plan | plan | 1280 | Keep last year’s rotation | This order passed every check we could run. | Saved on this device. | no, no | 3191, 4763 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| no_fit_assessed | no_calendar_fit | 360 | Your crops don’t all fit in one year | No plan. | This result is saved on this device. | no, no | 2807, 4495 | Change my answers, Download PDF, View details, Clear saved data | in the run's output only |
| no_fit_assessed | no_calendar_fit | 1280 | Your crops don’t all fit in one year | No plan. | This result is saved on this device. | no, no | 1573, 2717 | Change my answers, Download PDF, View details, Clear saved data | in the run's output only |
| labels_several | plan | 360 | Your plan | This order passed every check we could run. | Saved on this device. | no, no | 5795, 9129 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| labels_several | plan | 1280 | Your plan | This order passed every check we could run. | Saved on this device. | no, no | 3228, 4809 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| labels_changed | plan | 360 | Your plan | This order passed every check we could run. | Saved on this device. | no, no | 7806, 12530 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| labels_changed | plan | 1280 | Your plan | This order passed every check we could run. | Saved on this device. | no, no | 4684, 6816 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| labels_warnings | plan_with_warnings | 360 | Your plan, with warnings | With warnings. | Saved on this device. | no, no | 7065, 11688 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |
| labels_warnings | plan_with_warnings | 1280 | Your plan, with warnings | With warnings. | Saved on this device. | no, no | 3899, 5683 | Download PDF, View details, Change my answers, Clear saved data | in the run's output only |

## Sections in reading order

The h2 headings inside `#main`, top to bottom, and each year line with the section it sits in. The order is the same at both widths unless a second line says otherwise.

### plan

- Sections: Your rotation, kept; What you can do; Why your rotation ranked first; Compared with last year; Get ready
- Year lines: Your rotation, kept

### plan_with_warnings

- Sections: What we flagged; When to plant and harvest; What you can do; Why this plan ranked first; Compared with last year; Get ready
- Year lines: When to plant and harvest; Compared with last year: What you told us about last year (not scored)

### insufficient_data

- Sections: What’s missing; What you can do; Compared with last year
- Year lines: Compared with last year: What you told us about last year (not scored)

### no_calendar_fit

- Sections: Why they don’t fit; What you can do; Compared with last year
- Year lines: Compared with last year: What you told us about last year (not scored)

### search_incomplete

- Sections: Where the search stopped; What you can do; Compared with last year
- Year lines: Compared with last year: What you told us about last year (not scored)

### service_error

- Sections: What happened; What you can do; Compared with last year
- Year lines: Compared with last year: What you told us about last year (not scored)

### changed

- Sections: When to plant and harvest; What you can do; Why this plan ranked first; Compared with last year; Get ready
- Year lines: When to plant and harvest; Compared with last year: This plan; Compared with last year: Last year’s rotation, moved to this year

### skipped

- Sections: When to plant and harvest; What you can do; Why this plan ranked first; Compared with last year; Get ready
- Year lines: When to plant and harvest

### no_recommendation

- Sections: When to plant and harvest; What you can do; Why this plan ranked first; Compared with last year; Get ready
- Year lines: When to plant and harvest; Compared with last year: This plan; Compared with last year: Last year’s rotation, moved to this year

### several_crops

- Sections: When to plant and harvest; What you can do; Why this plan ranked first; Compared with last year; Get ready
- Year lines: When to plant and harvest

### temperature

- Sections: What we flagged; When to plant and harvest; What you can do; Why this plan ranked first; What we couldn’t check; Compared with last year; Get ready
- Year lines: When to plant and harvest

### context

- Sections: Good to know; Your rotation, kept; What you can do; Why your rotation ranked first; Compared with last year; Get ready
- Year lines: Your rotation, kept

### insights

- Sections: What’s missing; What you can do; Good to know; What we know about your farm; Compared with last year
- Year lines: Compared with last year: What you told us about last year (not scored)

### structural

- Sections: Why they don’t fit; What you can do; Compared with last year
- Year lines: Compared with last year: What you told us about last year (not scored)

### fatal

- Sections: What happened; What you can do; Compared with last year
- Year lines: Compared with last year: What you told us about last year (not scored)

### run_provenance

- Sections: Your rotation, kept; What you can do; Why your rotation ranked first; Compared with last year; Get ready
- Year lines: Your rotation, kept

### no_preparation

- Sections: Your rotation, kept; What you can do; Why your rotation ranked first; Compared with last year
- Year lines: Your rotation, kept

### limit_plan

- Sections: Good to know; Your rotation, kept; What you can do; Why your rotation ranked first; Compared with last year; Get ready
- Year lines: Your rotation, kept

### no_fit_assessed

- Sections: Why they don’t fit; What you can do; Compared with last year
- Year lines: Compared with last year: What you told us about last year (not scored)

### labels_several

- Sections: When to plant and harvest; What you can do; Why this plan ranked first; Compared with last year; Get ready
- Year lines: When to plant and harvest

### labels_changed

- Sections: When to plant and harvest; What you can do; Why this plan ranked first; Compared with last year; Get ready
- Year lines: When to plant and harvest; Compared with last year: This plan; Compared with last year: Last year’s rotation, moved to this year

### labels_warnings

- Sections: What we flagged; When to plant and harvest; What you can do; Why this plan ranked first; What we couldn’t check; Compared with last year; Get ready
- Year lines: When to plant and harvest
