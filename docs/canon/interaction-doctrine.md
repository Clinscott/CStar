# CStar Interaction Doctrine

Status: derived canon amendment for CStar White Paper v0.3

## Purpose

CStar should let operators create wildly personal spokes while still allowing
those creations to cooperate, compete, and be validated in shared play.

The rule is:

> Imagination is unbounded at the manifestation layer. Interaction is
> structured at the contract layer. Authority is enforced at the kernel layer.

## Layer Split

| Layer | Governs | Freedom level | Authority impact |
| --- | --- | --- | --- |
| Manifestation | Mythic form, visual identity, aura, AR expression. | Freeform. | None. |
| Category and slot | Inventory, loadout grammar, UI grouping, event eligibility hints. | Soft structure. | None by itself. |
| Interface contract | Message shape and peer-interaction protocol. | Structured. | Indirect; defines expected verbs and events. |
| Capability verbs | Atomic permissions and operations. | Strict. | Direct; enforced by Wardens and Star Core. |
| Warden policy | Validation, scoring, safety, and execution rights. | Strict. | Direct; grants or denies execution. |

Categories and equipment slots are presentation and loadout grammar. They help
operators understand a build, but they must not decide what a spoke can do.

Interfaces and verbs are interoperability and authority grammar. They decide
what the spoke may request, emit, consume, and prove.

## Primary Design Rule

Capability verbs are primary.

A spoke may look like a raven, sword, dome, lantern, companion, or swarm. The
Star Core should only care which verbs it requested, which verbs were granted,
which interfaces it implements, and which Warden gates it passed.

## Interface Rule

Interfaces are bundles of verbs and event shapes. They allow shared play
without forcing all spokes into one visual class.

Examples:

| Interface | Role | Typical verbs |
| --- | --- | --- |
| `I_Observer` | Reads bounded state and emits observations. | `read_state`, `emit_observation` |
| `I_Defender` | Blocks, validates, or contains within policy. | `assert_invariant`, `deny_mutation`, `emit_guardrail` |
| `I_Builder` | Proposes or applies bounded repairs. | `read_file`, `propose_mutation`, `write_file` |
| `I_Validator` | Runs checks and reports proof. | `execute_test`, `assert_invariant`, `emit_verdict` |
| `I_Archivist` | Records accepted outcomes. | `store_memory`, `emit_engram` |
| `I_Simulator` | Runs bounded synthetic scenarios. | `read_state`, `simulate_state`, `emit_observation` |
| `I_Mutator` | Requests bounded state mutation. | `propose_mutation`, `write_file` |

## Slot Rule

Equipment slots remain useful, but they are not permission classes.

A familiar can implement defense. A shield can implement observation. A lantern
can implement archive. A sword can implement counsel. The slot tells the player
how the spoke sits in the build; the interface tells the system how the spoke
interacts.

## Shared Play Rule

A spoke may enter shared play only when it exposes an interaction contract:

- requested capability verbs
- implemented interfaces
- consumed interfaces, if any
- event emissions, if any
- Warden validation requirements
- arena boundaries for any trial or duel

No interaction contract means no shared execution. The spoke can still exist as
private flavor, private utility, or draft concept.

## Authority Boundary

Manifestation, rarity, level, renown, and slot do not grant authority.

Authority comes from granted verbs, Warden gates, operator ratification, and
Star Core policy.
