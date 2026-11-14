# Gilir

A deterministic crop-rotation comparison tool for the NASA Space Apps challenge.

- [Product specification](spec.md)
- [Ten-hour build and ownership](docs/build-plan.md)
- [Frozen interfaces](docs/contracts.md)
- [GitHub project](https://github.com/users/kyusuku/projects/1)
- [Agent workflow](AGENTS.md)

The starter contains contracts, explicit unimplemented ports, and synthetic fixtures. It does not contain a working farm recommendation backend or released crop catalogue.

Use Node 24 and run `npm ci`, `npm run check`, `npm run build`, and `npm run dev`. Open `http://localhost:3000/dev/fixtures` during development to inspect synthetic input and result shapes. Fixture routes return 404 in production.

Backend setup belongs to kyusuku. The database, migrations, API routes, and worker are implementation cards. Never present fixture output as a calculated farm recommendation.

## Start a card

The starter is published in [PR #17](https://github.com/Quantomz/nefalos_nasa_hackathon/pull/17). Until it merges, branch from it. Replace `feat/B1-jobs` with your card branch.

```sh
git fetch origin
git switch -c feat/B1-jobs origin/chore/parallel-build-baseline
npm ci
npm run check
npm run dev
```

Use Node 24. Open your card, read AGENTS.md, and activate pstack before implementation. Quantomz starts F1, kyusuku starts B1, and yslee1106 starts E1.

GitHub Actions currently cannot start because GitHub reports an account billing lock. The repository owner must resolve billing and rerun the checks. Local checks passed. This does not prevent coding from the starter branch, but CI has not passed.
