# Council Execution System

This document is the working design record for the CStar council as an execution system.

It exists to preserve design intent across sessions, keep the council/augury/token-path relationship coherent, and provide an append-only question-and-answer trail for future refinement.

If future implementation details drift from this document, treat the drift as unverified until the document or code is updated deliberately.

This file is maintained in `dia-logos` style:
- one question at a time;
- concise decision-bearing answers;
- honest best judgment rather than comfort language;
- append-only Q&A when preserving dialogue context.

## Current Intent

The council is being designed primarily to improve implementation quality during execution, not merely to route work or audit it after the fact.

Current operating direction:
- dominant function: improve implementation quality while work is happening
- steering strength: strong steering, not hard blocking by default
- default structure: primary expert plus one adaptive critic
- cadence: continuous during execution, with refreshes when task phase, domain, or risk changes
- visibility rollout:
  - phase 1: fully visible
  - phase 2: lightly visible
  - phase 3: mostly hidden

## Immediate Architecture

The immediate architecture is council-first and augury-linked.

That means:
- council governs live execution now
- augury remains the canonical event spine where available
- augury token-path is not yet mature enough to co-own decisions
- eventual target state is full Augury+council integration once token-path is ready

Practical rule:
- council first now
- augury-linked now
- augury-integrated later

## Live Execution Model

Default council behavior:
- one primary expert
- one critic selected adaptively by task/domain/risk
- primary remains stable through a coherent implementation arc
- critic can rotate more freely
- primary changes only when the mission materially changes

Council refresh triggers:
- task phase changes
- task domain changes
- risk increases
- verification contradicts current guidance
- severe mismatch signals appear

Explicit stable state:
- `no refresh needed`

Stability conditions:
- same phase
- same domain
- same primary still appropriate
- no risk increase
- no verification contradiction
- no critic swap
- no severe mismatch signal

## Guidance Shape

Live guidance should be sparse and effective.

Default live card constraints:
- 1 primary directive
- 1 main risk or veto
- 1 evidence requirement

Live card fields:
- primary expert
- critic
- execution mode
- primary directive
- main risk or veto
- evidence requirement
- provisional status when applicable

Execution modes:
- `implement`
- `research-first`
- `verify-first`
- `hold`

`hold` policy:
- strong advice at normal risk
- blocking at high/critical risk unless explicitly overridden

Hold overrides must record:
- overrider
- hold reason
- risk tier
- skipped requirement
- replacement mitigation
- later outcome

Voice policy:
- neutral Corvus voice with explicit expert attribution
- authenticity is judged by reasoning pattern, not stylistic imitation

## Confidence Model

Initial confidence model:
- selection confidence
- advice confidence

Retrospective confidence is deferred until sufficient history exists.

Selection-confidence penalties:
- weak domain match
- overlap ambiguity
- probationary involvement
- rule/inference conflict
- lack of similar successful history

Advice-confidence penalties:
- weak evidence
- verification conflict
- severe mismatch signals
- compressed/incomplete context under risk
- generic guidance

Confidence must modulate live behavior:
- high confidence: direct steering
- medium confidence: steering plus evidence requirement
- low confidence: research-first, verify-first, or hold

Special case behavior:
- high selection confidence + low advice confidence:
  - keep pair
  - do not repick immediately
  - change mode and gather evidence
- low selection confidence + high advice confidence:
  - allow the immediate next step
  - mark pair provisional
  - refresh early

Uncertainty is surfaced live only when it materially changes the recommendation.

## Risk Model

Risk assignment policy:
- Codex assigns the initial risk tier
- deterministic rules validate and constrain that assignment
- user may confirm, challenge, or raise risk
- governing risk tier is the higher of Codex and user assessments

The ledger should preserve:
- Codex proposed tier
- user tier
- governing tier
- observed eventual severity

Risk should control:
- council refresh frequency
- critic scrutiny strength
- raw-capture likelihood
- verification intensity
- tolerance for override
- roster eligibility

Roster eligibility by risk:
- low risk: broader roster allowed
- high risk: strong bias toward core experts
- critical risk: probationary experts heavily restricted

High/critical risk rules:
- probationary primary allowed only if:
  - a core critic is attached
  - no stronger core/specialist fit exists
- core primary plus probationary critic is allowed only when the probationary critic is domain-specific and low-overlap

## Verification Authority

Council guidance is allowed to shape verification strategy.

Verification directives are:
- a strong default with logged override at normal risk
- mandatory for certain classes at high/critical risk

Initial mandatory-capable verification set:
- focused tests for touched critical logic
- provenance/trace checks for routing, orchestration, and MCP surfaces
- schema/contract validation for host/tool boundaries
- rollback/invariant checks for stateful changes
- benchmark/eval for optimization or AI-behavior claims

Council may escalate execution away from coding into:
- `research-first`
- `verify-first`
- `hold`

## Roster Model

The roster should not remain a flat list.

Explicit tiers:
- core
- specialist
- probationary
- dormant
- quarantined

Tier governance:
- Codex may auto-adjust probationary status under explicit rules
- Codex may recommend broader tier moves
- user confirms core/specialist status changes

Probationary experts:
- lower default selection weight
- stronger retrospective scrutiny
- easier demotion/quarantine
- quarantine should trigger a replacement proposal

Replacement sourcing:
- dormant internal candidates first
- outside candidate pool second

Replacement proposals should be full candidate cards:
- candidate name
- gap being filled
- intended role
- signature question
- evidence preference
- overlap/conflict risk
- probation success criteria
- quarantine triggers

## Promotion And Quarantine

Probationary -> specialist promotion requires:
- enough real uses
- positive quality trend
- no recent quarantine triggers
- evidence of beneficial decision influence
- low redundant overlap with a better expert

Specialist -> core promotion requires:
- repeated usefulness across domains or phases
- stable positive outcomes over time
- low noise
- effective performance as both primary and critic
- distinct value not already covered by the core

Initial quarantine triggers:
- repeated misleading guidance
- repeated noisy or generic advice
- high overlap with a stronger expert
- correlation with failed verification or rework
- failure to improve implementation quality after enough use

Overlap should be judged by both:
- structural similarity
- observed outcome redundancy

## Specialist Roster Direction

Current design direction for specialist expansion:
- Sakaguchi is mandatory as a selectable specialist, but not always-on
- Sakaguchi should be strongly weighted for game, simulation, world, and system-coherence work
- Sakaguchi is not a universal director for all Corvus engineering
- specialists like Sakaguchi, Kitase, Ito, and Tanaka should be allowed as either primary or critic
- becoming primary should require a stronger domain match than becoming critic
- new specialists should enter as probationary first

## Quality Model

The council should optimize implementation quality before token reduction.

Initial quality dimensions:
- correctness
- architectural fit
- rework rate
- critique value
- user acceptance

Retrospective authority:
- verification signals as objective anchor
- Codex as default structured assessor
- user as override

Retrospective posture rollout:
- phase 1: strongly opinionated
- phase 2: balanced
- phase 3: conservative

Mismatch handling:
- swap critic first
- replace both only when mismatch is severe
- always log correction and cause

Initial severe mismatch triggers:
- wrong inferred domain
- primary steering toward the wrong solution class
- evidence contradicts the primary lens
- critic swap failed to recover usefulness
- mission materially changed

## Storage And Learning

The storage target should be:
- DuckDB as canonical long-term store
- JSONL as temporary resilience/debug layer during early rollout

Storage rollout:
- phase 1: dual write
- phase 2: DuckDB-first with optional JSONL edge logs
- phase 3: minimal JSONL, mostly derived exports only

Retention policy:
- structured features and hashes by default
- summarized prompt/context routinely
- selective raw capture for sampled, failed, or high-value cases

Initial raw-capture triggers:
- severe mismatch
- verification failure
- council override or critic swap
- quarantine-triggering behavior
- unusually strong positive outcome
- random baseline sampling

Raw capture retention:
- medium window
- promote especially valuable cases into curated exemplars before pruning

Exemplars:
- recommended automatically
- confirmed by the user
- used first to improve advice quality
- used for both retrieval and scoring

Bad-case learning must operate at:
- expert
- pairing
- context/path conditions

Initial context/path conditions to track:
- task phase
- domain
- risk tier
- target path type
- context density
- verification intensity
- change magnitude

## Data Model Direction

Expert truth should use a split model:
- code for selection mechanics, tier rules, logging behavior
- data for expert roster, traits, tiers, overlap, evidence preferences, signature questions

Recommended storage structure:
- registry file for roster state and tiering
- per-expert files for richer definitions and evolution notes

Initial expert schema should include:
- primary domains
- secondary domains
- preferred role
- signature question
- evidence preference
- veto conditions
- failure modes caught well
- failure modes missed or overfired
- overlap neighbors
- tier
- probation status

Initial overlap modeling should use:
- hand-built traits
- usage telemetry
- outcome data

Vector/embedding support can be introduced later.

## Augury Linkage

Council records must attach to the Augury token-path system so they do not form a parallel telemetry universe.

Near-term rule:
- use Augury/session/path identifiers as shared keys
- record council state as an Augury-linked facet
- keep token-path experimental until it is mature enough to co-own decisions

Reason trace storage:
- normalized fields
- short rationale sentence
- linked into Augury token-path records

Council should sit conceptually as:
- execution facet now
- co-equal Augury core later

## Append-Only Decision Log

This section records design dialogue as question/answer pairs so context survives beyond the active session.

### 2026-04-23

Q: What is the council’s dominant function?
A: Improve implementation quality while work is happening.

Q: How strong should the council’s influence be?
A: Strong steering, not hard blocking by default.

Q: Default structure?
A: Primary expert plus one adaptive critic.

Q: Default critic behavior?
A: Adapt to the task.

Q: Intervention cadence?
A: Continuous during execution.

Q: What triggers refresh?
A: Task-focus changes plus risk changes.

Q: On refresh, should both roles be re-picked?
A: Keep the primary stable and swap the critic more freely.

Q: How visible should the council be?
A: Start fully visible, then work down to light visibility, then mostly hidden as confidence grows.

Q: Should metadata be logged for training and learning?
A: Yes.

Q: Should the council link to Augury token-path?
A: Yes.

Q: Immediate architecture?
A: Council first, Augury-linked now, fuller integration later.

Q: First optimization target for the combined system?
A: Improve implementation quality.

Q: Initial quality score dimensions?
A: Correctness, architectural fit, rework rate, critique value, and user acceptance.

Q: Who supplies retrospective judgment?
A: Verification signals and Codex by default, with user override.

Q: Retrospective posture?
A: Start strongly opinionated, then step down to balanced, then conservative when proven.

Q: What happens when the pairing looks wrong?
A: Swap the critic first; replace both if the mismatch is severe.

Q: Severe mismatch triggers?
A: Wrong domain, wrong solution class, evidence contradiction, critic-swap failure, or mission shift.

Q: Guidance format?
A: Structured execution card plus short readable guidance.

Q: Directive cap?
A: One primary directive, one main risk/veto, one evidence requirement.

Q: Voice style?
A: Neutral Corvus voice with explicit expert attribution.

Q: Authenticity priority?
A: Reason like the expert more than sounding like the expert.

Q: What about Sakaguchi?
A: Sakaguchi is mandatory as a selectable specialist, strongly weighted for game/simulation/world/system-coherence work, but not always-on for all Corvus engineering.

Q: How should specialists enter the system?
A: Probationary first.

Q: What does probation mean?
A: Lower default weight, stronger scrutiny, easier quarantine, and replacement proposal on quarantine.

Q: Replacement source?
A: Dormant internal candidates first, then outside candidates.

Q: Replacement proposal format?
A: Full candidate card.

Q: Should the roster use explicit tiers?
A: Yes: core, specialist, probationary, dormant, quarantined.

Q: Who can move experts between tiers?
A: Codex can auto-manage probationary status under rules; user confirms core/specialist changes.

Q: Promotion and quarantine criteria?
A: Use the criteria defined above for probation->specialist, specialist->core, and quarantine.

Q: How should overlap be judged?
A: Structural similarity plus observed outcome redundancy.

Q: Vectors/embeddings now?
A: Hand-built traits first, vectors later.

Q: Where should expert truth live?
A: Split model: runtime logic in code, expert roster/spec in data.

Q: Initial storage structure?
A: Registry file plus per-expert files.

Q: Can DuckDB be used to avoid JSON bloat?
A: Yes; DuckDB should become the canonical long-term store.

Q: Initial write strategy?
A: Dual write first, then DuckDB-first later.

Q: Raw prompt/context retention?
A: Summaries and hashes by default, selective raw capture.

Q: Raw-capture triggers?
A: Severe mismatch, verification failure, override/swap, quarantine triggers, strong positive outcome, and random sampling.

Q: Raw retention duration?
A: Medium window, with exemplar promotion before pruning.

Q: How should exemplars be curated?
A: System recommends, user confirms.

Q: What should exemplars improve first?
A: Advice quality.

Q: How should exemplars be used?
A: Retrieval plus scoring.

Q: How should bad-case learning work?
A: Learn at expert, pairing, and context/path-condition levels.

Q: What conditions should be tracked?
A: Task phase, domain, risk tier, target path type, context density, verification intensity, and change magnitude.

Q: How should risk be assigned?
A: Codex-led, rule-backed, user-validatable; governing tier is the higher of Codex and user.

Q: What should risk affect?
A: Refresh frequency, critic scrutiny, raw capture, verification intensity, override tolerance, and roster eligibility.

Q: Should risk narrow roster eligibility?
A: Yes.

Q: High/critical risk probationary primary rule?
A: Only with a core critic and only if no stronger fit exists.

Q: High-risk probationary critic rule?
A: Allowed only when domain-specific and low-overlap.

Q: Can council change verification strategy?
A: Yes.

Q: How binding are verification directives?
A: Strong default normally; certain classes become mandatory at high/critical risk.

Q: Mandatory-capable verification set?
A: Focused tests, provenance/trace, schema/contract validation, rollback/invariant checks, benchmark/eval.

Q: Can the council escalate into research-first, verify-first, or hold?
A: Yes.

Q: Should execution mode be explicit?
A: Yes.

Q: Should `hold` block at high/critical risk?
A: Yes, unless explicitly overridden.

Q: What should be recorded for hold overrides?
A: Overrider, reason, risk, skipped requirement, replacement mitigation, later outcome.

Q: Should the system support `no refresh needed`?
A: Yes.

Q: Stability conditions?
A: Same phase, same domain, same primary, no risk increase, no verification contradiction, no critic swap, no severe mismatch.

Q: Should the pair have confidence scores?
A: Yes: selection confidence and advice confidence for now.

Q: Confidence-lowering factors?
A: Use the selection/advice penalty sets defined above.

Q: Should confidence modulate live guidance?
A: Yes.

Q: When should uncertainty be surfaced?
A: Only when it materially changes the recommendation.

Q: High selection confidence but low advice confidence?
A: Keep the pair and gather evidence first.

Q: Low selection confidence but high advice confidence?
A: Use the immediate guidance, mark provisional, and refresh early.

Q: Should provisional status be visible for now?
A: Yes.

Q: Should reason trace be stored?
A: Yes, for learning.

Q: Fields only or fields plus rationale sentence?
A: Both, and link them to Augury token-path.

Q: Should design-dialogue decisions themselves be stored?
A: Yes.

Q: Can this discussion be written to a design file so the context is not lost?
A: Yes. This document is the first persisted form of that record.
