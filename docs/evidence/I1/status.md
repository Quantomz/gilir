# I1 verification status

I1 remains incomplete. The acceptance runner is prepared against the frozen client and lifecycle ports in `tests/integration/runtime/acceptance.ts`.

## Required evidence

| Check | Current result | Dependency |
| --- | --- | --- |
| Real HTTP submission through PostgreSQL, NASA and the engine | NOT RUN | B1, B2, B3, E1, E2, E3 |
| Kill a separate worker after freeze and compare the resumed manifest and snapshot digest | NOT RUN | B1 and B3 |
| Restart the web process and read the same result | NOT RUN | B1 and the assembled pipeline |
| Reject wrong tokens for reads and deletes | NOT RUN | B1 HTTP adapter |
| Provider outage produces a service failure | NOT RUN | B2 and B3 |
| Missing scientific coverage produces insufficient_data | NOT RUN | E1, E2, E3 |
| Terminal expiry and stale-worker fencing | NOT RUN | B1 and B3 |
| Logs omit capabilities, geometry and history | NOT RUN | Assembled HTTP and worker processes |
| Independent review of final I1 changes | NOT RUN | Final candidate |
| Required remote checks | BLOCKED | Repository owner billing lock |

The published starter at `6e36a76af91464d22399e7ca04ed0847164ac82d` has an empty released catalogue and an unimplemented engine. The repository currently has no E1, E2 or E3 branch or PR. Those modules remain owned by yslee1106.

The starter's required GitHub check was retried during this goal. [Job 132433601624](https://github.com/Quantomz/nefalos_nasa_hackathon/actions/runs/43589258315/job/132433601624) did not start because the repository owner account is locked due to a billing issue. The owner must resolve billing and rerun CI. Local checks do not waive this gate.

No fixture-backed or failed-engine execution counts as I1 completion. The runner requires a declared expected result, real provider snapshots and run provenance. It compares the entire frozen manifest and digest before and after restart.
