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
