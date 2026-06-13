# Corvus Pulse External Relevance Pipeline

Status: draft pipeline doctrine. This document adapts the proposed ChatGPT
Pulse process to the Corvus Focus Charter.

Authority: Pulse provides outside pressure. CStar and CoS retain operational
authority. Morderith retains founder authority.

## Purpose

The Pulse pipeline exists to test the active Corvus Focus Charter against the
outside world.

Pulse is not a task manager. Pulse is not a second CoS. Pulse is not Researcher,
PMT, Forge, or CStar. Pulse is an external relevance layer: a frontier scout
that asks whether current Corvus work still matters, whether the world has
moved, and whether assumptions need investigation.

The pipeline must keep the distinction sharp:

- CoS handles internal operational command.
- Researcher investigates evidence and proposals after accepted direction.
- CStar owns bead lifecycle, validation, and authority.
- Forge builds only accepted work through review gates.
- Pulse tests relevance and returns pressure.

## Governing Scope

Every Pulse seed must be filtered through the Corvus Focus Charter.

Default active scope:

- CStar.
- Kernel.
- Researcher.
- Corvus Forge.
- Skills.
- XO.
- Moonshot.

Default excluded scope:

- Parked projects.
- Legacy game/narrative experiments.
- Broad gamified-spoke concepts.
- ENM as a gamified spoke.
- Any project not explicitly reactivated by Morderith and represented through
  CStar.

ENM may appear only as business context when explicitly relevant. It must not be
treated as a gamified Corvus spoke or default Forge target.

Parked projects must not be seeded to Pulse as active work. If a parked project
is mentioned, it must be clearly labeled `parked/watch-only` and tied to a
specific reactivation question.

## Daily Automation Shape

The intended daily automation remains:

1. Generate the daily Corvus CoS handoff.
2. Append the handoff to the canonical Google Doc ledger.
3. Extract the External Relevance Seed from that ledger entry.
4. Sanitize the seed.
5. Deliver the compact brief to the Gmail account connected to Pulse.
6. Record success, failure, or degraded mode in the CoS thread.

The automation is not live by this document. Enabling it requires separate
authorization, connector access, ledger target, Gmail recipient, and acceptance
test approval.

## Required Inputs Before Go-Live

Codex must not enable or update the live automation until Morderith confirms:

```text
Canonical ledger Google Doc URL/document ID:
Pulse-connected Gmail recipient:
Apply/create Gmail label Corvus/Pulse Seed if supported: yes/no
Run manual acceptance test immediately after setup: yes/no
```

Codex must not guess the ledger, infer the recipient from unrelated context, or
create duplicate canonical records.

## Ledger Contract

The canonical ledger is append-only.

Every daily entry should include:

```text
## YYYY-MM-DD - Corvus CoS Daily Handoff

### 1. Executive State
### 2. Current Work
### 3. Material Changes
### 4. Active Assumptions
### 5. Risks / Blockers / Constraints
### 6. Decisions Pending
### 7. Doctrine / White Paper Implications
### 8. External Relevance Seed
### 9. Integrity Notes
```

Prior ledger entries must not be rewritten, summarized, deleted, reorganized,
or cleaned. Corrections are appended as correction notes. If no material update
exists, append a short no-material-change entry.

The External Relevance Seed section is the source of the Gmail brief. Codex
must not invent a separate Pulse seed that diverges from the ledger.

## External Relevance Seed Contract

The seed must be compact, strategic, and charter-bound.

Required fields:

```text
Current Work:
Core Assumption:
External Relevance Question:
Signals to Watch:
Possible Threats:
Possible Tailwinds:
Outside Opinion Needed:
Ledger Link:
```

The seed should normally be 500-900 words. It should ask for no more than three
to five useful external findings. It should prefer sharp questions over broad
news requests.

Good seed:

- Names the active charter area.
- States the assumption being tested.
- Describes the kind of external signal that would matter.
- Separates threats from tailwinds.
- Asks Pulse for investigations, not tasks.
- Says when no material external relevance would be an acceptable answer.

Bad seed:

- Lists every active repo or PR.
- Includes secrets, credentials, tokens, access plans, exploit details, or
  sensitive internal operational detail.
- Asks for generic AI news.
- Treats hype, virality, or X discourse as strategy.
- Frames parked projects as active work.
- Lets Pulse create backlog.

## Gmail Brief Header

Every Gmail brief must begin with:

```text
PULSE SEED - EXTERNAL RELEVANCE ONLY

Pulse is not CoS.
CoS handles internal operational command.
Pulse should test whether the current Corvus work remains relevant against the external frontier.
Do not treat this as a task-management brief.
```

Then include the required seed fields.

Delivery means sent email. A Gmail draft does not count. A local note does not
count. A ledger append alone does not count.

## Sanitization Gate

Before sending the Gmail brief, Codex must remove or rewrite:

- Secrets.
- Tokens.
- Credentials.
- Private keys.
- API keys.
- OAuth tokens.
- Unredacted access plans.
- Exploit details.
- Sensitive customer, child, family, or user data.
- Unnecessary private repo internals.
- Operational details that would increase risk if exposed through email.

If a brief cannot be safely sanitized, Codex must not send it.

## Pulse Output Contract

Pulse should return External Relevance Findings, not generic updates.

Each useful finding should include:

```text
Frontier Signal:
Classification:
Relevance Verdict:
Why It Matters To The Corvus Focus Charter:
Assumption Tested:
Evidence Quality:
Recommended Investigation:
Confidence:
Expiration:
```

Classification values:

- `Tailwind`
- `Threat`
- `Design Pressure`
- `Timing Signal`
- `Watch Item`
- `False Alarm`

Relevance verdict values:

- `Still Relevant`
- `More Valuable`
- `Less Valuable`
- `Accelerate`
- `Pause`
- `Reposition`
- `Investigate`
- `Obsolescence Risk`
- `No Material Impact`

Evidence quality should distinguish primary/official sources, direct technical
signals, credible analysis, operator discourse, and rumor. X or public discourse
alone normally produces a `Watch Item`, not a mandate.

## Pulse To Researcher Gate

Pulse findings do not become work automatically.

The route is:

`Pulse finding -> CoS review -> optional Researcher investigation -> CStar proposal/bead -> MM/PMT routing -> Forge/worker execution`

Pulse may recommend an investigation. CoS decides whether the recommendation is
worth Researcher attention. Researcher then gathers evidence and prepares a
proposal. Only CStar can move accepted work into execution gates.

If a Pulse finding would reactivate a parked project, it must go through the
reactivation gate in the Corvus Focus Charter.

## Failure And Degraded Modes

If ledger append fails, do not send the normal Pulse seed.

If Gmail delivery fails, record degraded mode and do not claim Pulse was seeded.

If the current tooling can only create a Gmail draft, record draft-only degraded
mode and do not claim delivery.

If Pulse output is unavailable, irrelevant, generic, or noisy, record that fact.
Do not fill the gap by inventing frontier relevance.

If quota, connector failure, systemError, or thread-tool exposure prevents a
valid pipeline run, record the exact failure and stop. Do not route around the
control plane by direct Hall/SQLite writes or unsanctioned automation.

## Implementation Status

This document does not enable the automation.

Implementation remains gated on:

- Explicit ledger URL or document ID.
- Explicit Pulse-connected Gmail recipient.
- Google Docs/Drive append capability.
- Gmail send capability.
- Sanitization test.
- Manual acceptance test if Morderith requests it.
- Confirmation that the automation attaches to the existing CoS thread.

Until those gates pass, Pulse pipeline work remains doctrine and setup design,
not live operation.
