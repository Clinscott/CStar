# CStar

CStarCore is a pure observation reducer for Swift on macOS and iOS.

It answers one question:

```text
reduce(state: ExecutionState, observation: Observation) -> Reduction
```

It preserves explicit execution facts and derives lifecycle, connectivity, outcome, operations, artifact/check associations, usage samples, and factual diagnostics. Missing starts and late results remain observable. A host stop is not objective success; an interruption request is not confirmed interruption. Conflicting evidence never silently overwrites an accepted occurrence.

The core imports no frameworks, has no external packages or I/O, and generates no identifiers or time. The caller owns normalization, source trust, execution correlation, persistence, hashing, UI, and every host action. Codable types describe data without performing serialization or storage themselves.

- Contract: [`docs/observational-reduction.md`](docs/observational-reduction.md)
- Vectors: [`Tests/CStarCoreTests/observational-v2.json`](Tests/CStarCoreTests/observational-v2.json)
- Local validation: `swift test -Xswiftc -warnings-as-errors -Xswiftc -gnone`

GitHub is only the human review ledger. The repository contains no Actions workflows or hosted validation.

Earlier control-plane implementations and the replaced transition algebra remain available in ordinary Git history. The active library includes no compatibility aliases or host-control runtime.

## License

CStar is open source under the [ISC License](LICENSE).

That license applies only to this CStar repository. It does not license Corvus, Organism, skills, workflows, or any other part of the Corvus estate.
