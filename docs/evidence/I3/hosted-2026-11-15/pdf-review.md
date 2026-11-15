# Independent hosted PDF review

PASS for [phone](live-360.pdf) and [desktop](live-1280.pdf) exports on the final hosted release `fe4728a0f31c40f8ee17e651f0405c6311661062`.

Each PDF contains seven pages. Both have SHA-256 `15a506ae5f6174a855483b89666a4bc05c789445e72fd6e2d3268d1b18e51cd7`. The reviewer independently rehashed the final downloads and confirmed they match the files rendered and inspected on all 14 pages with macOS PDFKit. Poppler text extraction also passed. Native render artifacts are retained in the local release audit directory.

No clipped text, overlap, missing glyph, broken table, or footer collision was found. The timeline has a numbered key and readable planting, harvest, and field-release dates. Warnings, paddy water exclusions, backup-water exclusion, approximate history, missing temperature assessment, historical period, source grids, methods, and provenance remain present. Source URLs wrap within the page.

The final page is sparse, and long sections continue across pages. These are presentation notes, not missing content. This review applies to these exact downloaded bytes.

An independent gpt-6-astra agent performed the review through native Codex with the PDF skill and Prove It Works. The first hosted suite still failed three unrelated checks. The later full hosted run passed all 17 cases. PDF inspection alone did not close I3.
