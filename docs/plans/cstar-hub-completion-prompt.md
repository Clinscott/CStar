# Goal prompt — finalize the CStar Hub Hermes research agent

Paste this into a fresh Claude Code session in `/home/morderith/Corvus/CStar` to complete H1-P3 through H1-P9 from the hardening roadmap. The agent should be able to pick this up cold and execute to a verified, demonstrated finish without further direction.

---

```
GOAL — Complete the CStar Hub Hermes research agent to full Graeme-spec parity.
Phases P1+P2 already shipped on 2026-05-15 and are verified live. Your job is
P3 through P9 from the roadmap.

READ THESE FILES FIRST (in this order, cold-start context):
1. ~/Corvus/CStar/docs/plans/cstar-spoke-hardening-roadmap.md — full roadmap
   incl. #H1 with per-phase implementation sketches and dependencies
2. ~/.hermes/profiles/cstar-hub/SOUL.md — agent identity + boundaries
3. ~/.hermes/profiles/cstar-hub/skills/research/research-agent-loop/SKILL.md —
   the contract this work extends
4. ~/.hermes/profiles/cstar-hub/skills/research/research-agent-loop/scripts/
   research_agent_loop.py — the existing BOOTSTRAP + REFRESH implementation
5. ~/wiki/cstar-research-architecture.md — operator's notes on the broader
   Hermes setup (cron schedule, vault layout, integration points)

ARCHITECTURE SNAPSHOT (verified live as of 2026-05-15):
- Hub profile lives at ~/.hermes/profiles/cstar-hub/ with the full Graeme
  vault structure (24 subdirs incl. context/config/dossiers/knowledge/queue/
  notes/raw/sources/decisions/runs/indexes/health/ops/wiki).
- BOOTSTRAP and REFRESH modes work end-to-end. REFRESH:
  - Walks 7 spoke vaults, dedupes by content hash, tags provenance
  - Calls Hermes/MiniMax-M2.7 for cross-cutting synthesis
  - Returns trends + cross_implications + verification_gaps as JSON
  - Writes operator-brief, source-balance, health-check, run-receipt
- 5 spokes (moonshot, fallowshallowrpg, nexplaynexus, taliesin, xo) use
  nested layout and produce findings. 2 spokes (corvuseye, securesphere)
  are flat-layout and show as `vault_missing` in source-balance — that's
  honest reporting, not a bug.
- Active spoke roster + canonical CamelCase paths are auto-resolved by
  ~/.hermes/scripts/spoke-research.py (_resolve_corvus_dir function).

HARD CONSTRAINTS — DO NOT VIOLATE:
1. Every LLM call (research, synthesis, judgment) MUST go through the
   `hermes` subprocess with `--provider minimax --model MiniMax-M2.7`.
   Never invoke Claude (you) for any research or synthesis content.
   You only orchestrate; Hermes/MiniMax does the thinking.
2. Never write into per-spoke vaults (~/.hermes/profiles/<slug>/) — those
   are upstream read-only evidence. Hub writes only into
   ~/.hermes/profiles/cstar-hub/workspace/research-vault/.
3. Never create lowercase scratch dirs under ~/Corvus/. The existing
   _resolve_corvus_dir auto-resolver handles canonical CamelCase. If you
   add new spoke-touching code, route it through that resolver.
4. Honor the honesty contract from the Graeme article and SOUL.md:
   - If a collector fails: mark `degraded`, surface in operator-brief
     banner, write to run-receipt. Never pretend stale data is fresh.
   - If synthesis returns empty arrays: write them as empty, don't pad.
   - If a spoke's vault is missing: report `vault_missing`, don't skip.
5. Never bypass CStar's bead gate (`gateSterlingMandate` in
   src/tools/cstar-kernel-mcp.ts) when creating beads for this work.
   Use `mandate_evidence: { mandate_exempt: true, exemption_reason: "..." }`
   for orchestration beads.
6. Use TaskCreate to track each phase. Mark complete only when verified live.
7. Never edit ~/.hermes/cron/jobs.json without first reading the existing
   entries and showing the operator a diff before writing.
8. Costs money — every Hermes call hits MiniMax. Don't loop-test;
   single-invocation tests + verify outputs.

PHASE ORDER (sequential, each builds on prior):

P3 — Claims promotion + verification queue
  - Add to research_agent_loop.py: a per-refresh promotion pass that
    examines fresh findings against thresholds in config.yaml
    (min_claim_confidence=0.7, promotion_requires_corroborating_findings=2).
  - High-confidence findings → knowledge/claims.jsonl (with promoted_from
    array of source finding ids).
  - Low-confidence findings → queue/verification-review.md +
    queue/verification-leads.json with reason.
  - Synthesis verification_gaps from REFRESH go to queue too.
  - Done when: a refresh that produces ≥1 high-confidence finding writes
    a claim record AND parks something in the verification queue,
    verified by reading both files.

P4 — External collectors (start with 2, defer the rest)
  - Implement GitHub collector: pulls trending repos in lane keywords
    (config/collector-config.json), writes raw captures to raw/github/,
    extracts findings to knowledge/findings.jsonl with
    source=collector:github, includes URL + commit-sha provenance.
  - Implement RSS collector: configurable feed list in
    config/collector-config.json, polls, dedupes, writes findings.
  - Defer X/HF/ArXiv unless explicit operator request.
  - Done when: a refresh produces ≥1 finding from each new collector
    AND source-balance.json shows non-zero counts under those collector
    lanes.

P5 — Wiki compile pipeline
  - Create tools/compile_refresh_to_wiki.py inside the vault:
    walks dossiers + claims + active findings, generates Obsidian-style
    concept pages with [[wikilinks]], rebuilds wiki/articles/index.md.
  - Idempotent. Health check should detect broken wikilinks.
  - Wire into REFRESH so every refresh recompiles.
  - Done when: wiki/concepts/ has ≥3 pages with valid cross-links AND
    wiki/articles/index.md lists every concept page.

P6 — Handoff lanes
  - In REFRESH, after claims promotion, examine each new claim for
    action implications. Route via prompt-driven classification (one
    Hermes/M2.7 call per refresh, NOT per claim) into:
    queue/buildroom-handoff.json (coder)
    queue/content-handoff.json (content)
    queue/monetize-handoff.json
    queue/subc-handoff.json (subconscious)
    queue/verify-handoff.json
    queue/watch-handoff.json
  - Each handoff record: { claim_id, suggested_action, urgency, lane,
    routed_at, routed_by_model }.
  - Until downstream agents exist, these are write-only ledgers.
  - Done when: a claim with implementation flavor lands in
    buildroom-handoff.json with rationale + claim_id linkage.

P7 — Remaining 6 modes + operator surfaces
  - Add modes: DAILY_SUMMARY, SUBCONSCIOUS_BRIEF, MIDDAY_FOCUS, BACKUP,
    RESTORE, RECOVER. SKILL.md already documents what each does.
  - DAILY_SUMMARY: refresh + render digest to
    ~/wiki/queries/cstar-hub-daily-YYYY-MM-DD.md with degraded banner
    if applicable.
  - MIDDAY_FOCUS: NO scrape — read existing artifacts, render
    operator-cockpit.html + operator-action-ledger.md +
    operator-action-dispatch.json.
  - BACKUP: tar+gz the vault + config + cron entries to a timestamped
    archive in vault/backups/.
  - RESTORE: --dry-run first; --force needed to actually restore.
  - RECOVER: one-command recovery (--latest-backup or --bootstrap).
  - Done when: each mode runs end-to-end with verifiable artifacts AND
    operator cockpit HTML opens cleanly in a browser.

P8 — Cron migration
  - Edit ~/.hermes/cron/jobs.json to add hub jobs:
    refresh every 6h, DAILY_SUMMARY at 07:00,
    MIDDAY_FOCUS at 13:00, SUBCONSCIOUS_BRIEF at 21:00.
  - DO NOT delete or pause the 7 per-spoke daily jobs without explicit
    operator approval. Show the diff first.
  - Done when: jobs.json has the 4 new hub entries AND `last_run_at`
    populates after the next scheduled tick (or after a manual
    `hermes cron run-now <job-id>` if the operator approves it).

P9 — Migrate corvuseye + securesphere from flat → nested layout
  - SKIP this phase if P4 brings these spokes' research entirely
    hub-side via collectors. Otherwise:
  - Create <profile>/workspace/research-vault/ structure for each.
  - Move <profile>/{context,dossiers,research}/ INTO nested vault.
  - Replace <profile>/scripts/research_agent_loop.py with the standard
    nested-layout entrypoint OR leave the legacy script and just
    populate the vault from existing data.
  - Done when: hub source-balance.json shows both spokes as `active`
    instead of `vault_missing`.

VERIFICATION DISCIPLINE (per phase):
- After implementing each phase, run a real REFRESH end-to-end and read
  the artifacts. Don't claim done from code-review alone.
- Show the operator the relevant diff + invocation output BEFORE the
  next phase starts. Get a 👍 if the phase touches stateful infrastructure
  (cron, downstream-agent files, the global hermes config).
- Update the roadmap (~/Corvus/CStar/docs/plans/cstar-spoke-hardening-
  roadmap.md) after each phase: move the line from "Open" to
  "Already landed" with timestamp + verification note.

STOPPING CONDITIONS — pause and ask the operator before:
- Editing global ~/.hermes/config.yaml (you may, but flag the diff first)
- Editing ~/.hermes/cron/jobs.json (always show diff first)
- Deleting any directory under ~/Corvus/ or ~/.hermes/profiles/
- Adding a new collector that needs API credentials (X, HF Pro, etc.)
- Reaching ~6 hours of cumulative session work — checkpoint with the
  operator before continuing into the next chunk

WHAT "FULLY DONE" LOOKS LIKE:
- All 9 acceptance-criteria items in roadmap #H1 ☐ → ✓
- Cron schedule produces hub artifacts on its own (not just manual runs)
- Operator cockpit HTML readable, lists current claims + verification
  queue depth + handoff lane summary
- knowledge/findings.jsonl has entries from ≥3 distinct collectors
- knowledge/claims.jsonl has ≥3 promoted claims with provenance trails
- queue/verification-review.md has ≥3 parked items with reasoning
- queue/buildroom-handoff.json has ≥1 routed implementation suggestion
- wiki/concepts/ has ≥10 cross-linked concept pages
- A REFRESH run produces a degraded-state banner correctly when one
  collector is intentionally broken (test the failsafe end-to-end)
- The operator can read ops/operator-cockpit.html and answer "what
  did the hub learn this week?" without grepping the vault

When everything above is done: write a single-paragraph summary in
~/Corvus/CStar/docs/plans/cstar-hub-completion-summary.md describing
what shipped, the final verification commands run, and any operator
follow-ups (e.g., handoff lanes are write-only until downstream agents
exist — that's a separate topology buildout, not your job here).
```

---

## Notes for the operator

**Why this prompt is shaped this way**:
- Cold-start agents need anchor files first; reading order matters because the SOUL.md sets boundaries the agent must respect throughout.
- Hard constraints come BEFORE phases so the agent can't lose track of them mid-execution. The "all LLM work goes through Hermes/MiniMax-M2.7" rule is the single most important one.
- Phase order is dependency-driven: P3 produces the claims that P5 wikifies and P6 routes; P4 multiplies the input volume that P3-P6 process; P7 surfaces everything; P8 schedules; P9 is a final cleanup.
- Stopping conditions exist because some actions (cron edits, global config, dir deletions) have blast radius beyond the hub.
- "Fully done" criteria are observable behaviors, not "code looks good" — the agent has to demonstrate each works.

**When to use this prompt**:
- Fresh Claude Code session in `/home/morderith/Corvus/CStar`.
- After a long pause and you want to resume the hardening work.
- If you spin up a parallel agent (Codex, Gemini) and want it on the same goal.

**When NOT to use this prompt**:
- If the per-spoke (not hub-level) topology has changed.
- If MiniMax-M2.7 has been deprecated or you've moved to a different provider.
- If P1+P2 baseline at `~/.hermes/profiles/cstar-hub/` has been deleted or significantly refactored — re-baseline first.

**Estimated session time for full P3-P9 completion**: 1.5-2 weeks of focused agent work (~30-50 hours), plus checkpoints. Not a single-session goal. Recommend running in 2-4 hour chunks with operator review between.
