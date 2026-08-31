# CStarCore v1

Status: proposed, inactive, and non-authoritative. Tracks #45, #47, and #48, and is designed with the authority boundary proposed in Clinscott/Corvus#5.

## Boundary

CStarCore answers one question: is this lifecycle event legal from this lifecycle state?

```text
reduce(State?, Event) -> Result
```

Organism owns the complete event envelope, authority generation, scope, IDs, idempotency, clocks, decisions, evidence, cancellation, policy, journal, hashing, effect intents, admission, and receipts. It performs authoritative preflight, projects only the lifecycle event into CStarCore, then performs final admission. CStarCore receives none of that authority data and cannot act on the host.

Cancellation is not a CStar event or state. Organism records cancellation evidence and, when appropriate, projects the ordinary `observe` lifecycle event.

## Entire core algebra

```text
State  = constructed | submitted | observed | disposed
Event  = construct | submit | observe | dispose
Result = accepted(State) | rejected(invalid_transition)
```

Swift spells the sole rejection `Result.rejectedInvalidTransition`; a fourth public rejection-reason type would add no behavior.

There is no stored `unconstructed` value; absence of state means unconstructed.

| Prior | Event | Result |
| --- | --- | --- |
| no state | `construct` | `accepted(constructed)` |
| `constructed` | `submit` | `accepted(submitted)` |
| `submitted` | `observe` | `accepted(observed)` |
| `observed` | `dispose` | `accepted(disposed)` |
| `constructed` | `dispose` | `accepted(disposed)` |

Every unlisted pair returns `rejected(invalid_transition)`. The reducer is pure, so rejection returns no replacement state and the caller retains its input unchanged. A disposed lifecycle is terminal.

## First-party vectors

`Tests/CStarCoreTests/cstar-core-v1.json` is the complete machine-readable contract and fixture set. It uses no schema dialect, resolver, code generator, URL, package, or validation framework.

Each vector supplies a prior state, an event, and the expected typed result. SwiftPM bundles this file into the test target. A test-only adapter uses Foundation to decode it and maps its strings immediately to the three public enums. CStarCore itself imports nothing and has no loader, parser, serializer, or filesystem access. The twenty vectors are the complete Cartesian product of the five prior-state inputs—no state plus the four stored states—and the four events. Five rows accept and fifteen reject. The test proves that every pair occurs exactly once and runs every row twice.

Serialization, hashes, and authoritative replay are deliberately absent. Organism serializes and hashes its journal with Apple-provided APIs after admission; CStarCore does not duplicate that work.

## K.I.S.S. implementation gate

The Swift implementation in this transition is constrained to:

- one core source file;
- three public enums: `State`, `Event`, and `Result`;
- one public pure reducer function;
- the Swift standard library only in the core target;
- no protocol layer, class hierarchy, generic framework, dependency injection, actor, async task, callback, singleton, configuration object, serializer, database, filesystem, network, process, Git, provider, UI, or logging surface in CStarCore; the bundled test-resource read is the package's sole filesystem access;
- one direct test path that consumes the bundled eight-vector file;
- a final deletion pass after tests pass.

Any extra public symbol, type, branch, file, or import must prove that the checked-in vectors cannot be satisfied without it. Functional parity with the legacy runtime is not a goal.

## Sovereignty

- GitHub is only the human repository and pull-request ledger.
- No GitHub Actions, hosted runner, marketplace action, or external status check is required.
- Build and test run locally and offline on the operator-controlled Apple OS.
- Core source is first-party and has zero package dependencies.
- No legacy provider, MCP, Hall, Forge, worker, daemon, scheduler, installer, database, route, host-control, or compatibility type enters the core.

Organism integration evidence remains separate work. This contract grants no runtime authority.
