# CStar Agent SDK Reference Architecture

Status: accepted reference plan

## Decision

CStar will use OpenAI Agents SDK concepts as an architecture reference, not as a runtime dependency.

Codex remains the model host. CStar remains subscription-only from the operator perspective. The Node kernel remains deterministic and must not become a model-calling orchestration runtime. Any future implementation that requires an OpenAI API key is outside this plan unless the operator explicitly changes that boundary.

## Pattern Map

| Agents SDK Pattern | CStar Equivalent | Boundary |
| --- | --- | --- |
| Agent | Host-native skill, weave, or council lens | Runs in Codex or another active host harness |
| Runner | Codex session plus Augury/Hall workflow | Host-owned cognition, kernel-recorded state |
| Tools | `cstar-kernel` MCP tools and approved host skills | Deterministic kernel tools only |
| Handoffs | Council expert routing and bounded critique passes | One Mind remains final decision maker |
| Guardrails | Sterling Mandate, host-only enforcement, no shell fallback | Fail closed on host-only violations |
| Sessions | Hall planning sessions, beads, and handoff packets | Kernel catalogs state; host reasons over it |
| Memory | Hall records and Engrams | Retrieved on demand, never bulk-preloaded |
| Tracing | Augury route, Hall events, validation records | Auditable local evidence |
| Structured output | Typed Augury, verification, and result contracts | JSON-compatible contracts validated by tests |

## Target Shape

1. A host mission begins with Augury routing.
2. The host reads only the bounded Mimir targets and Hall hits.
3. The host proposes or executes work according to the active gate.
4. Kernel MCP tools provide health, handoff, Hall search, routing, verification hints, and result recording.
5. Guardrails prevent host-only skills from silently falling back to shell or kernel-owned cognition.
6. Verification records close the loop through Lore, Isolation, and Audit evidence.

## Concrete Improvement: Typed Augury Active State

The first implementation target is the active-state blocker:

```text
WEAVE: unknown
missing intent_category
GUNGNIR Omega: 0.00
```

CStar should normalize active Augury contracts before doctor, explain, status, or handoff output. If a persisted runtime contract has `selection_tier` and `selection_name` but lacks `intent_category`, the read path should infer the category from `.agents/skill_registry.json#intent_grammar`.

If a runtime execution bead is unroutable, such as `WEAVE: unknown`, it should not outrank a usable planning Augury. The active-state selector should skip that runtime bead for Augury routing and fall back to a typed planning contract synthesized from registry grammar when the planning session has no persisted contract.

This keeps stale runtime beads from poisoning the active host state while preserving the original Hall record for audit.

## Acceptance Checks

- `cstar augury doctor --json` does not fail only because a recoverable runtime contract omitted `intent_category`.
- `cstar augury explain --json` exposes the inferred category in `route.intent_category`.
- `cstar augury handoff --json` exposes the inferred category in `designation.intent_category`.
- Unroutable `WEAVE: unknown` runtime beads do not displace a usable typed planning Augury.
- A focused unit test proves the read-path recovery against registry grammar.

## Concrete Improvement: Typed Augury Guardrails

The second implementation target is the Agents SDK guardrail pattern:

```text
warnings[] are useful for humans
host agents need a typed proceed / caution / block signal
```

CStar should keep the existing diagnostic checks, but doctor and explain output should also expose a compact `guardrail` object:

```json
{
  "verdict": "allow | caution | block",
  "action": "continue | recover | repair",
  "reason": "short operator-facing reason",
  "failed_checks": ["route"],
  "warning_checks": ["expert"]
}
```

This lets host-native Codex workflows use Augury as an explicit control gate without scraping prose warnings. It mirrors the Agents SDK guardrail concept while staying fully local and deterministic.

## Guardrail Acceptance Checks

- Clean Augury output reports `guardrail.verdict=allow` and `action=continue`.
- Failed Augury output reports `guardrail.verdict=block` and `action=repair`.
- Warning-only Augury output reports `guardrail.verdict=caution` and `action=recover`.
- Doctor and explain output both expose the same guardrail envelope.

## Non-Goals

- Do not add `@openai/agents` as a dependency.
- Do not introduce an OpenAI API key requirement.
- Do not expand `cstar-kernel` into a generic execution surface.
- Do not revive legacy broad MCP servers or shell `run-skill` routes.
