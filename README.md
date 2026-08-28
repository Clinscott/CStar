# CStar

CStarCore is Corvus's inactive, non-authoritative lifecycle state machine for macOS and iOS.

It answers one question:

```text
reduce(State?, Event) -> Result
```

The core has one Swift source file, no framework imports, no external packages, no I/O, and no host authority. Organism owns admission, policy, journaling, effects, evidence, identifiers, time, cancellation, and serialization.

- Contract: [`docs/native-transition/cstar-core-v1.md`](docs/native-transition/cstar-core-v1.md)
- Vectors: [`Tests/CStarCoreTests/cstar-core-v1.json`](Tests/CStarCoreTests/cstar-core-v1.json)
- Local validation: `swift test` with network access disabled

GitHub is only the human review ledger. The repository contains no Actions workflows or hosted validation.

The retired TypeScript, Python, MCP, daemon, database, provider, installer, and distribution implementations remain available in Git history at `e97a9f97326d051e6c798f07a047b6365d0fa500`.

## License

CStar is open source under the [ISC License](LICENSE).

That license applies only to this CStar repository. It does not license Corvus, Organism, skills, workflows, or any other part of the Corvus estate.
