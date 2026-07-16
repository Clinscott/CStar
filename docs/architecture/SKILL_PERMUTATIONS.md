# CStar Capability Composition

## Status

The former Prime/Skill/Weave/Spell permutation model is retained only as
compatibility vocabulary in types and historical records. It is not the current
execution topology. The current registry has three active `SKILL` entries and
no active registered weaves or spells.

## Current Composition Rule

CStar composes work through explicit lifecycle transitions, not recursive
model-owned workflows:

1. CoS records or resumes bounded CStar state.
2. A deterministic kernel primitive records health, handoff, discovery,
   request, attempt, or validation state.
3. One agent-native skill supplies procedural guidance for the correct lane.
4. Independent evidence records the result before lifecycle completion.

The active compositions are:

| Intent | Agent-native skill | Kernel lifecycle |
| --- | --- | --- |
| Build, repair, improve | `corvus-forge` | `cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute -> cstar_record_result` |
| Research, external evidence | `researcher` | `cstar_researcher_request -> authorized collection -> receipt/result` |
| Handoff and session closeout | `cstar-closeout` | bounded evidence snapshot -> lifecycle update -> separately gated Git/activation actions |

CoS owns sequencing. PMTs may supply or receive bounded project context but are
information repositories only. MM has no active routing role.

## Compatibility Tiers

Tier labels may still appear in parsers, Hall targets, or archived receipts:

- `PRIME` means a deterministic atomic kernel primitive;
- `SKILL` means agent-native procedural guidance;
- `WEAVE` identifies a historical composite workflow; and
- `SPELL` identifies historical recursive or policy vocabulary.

These labels describe provenance or composition. They never grant permission.
No `WEAVE` or `SPELL` is active merely because a parser accepts the label or a
compatibility adapter is registered.

## Retired Compositions

Do not recreate autonomous chains such as:

- `chant -> forge -> evolve`;
- restoration, expansion, vigilance, or creation loops;
- Ravens repair/promotion cycles;
- One Mind broker fulfillment; or
- model-generated engrave, distill, harvest, dormancy, or skill-promotion loops.

Retained entrypoints must be read-only or fail closed. A new multi-step need
should become either a bounded agent-native skill whose state changes use
`cstar-kernel`, or a narrowly typed deterministic MCP primitive after the skill
contract is proven.

## Advice and Evidence

Augury is optional advisory route explanation for ambiguity, not an
orchestrator. Council experts are immutable critique lenses, not voters or
owners. Persona changes professional tone and domain emphasis only. TokenPath
is quarantined and performs no steering or observation writes.

No Gungnir, confidence, quality, or readiness number controls a composition
unless an actual scorer ran with a nonzero denominator, formula, exclusions,
class coverage, row evidence, and an independent probe. Development proof,
installed state, live activation, locked holdout, and production readiness are
separate evidence classes.
