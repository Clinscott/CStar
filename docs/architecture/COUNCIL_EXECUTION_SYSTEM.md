# Council Advisory Critique System

## Status

This document replaces the earlier Council execution/governance proposal. The
old confidence, voting, hold, promotion, and TokenPath-coupling design is
superseded. Git history preserves it as rationale; it is not current authority.

## Purpose

The Council is a deterministic advisory critique system. It gives a host one
bounded expert lens and signature question that can expose a likely design
failure. It does not execute work or govern CStar.

Council output never:

- votes or reaches a binding consensus;
- grants authority, changes a gate, or assigns ownership;
- sets risk, creates a hold, or changes execution mode;
- emits confidence or a quality/readiness score;
- writes model-generated roster data into runtime authority;
- mutates beads, proposals, requests, attempts, or validation state; or
- advises, steers, or writes to TokenPath.

## Canonical Data Contract

Every canonical expert id resolves to immutable, versioned data:

- stable id and label;
- critique protocol and lens;
- one signature question;
- bounded guardrails/anti-behaviors; and
- host profile metadata used only to shape critique.

The source roster is immutable. Callers receive defensive copies so mutation of
one response cannot alter later selections. Stored or caller-supplied expert
objects, scores, confidence, directives, or candidate rankings cannot override
canonical data.

The current canonical ids are defined in `src/core/council_experts.ts`; that
typed source and its tests are the capability declaration. The applicable
operator/repository/CStar authority order remains external to the roster.

## Selection

Augury may select one canonical lens from deterministic intent, route, and
bounded target metadata. Keyword evidence may rank candidates internally for a
repeatable choice, but candidate scores are not confidence and are not exposed
as authority or persisted as outcome truth.

Use the Council:

- at a new or materially ambiguous mission boundary;
- for a consequential architecture, safety, or validation review; or
- when an independent critique lens would test a concrete assumption.

Do not invoke every expert or make Council selection a per-prompt ritual.
Ordinary work gets one lens. Multiple lenses are justified only for unusually
novel or consequential review, and each remains advisory.

## Augury Boundary

Augury returns typed, non-actionable routing advice and may include the selected
canonical expert id, label, lens, signature question, and anti-behaviors. It
must strip hostile stored prose and replace any noncanonical expert with the
deterministic canonical selection.

Augury and Council output grant no spend, mutation, execution, acceptance,
production, or lifecycle authority. Persona may affect tone and domain emphasis
only; a Council lens cannot expand persona authority.

## TokenPath Boundary

TokenPath is quarantined, `shadow-disabled`, and non-actionable. The Council
does not write advice, episodes, scores, confidence, or observations to it.
Historical TokenPath/Council records are untrusted compatibility telemetry.

Re-enabling any Council learning or TokenPath coupling requires a separate,
versioned proposal with:

- a causal episode schema and stable provenance;
- measured inputs, tokens, rounds, and terminal outcomes;
- nonzero denominators, exclusion accounting, and class coverage;
- explicit scorer formula and row-level evidence;
- independent validation and locked holdout evidence; and
- a gated migration that cannot reinterpret historical rows as authority.

Until all of those conditions are met, no promotion, quarantine automation,
adaptive roster, confidence model, or learned steering is active.

## Persistence

Persist only what is needed to reproduce and audit a selection:

- canonical expert id and roster/schema version;
- deterministic route/intent provenance;
- bounded artifact references or hashes; and
- independently measured outcome evidence when such a system is separately
  approved.

Do not persist raw model personas, unrestricted critique transcripts, invented
confidence, votes, or mutable expert definitions as control-plane state.

## Verification

Focused tests must prove:

- deterministic selection for the same bounded inputs;
- canonical fallback for hostile or unknown stored experts;
- defensive-copy and default-array mutation isolation;
- no Council score/confidence/authority fields in Augury and host contracts;
- no TokenPath write or steering path; and
- persona remains `style_only`.

Council usefulness is a product hypothesis, not a score. Evaluate it only with
real task outcomes and independent comparison; never treat selection frequency
or model agreement as proof.
