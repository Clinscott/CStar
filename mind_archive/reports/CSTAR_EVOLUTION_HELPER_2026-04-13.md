# CStar Evolution Helper Report

**Generated:** 2026-04-13 14:00:00 Canada/Eastern
**Helper:** CStar Evolution Watch Helper (auto-researcher)
**Parent Report:** `CSTAR_EVOLUTION_WATCH_2026-04-13.md`

---

## Parent Watch Summary

Last night's watch (`CSTAR_EVOLUTION_WATCH_2026-04-13`) reported:
- 10/10 known findings resolved
- 0 open findings
- 0 new issues found
- **No P1 items.** "The codebase is in good shape."

The watch ran in **passive verification mode** — confirming known issues stayed closed. No proactive scanning for new problems. Given the codebase has active open issues tracked in `~/wiki/log.md` including `hermes-evolution` with a stagnant score (0.576→0.586, +1.7%) and an unresolved GEPA API mismatch forcing MIPROv2 fallback, this passive posture is a gap.

---

## Identified Gaps

### Gap A — Passive Monitoring Stance
The watch verifies known findings but generates zero proactive findings. It operates as a regression checker, not an auto-researcher. A healthy codebase can always yield new issues worth tracking — the watch's current stance means it will always trend toward "nothing new" regardless of actual code state.

### Gap B — No Quantitative Health Metrics
The watch produces no metrics on Hall-of-Records SQLite health, Bead throughput, Gungnir score trends, or skill dispatch latency. A "nothing open" verdict without quantitative context is unverifiable.

### Gap C — Explicit Exclusion of Key Directories
The watch scopes to Python files in `src/`, but `AGENTS.qmd`, `ARCHITECTURE.md`, `chants/`, `weaves/`, `spells/`, `tests/`, `docs/` are all unexamined. These are where architectural drift, governance violations, and documentation rot occur.

---

## Self-Play: Candidate Improvements

### Gap A — Proactive Scanning

| Candidate | Description | Effort | Correctness | Risk | Simplicity | Score |
|-----------|-------------|--------|-------------|------|------------|-------|
| A1 | Active Smell Scanner (TODO/FIXME/HACK, bare excepts, >100-line functions, circular imports) | 3 | 4 | 2 | 3 | 10.62 |
| A2 | Trend Detection Baseline (track metrics over time, alert on sustained negative trends) | 4 | 3 | 3 | 2 | 7.62 |
| **A3-R3-C1** | **Pattern Rule Engine — JSON-configurable probe rules; git-incremental; allowlist-filtered; 4 concrete boundary probes (skill import boundaries, registry bypass, cross-Spoke imports, missing SKILL.md). Adding a new check = adding one JSON entry.** | **3** | **5** | **2** | **4** | **13.0** |

**A3-R3-C1** wins after 2 rounds of adversarial refinement. The pattern rule engine converts "look for architectural violations" into an extensible, maintainable, low-risk scanner.

### Gap B — Quantitative Health Metrics

| Candidate | Description | Effort | Correctness | Risk | Simplicity | Score |
|-----------|-------------|--------|-------------|------|------------|-------|
| B1 | SQLite Health Dashboard (WAL size, freelist, page ratios, schema version) | 2 | 4 | 2 | 4 | 11.38 |
| B2 | Bead Throughput Metrics (creation rate, resolution time, failure rate by intent) | 4 | 3 | 2 | 2 | 7.88 |
| **B3-R2** | **Skill Execution Timer — monkey-patch wrapper (non-invasive); track P50/P95/P99 per skill; alert when P99 > 2x the skill's own 7-day rolling P99 baseline. Separate timings.db, no core runtime changes.** | **3** | **5** | **2** | **4** | **13.0** |

**B3-R2** wins after adversarial challenge of the absolute threshold approach (alert fatigue). Relative baseline is far more actionable.

### Gap C — Directory Coverage

| Candidate | Description | Effort | Correctness | Risk | Simplicity | Score |
|-----------|-------------|--------|-------------|------|------------|-------|
| **C1** | **Explicit inclusion list in watch config: [.agents/skills/, .agents/weaves/, .agents/spells/, docs/, tests/, src/, bin/, chants/, weaves/] PLUS exclusion list: [__pycache__, .git, node_modules, *.pyc, dist/]** | **1** | **5** | **1** | **5** | **14.38** |
| C2 | Grep-based surface scanner for uncovered file types | 2 | 3 | 2 | 4 | 9.38 |
| C3 | Corvus Star Trace compliance checking | 2 | 4 | 2 | 4 | 11.38 |

**C1** wins outright — trivially implementable, maximum coverage gain, no risk.

---

## Winning Approaches

| Gap | Winner | Score | Key Improvement |
|-----|--------|-------|-----------------|
| A (Proactive Scanning) | A3-R3-C1 — Pattern Rule Engine | 13.0 | JSON-configurable architectural boundary probes, git-incremental, 4 concrete checks |
| B (Health Metrics) | B3-R2 — Relative Baseline Skill Timer | 13.0 | Non-invasive monkey-patch wrapper, per-skill 7-day rolling P99 baseline, relative alerting |
| C (Directory Coverage) | C1 — Explicit Inclusion/Exclusion Config | 14.38 | One-line config change, full framework coverage including docs/weaves/spells |

---

## Top Priorities for Next Run

1. **Add explicit directory coverage config (C1).** No code changes needed — just a YAML config update. Immediately expands watch scope to the full framework surface.

2. **Implement the 4 architectural boundary probes (A3-R3-C1).** Priority order:
   - (a) Registry entries missing SKILL.md files — fastest signal
   - (b) Skills importing outside `.agents/skills/<name>/` — architectural drift
   - (c) Cross-Spoke direct file imports — Engine bypass
   - (d) Runtime dispatch bypassing chant registry — governance violation

3. **Instrument skill execution timing (B3-R2).** Add monkey-patch wrapper at skill dispatch. Log to `timings.db` in `HERMES_HOME`. Generate first baseline report — even one day of data enables relative alerting.

---

## Notes for Cron Update

The improvements above should be incorporated into the main cron prompt. Specifically:
- The watch should always attempt to surface **at least one new finding** per run (remove the "nothing new" success state)
- The watch scope should explicitly include all `.agents/` subdirectories, `docs/`, `chants/`, `weaves/`, and `tests/`
- Architectural boundary probes and skill timing are both additive — neither requires modifying core runtime behavior, only adding new scanning logic
