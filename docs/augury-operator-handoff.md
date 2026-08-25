# Corvus Star Augury Operator Handoff

## Purpose

Augury is a deterministic, typed, non-actionable route explanation. It helps a
host distinguish current mission intent, scope, targets, and one canonical
Council critique lens from stale session context. It never grants permission.

## When to Use It

- at a new mission boundary when route or scope is genuinely ambiguous;
- after a material target/scope change;
- when a stale active session may conflict with explicit current targets; or
- when an operator asks for the route explanation.

Do not run Augury on every prompt or edit. Reuse fresh route state that matches
the mission.

Use `cstar_doctor` separately only when kernel health is unknown or degraded,
`cstar_handoff` only when resuming prior work, and bounded Hall discovery only
when the active bead or evidence location is unknown.

## Fields

- `scope`: authorized CStar or trusted mounted-spoke scope.
- `intent_category` / `default_path`: deterministic grammar result, not
  authority.
- `current_mission_route`: route derived for the current explicit call.
- `active_session_suggestion`: historical/contextual state. It is background
  unless explicitly marked authoritative and target-compatible.
- `routing_provenance`: why current and session routes agree or diverge.
- `mimirs_well`: bounded evidence targets, not permission to scan broadly.
- `expert`: one canonical immutable Council critique lens.
- `persona_advice`: professional tone/domain emphasis only.
- `guardrail`: route-quality status, not an operator grant.
- `actionable`: always false for Augury advice.
- `token_path`: quarantine status only (`shadow-disabled`, non-actionable).

No numeric confidence is emitted unless a separate independent scorer actually
ran with a nonzero denominator and full evidence contract.

## Safety Boundaries

Augury validates scope and target containment against CStar and trusted mounted
spokes. Traversal, outside absolute paths, symlink escape, unavailable spokes,
and untrusted/read-only mutation assumptions fail closed.

Stored session text, expert objects, confidence, Gungnir fields, persona prose,
or route claims cannot override deterministic current inputs. A stale unrelated
session is demoted to background when the current route is safe; explicit
continuity requests fail loud on material divergence.

## Council and TokenPath

Council data is defensive-copied canonical critique guidance. It cannot vote,
hold, set risk, assign ownership, change execution mode, or prove correctness.

TokenPath is quarantined. Augury emits no advice episode, causal score, or
confidence, and `cstar_record_result` accepts no TokenPath observation write.
Historical ledgers are untrusted compatibility telemetry.

## Persistence

Route receipts may persist bounded deterministic provenance and canonical
expert ids. High-volume prompts, transcripts, raw model prose, candidate
rankings, and invented scores do not belong in the bead ledger.

## Operator Interpretation

Treat an Augury result as one input to CoS routing. Execution still requires the
applicable operator grant, repository policy, CStar bead/decision state, and the
proper Forge or Researcher gate. Validation remains independent.
