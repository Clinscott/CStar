---
name: researcher
description: Run and review the Corvus Researcher loop as an active-scope evidence intake, stats, and proposal-routing skill.
tier: SKILL
risk: medium
intent_category: DOCUMENT
entry_surface: docs
terminal_required: false
---

# SKILL: Researcher

Researcher is the Corvus scout. It finds useful evidence, grades it against
the Focus Charter, and routes only bounded proposal candidates into CStar.

Researcher is not a general backlog generator. It is a reproducible,
maintainable, modular, and trackable evidence pipeline.

## Active Scope

The active Corvus research surface is:

`CStar, Kernel, Researcher, Forge, Skills, XO, Moonshot`

ENM is business-separated by default. Parked spokes remain inactive unless the
Focus Charter is explicitly updated.

## Use This Skill When

- Reviewing or running Researcher evidence intake.
- Checking whether a Researcher proposal fits the Focus Charter.
- Auditing whether proposal sync preserved focus metadata, stats, and Gungnir
  scoring.
- Preparing a Researcher runbook or proposal package for CStar review.

## Do Not Use This Skill To

- Dispatch live model work without a separate operator decision.
- Accept, merge, publish, or implement proposals by itself.
- Route around CStar beads, GitHub issues, PMT review, or operator gates.
- Turn parked spokes or business-separated work into active Researcher scope.

No live Researcher dispatch is authorized by this skill.

## Required Flow

1. Confirm CStar health and route through Augury when operating inside the
   Corvus estate.
2. Confirm the Focus Charter active scope before intake.
3. Collect or review evidence without secrets, private account data, or live
   operational leakage.
4. Produce a Researcher brief with source framing and a clear disposition:
   discard, watch, brief, or proposal candidate.
5. Sync proposal candidates through the cstar-console proposal pipeline.
6. Require `focus_contract` and `researcher_stats` on proposal records.
7. Keep execution separate: CStar acceptance and operator dispatch are distinct
   gates.

## Stats Contract

Researcher proposal records must carry `researcher.stats.v1`.

The stats object is designed for statistical analysis over Researcher quality,
not for automatic promotion. It includes:

- `schema_version`
- `computed_at`
- `focus_contract`
- `features`
- `gungnir`

The `features` section captures countable proposal properties such as target
path count, change outline count, implementation steps, verification commands,
research basis count, review packet count, risk critiques, and evidence packet
count.

The `gungnir` section uses Gungnir v1.0 axes:

- logic
- style
- intel
- gravity
- vigil
- evolution
- anomaly
- sovereignty
- overall
- stability
- coupling
- aesthetic

The Gungnir score is a tracking signal. It is not an execution authority, a
merge authority, or proof that a proposal is good.

## Acceptance Gates

A Researcher proposal is not acceptable unless:

- it is inside active scope or explicitly operator-approved as an exception
- its `focus_contract.allowed` value is true
- it has `researcher.stats.v1`
- the Gungnir matrix is present and bounded to 0..10 values
- its dispatch packet carries the same stats for downstream outcome analysis
- a later edit recomputes stats before dispatch

## Validation Commands

For cstar-console proposal sync changes:

```bash
rtk python3 -m pytest -s tests/test_sync_research_proposals.py -q -k "researcher_stats or gungnir or focus_contract"
rtk python3 -m pytest -s tests/test_sync_research_proposals.py -q
rtk python3 -m pytest -s tests/test_unattended_researcher.py -q
rtk python3 -m py_compile scripts/sync_research_proposals.py scripts/run_unattended_researcher.py
rtk node tests/research_dispatch_ui_test.mjs
rtk git diff --check
```

For this CStar skill contract:

```bash
rtk node scripts/run-tsx.mjs --test tests/unit/test_researcher_skill_contract.test.ts
rtk git diff --check
```

## Reporting

Researcher reports should distinguish:

- source evidence
- Focus Charter fit
- Researcher stats and Gungnir values
- whether the work is watch-only, brief-only, or proposal-candidate
- whether any live dispatch, model spend, secret access, MongoDB mutation, or
  PR action is being requested

If the answer is unclear, classify the work as watch-only or route it to CoS
for a yellow decision.
