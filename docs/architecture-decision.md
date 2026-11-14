# Shared starter architecture

The baseline uses one Next.js package, a pure TypeScript engine, and a separate Node worker process in the same repository. Backend setup remains kyusuku's coding work.

Two candidate designs were compared. A single source tree avoids npm workspace build and export coordination during the ten-hour session. Workspace packages offered stronger import encapsulation, but their extra setup did not remove the same domain boundaries. The chosen design adds an import-boundary check instead.

The shared result union, immutable run manifest, and lost-lease rejection came from the two designs. Provider responses and SQL rows remain private to their adapters. Frontend, local saving, and PDF consume the same completed snapshot.

| Criterion | Single app | Workspaces |
| --- | --- | --- |
| Independently startable cards | Pass with frozen ports and fixtures | Pass with frozen ports and fixtures |
| File ownership | Separate directories and checked imports | Separate packages |
| Setup overhead in this build | Lower | Higher |
| Honest unavailable state | Explicit | Explicit |
| Future package isolation | Can be added when needed | Present immediately |

The architecture candidates used gpt-6-astra and gpt-6.1-terra. The operator-configured cross-family judge pool was empty. No cross-family verdict is claimed.
