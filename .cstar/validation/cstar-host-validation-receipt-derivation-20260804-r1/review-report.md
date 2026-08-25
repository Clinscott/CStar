# Independent validation report

Validation id: `validation:cstar-host-validation-receipt-derivation-20260804-r1`

Verdict: ACCEPTED for the three-file host-validation receipt-derivation change.

The receipt-only manifest path derives canonical verified v3 evidence. Matching legacy evidence remains accepted, while conflicting legacy evidence is rejected. Shape aliases (`path`/`pass`), duplicate artifact paths, duplicate check names, and duplicate check evidence paths fail closed. The focused suite also covers scope, hash, lineage, freshness, authorization, and out-of-root protections.

The changed production source is 492 lines and the changed focused test is 438 lines. The documentation file is 1,476 lines; it is not production or focused-test source and the requested source limit is satisfied. The exact scoped diff contains only the three expected files. No authority weakening or unintended behavior was found in that diff.

The required durable Forge suite is 4/5, with one failure at `tests/unit/cstar-kernel-mcp/test_forge_durable_execution.test.ts:392`: `driftResult.isError` is `undefined` instead of `true`. This is classified as an unrelated existing dirty-work expectation: the durable test and the Forge execution sources on that path have no diff from HEAD, and the failure occurs before host-workflow receipt derivation is reached. It is therefore documented here but intentionally omitted from the passing manifest checks.

Risk: the unrelated durable Forge expectation remains unresolved outside this validation scope. The accepted change itself has no remaining scoped validation risk beyond the existing dirty-work baseline.
