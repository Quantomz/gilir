# Tab order at 1280x800

Fixture evidence: Chromium on `/` with F1's development seed and a stubbed `/api`, Results inside F1's `AppFrame`. Written by `results.spec.ts` with `F3_EVIDENCE=1`. Each table presses Tab six or eight times. A stop outside `#main` is the frame around the result (F1's skip link and top bar), which shows that Tab has left the result.

F1 saved each result in the browser's real storage when it finished, so Clear saved data is the last action. Save on this device shows only for a result that is not saved, so it is absent here.

## plan: from #main, where AppFrame puts focus when the result appears

| Tab | Role | Name | Size (CSS px) | Where |
| --- | --- | --- | --- | --- |
| 1 | button | Download PDF | 360 x 64 | the result |
| 2 | button | View details | 360 x 64 | the result |
| 3 | button | Change my answers | 360 x 64 | the result |
| 4 | button | Clear saved data | 249 x 52 | the result |
| 5 | none |  | 0 x 0 | the frame |
| 6 | link | Skip to the main content | 267 x 54 | the frame |

## plan: View details, from its h1

| Tab | Role | Name | Size (CSS px) | Where |
| --- | --- | --- | --- | --- |
| 1 | button | Back to the result | 283 x 56 | the result |
| 2 | none |  | 0 x 0 | the frame |
| 3 | link | Skip to the main content | 267 x 54 | the frame |
| 4 | button | Text size | 87 x 55 | the frame |
| 5 | button | Listen | 63 x 55 | the frame |
| 6 | button | Back to the result | 283 x 56 | the result |
| 7 | button | Back to the result | 283 x 56 | the result |
| 8 | none |  | 0 x 0 | the frame |

## insufficient_data: from #main, where AppFrame puts focus when the result appears

| Tab | Role | Name | Size (CSS px) | Where |
| --- | --- | --- | --- | --- |
| 1 | button | Change my answers | 360 x 64 | the result |
| 2 | button | Download PDF | 360 x 64 | the result |
| 3 | button | View details | 360 x 64 | the result |
| 4 | button | Clear saved data | 249 x 52 | the result |
| 5 | none |  | 0 x 0 | the frame |
| 6 | link | Skip to the main content | 267 x 54 | the frame |

## insufficient_data: View details, from its h1

| Tab | Role | Name | Size (CSS px) | Where |
| --- | --- | --- | --- | --- |
| 1 | button | Back to the result | 283 x 56 | the result |
| 2 | none |  | 0 x 0 | the frame |
| 3 | link | Skip to the main content | 267 x 54 | the frame |
| 4 | button | Text size | 87 x 55 | the frame |
| 5 | button | Listen | 63 x 55 | the frame |
| 6 | button | Back to the result | 283 x 56 | the result |
| 7 | button | Back to the result | 283 x 56 | the result |
| 8 | none |  | 0 x 0 | the frame |
