# CStar Evolution Helper Report — 2026-04-16

## Changes Applied Tonight

### [HELPER-APPLIED] Baseline Module Mutation Bug

- **File:** `self-evolution/evolution/skills/evolve_skill.py`
- **Diff:** +6 lines, -2 lines
- **Git commit:** `08dc97e`
- **Rollback:** `git revert 08dc97e`

**Problem:** After `optimizer.compile(baseline_module, ...)`, the baseline_module is mutated in-place by GEPA/MIPROv2. When scoring on the holdout set, the "baseline" was actually running evolved-prompt content through a fresh model call — so the baseline score was artificially inflated/identical to the evolved score. The Apr 15 log confirmed this with `LM Response: {20,}` — the model returned only a fragment (`{20,}`) because the metric signature fields (`reasoning`, `output`) were never properly parsed from a truncated response.

**Fix:** Recreate a fresh `SkillModule(skill["body"])` before holdout scoring. Score the fresh module (true baseline) vs `optimized_module` (evolved).

---

## Review Findings (Apr 15 Run)

- **Repo reviewed:** FallowsHallowRPG (5/15), all 69 files succeeded
- **Self-evolution Apr 15:** Crashed at holdout scoring step — `AdapterParseError: LM response cannot be serialized to a JSON object. LM Response: {20,}` — baseline and evolved were being conflated due to the mutation bug.
- **Three gaps identified** (Apr 15 helper report):
  1. No cross-file pattern detection — winner: post-processing aggregator script (score 3.67)
  2. P3 security context not elevated — winner: severity elevation by module path (score 4.67)
  3. Variable "no issues found" verdicts — winner: minimum evidence checklist (score 3.00)

All three improvements were already queued for injection into the cron prompt. No action needed from this session.

---

## Remaining Gaps

### Cross-File Pattern Detection
- **Problem:** Apr 15 identified systemic `subprocess.run` without timeout, bare `except`, etc. scattered across the codebase — not aggregated.
- **Winner:** Post-processing AST aggregator (score 3.67 ≥ 3.0 threshold)
- **Why not applied:** Queued for cron prompt injection — awaiting Craig to update the main review prompt.

### Security Severity Elevation
- **Problem:** P3 in `hermes_cli/auth`, `gateway/platforms/` treated same as P3 in mock utilities.
- **Winner:** Module-path-based severity elevation map (score 4.67 ≥ 3.0 threshold)
- **Why not applied:** Same as above — queued for cron prompt injection.

### Minimum Evidence Standard
- **Problem:** "No issues found" verdicts range from 1 line to multi-paragraph with no minimum standard.
- **Winner:** VerdictEnforcer checklist (score 3.00 ≥ 3.0 threshold)
- **Why not applied:** Same as above — queued for cron prompt injection.

---

## CStar P1s — Craig → Codex Pipeline

The following P1s are confirmed structural defects in CStar that require implementation work in the Codex pipeline. Helpers do not write CStar core code — these must be escalated:

| P1 | Description | Status |
|----|-------------|--------|
| f01 | WAL mode not enforced on SQLite sessions | Confirmed Apr 13+ |
| f08 | Runtime contract enforcement missing | Confirmed Apr 13+ |
| f09 | Test suite can be bypassed without failing | Confirmed Apr 13+ |
| KeepOS import | KeepOS integration path not verified | Confirmed Apr 15 |

**Action required:** Craig to dispatch to Codex with the four P1 items above.

---

## Standing Mandates (Auto-Patch Applied This Session)

| Identified | Gap | File | Status | Commit |
|------------|-----|------|--------|--------|
| Apr 13-15 | GEPA missing `reflection_lm` param | `evolve_skill.py` | DONE | `32e1c27` |
| Apr 15 | Pre-flight ping no retry wrapper | `evolve_skill.py` | DONE | `bea9d11` |
| Apr 15 | Optimizer backoff too aggressive | `evolve_skill.py` | DONE | `bea9d11` |
| Apr 16 | Baseline module mutated by compile() | `evolve_skill.py` | DONE | `08dc97e` |

All prior mandates resolved. No additional auto-patches available tonight above score 3.0 threshold.
