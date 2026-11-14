# Starter verification

Checked on 14 November 2026. This evidence concerns the shared development starter, not the implemented Gilir product.

- Node 24.22.3 ran type generation, TypeScript, twelve tests, and the module boundary check successfully.
- `npm run build` completed using Next.js 16.4.6 with webpack. Turbopack's local CSS worker could not bind its port in this execution environment. The starter pins the supported webpack command for development and build.
- The production server returned HTTP 200 for `/` and HTTP 404 for `/dev/fixtures`.
- A browser accessibility snapshot showed the starter heading and its explicit statement that no farm recommendation is available.
- An independent review verified sixteen card briefs, 59 isolated owned paths, 44 contract/fixture exports, and eight core hours plus two integration hours for each of the three owners.
- Review fixes removed a test that would have required stubs to remain unimplemented. They added predecessor/pest coverage, preparation records, registry injection, expiry cleanup, and typed provider failures to the interfaces.
- Negative boundary tests reject side-effect Node imports, relative engine-to-server imports, fixture re-exports, forbidden bare aliases, client-component server imports, and impure registry imports.
- The pstack no-comments pass removed one authored template comment. Generated Next.js declaration directives are left to the framework and ignored in git.

The independent reviewers used configured GPT-family models. No cross-family review was available or claimed.

Live PostgreSQL, NASA history ingestion, scientific calculations, the farmer UI, globe interaction, local persistence, and PDF export remain the assigned implementation and integration cards. Their acceptance has not been run by the starter preparation.

## Published checks

GitHub Actions [run 43588582362](https://github.com/Quantomz/nefalos_nasa_hackathon/actions/runs/43588582362) did not execute its job. The check annotation reports that the account is locked due to a billing issue. This is an external CI blocker, not a passing remote check. PR #17 remains open.

The final card-format pass compared OneTab issues #1 and #16 and its project fields. All 16 Gilir cards have numeric hour estimates. The board displays that field. Each brief states an observable outcome, its starting fixture or port, exact owned files, work, acceptance, and verification. Integration briefs distinguish immediate test preparation from live completion.
