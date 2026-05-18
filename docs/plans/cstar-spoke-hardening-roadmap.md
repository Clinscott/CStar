# CStar Spoke + Kernel Hardening Roadmap

**Created**: 2026-05-15
**Status**: Open backlog (6 items). Items #1, #2, #4, #7 already shipped (see "Already Landed" below).
**Audience**: Downstream agent (Claude / Gemini / Codex) picking this up cold.

---

## Cold-start context (read this first)

You are working in CStar — Node.js/TypeScript hub-and-spoke kernel at `/home/morderith/Corvus/CStar`. The estate has 7 active spokes mounted under `repo:/home/morderith/Corvus/CStar`. The kernel MCP surface is `cstar-kernel` (source of truth: `src/tools/cstar-kernel-mcp.ts`, search for `server.tool(`). CLI launcher is `./cstar`; do NOT use bare `npx tsx cstar.ts`.

**Existing files you will touch repeatedly**:
- `src/tools/cstar-kernel-mcp.ts` — every MCP tool definition.
- `src/node/core/spokes/spoke_projector.ts` — observation projection.
- `src/node/core/spokes/spoke_authority.ts` — 5-file authority contract + `verifyMountToken`.
- `src/node/core/spokes/spoke_doctor.ts` — survey / prune / verify / health.
- `src/node/core/sterling_mandate.ts` — Lore + Isolation + Audit verifier.
- `src/tools/pennyone/intel/repository_manager.ts` — Hall persistence helpers.
- `src/tools/pennyone/intel/database.ts` — database singleton (mount every new helper here).
- `src/tools/pennyone/intel/schema.ts` — SQLite schema (where you add new tables).
- `src/tools/pennyone/intel/bead_controller.ts` — bead + validation persistence.

**Test conventions**:
- Node `--test` via `node scripts/run-tsx.mjs --test <files>` for TS.
- Pure functions get a `*ForRecords` test seam (see `spoke_capability_walker`, `spoke_doctor`).
- Fixtures use `fs.mkdtempSync(path.join(os.tmpdir(), 'prefix-'))` with `try/finally` cleanup.
- Lint baseline: zero ESLint **errors** is the gate. `jsdoc/require-jsdoc` warnings are tolerated (consistent with the file you're editing).

**Critical pre-existing gotchas you must remember**:
- `database.listHallMountedSpokes()` is **hub-scoped**. To see foreign-repo rows (test residue), use `database.listAllHallMountedSpokes()`. The doctor module already does this; any new tool that surveys the whole Hall must too.
- `database.getHallBead(id)` returns a `SovereignBead`, which uses `.id` not `.bead_id`. The Sterling Mandate gate adapts at the boundary — follow that pattern when other places consume beads.
- Bead RESOLVED transitions go through `gateSterlingMandate` in `cstar-kernel-mcp.ts`. **Do not bypass.** If you need to resolve from a new code path, route through `verifySterlingMandate`.
- The `cstar_spoke` MCP tool already has 9 actions: `list / link / unlink / inspect / project / doctor / prune / verify / health`. Adding more = update the zod enum + the description + the handler dispatch.
- Mount token preservation order: `IDENTITY.json` > Hall `metadata.authority.mount_token` > new UUID. New code that touches tokens must honor this.

**Constants you can reuse**:
```typescript
// from spoke_projector.ts
SPOKE_PROFILE_DIR = '.cstar'

// from spoke_authority.ts
SPOKE_CONTRACT_VERSION = '1.0'
IDENTITY_FILE = 'IDENTITY.json'
CSTAR_CONTRACT_FILE = 'CSTAR_CONTRACT.md'
CAPABILITIES_FILE = 'CAPABILITIES.md'
INTAKE_FILE = 'INTAKE.md'
HUB_ACK_FILE = 'HUB_ACK.json'

const HUB_KERNEL_VERSION = '1.0.0'
```

---

## Already landed (DO NOT re-implement)

| # | Item | Where | Verified |
|:--|:---|:---|:---|
| 1 | Mount-token gate enforced on bead/engram intake | `verifyMountToken` in `spoke_authority.ts`, wired into `resolveSpokeAnchor` (`cstar-kernel-mcp.ts:336+`) | live + tests |
| 2 | Sterling Mandate enforcement at RESOLVED transitions | `sterling_mandate.ts` + `gateSterlingMandate` in `cstar-kernel-mcp.ts` | live + 14 tests |
| 4 | `cstar_spoke action=health` + heartbeat write | `healthCheckSpoke` in `spoke_doctor.ts`, heartbeat hooks in link/project paths | live all 7 spokes |
| 7 | `cstar_spoke action=verify` (sha256 + token drift detection) | `verifySpoke` in `spoke_doctor.ts` | tamper test verified |
| H0a | Hermes bug-stabilization sweep (4 fixes) | Moonshot path-case (cron prompt + `spoke-research.py` canonical-case map); spoke-research.py timeout 120→300s + degraded-state honesty marker; agent-browser orphan profile + loop script removed; `repeat.times: null` → `999` on corvuseye + securesphere job entries | 2026-05-15, executed live |
| H0b | Generalized canonical-case auto-resolver in `spoke-research.py` (replaces hardcoded SLUG map with directory scan); 8 lowercase scratch dirs cleaned from `~/Corvus/`; M2.7 model migration (spoke-research.py + cstar-hub config + global `~/.hermes/config.yaml` compression model) | `_resolve_corvus_dir()` in spoke-research.py; `~/.hermes/config.yaml` compression model M2.5→M2.7 | 2026-05-15 |
| H1-P1+P2 | **Hub-level research agent — scaffold + collection-lane primitive + cross-cutting Hermes synthesis (P1+P2 collapsed)** | `~/.hermes/profiles/cstar-hub/` full vault structure; `SOUL.md`, `config.yaml`, `SKILL.md`; `research_agent_loop.py` with BOOTSTRAP + REFRESH modes; collection-lane primitive walks 7 spokes' findings.jsonl with content-hash dedup + provenance tagging; cross-cutting synthesis via Hermes/MiniMax-M2.7 returns trends + cross_implications + verification_gaps; honest degraded-state reporting | 2026-05-15: BOOTSTRAP 43ms 8 artifacts; REFRESH 17.9s 5 new findings + 1 hub_synthesis record + 3 verification gaps; correctly flagged corvuseye + securesphere as `vault_missing` (flat layout) |
| H1-P3 | **Claims promotion + verification queue.** Promotion pass against `min_claim_confidence=0.7` + `promotion_requires_corroborating_findings=2`. High-conf findings → `knowledge/claims.jsonl` with `promoted_from` corroborator-id arrays; everything else → `queue/verification-leads.json` (JSON-array, dedupe by stable lead id) + rendered `queue/verification-review.md`. Synthesis verification_gaps route with `kind=synthesis_gap`. | 2026-05-15: 4 claims promoted, 100 verification leads parked. |
| H1-P4 | **External collectors — GitHub + RSS.** `collectors/github_collector.py` star-count→confidence mapping (≥1k→0.7, ≥10k→0.85, ≥50k→0.9) + lane-level `claim_candidates` for cross-repo corroboration. `collectors/rss_collector.py` curated feeds, HN keyword-filtered per lane. Both write `source=collector:<name>` provenance. X / HF / ArXiv deferred. | 2026-05-15: GitHub 65 findings across 6 lanes, RSS 56-57 findings across 7 lanes; source-balance non-zero under both collectors. |
| H1-P5 | **Wiki compile pipeline.** `tools/compile_wiki.py` walks dossiers + claims + active findings → Obsidian-style concept pages with `[[wikilinks]]` Related sections, plus `claims-summary` article and indexes for both. Wired into REFRESH; idempotent. | 2026-05-15: 146 concept pages; 144 carry `## Related` cross-link sections; `wiki/articles/index.md` lists `[[Claims Summary]]`. |
| H1-P6 | **Handoff lanes via Hermes/MiniMax-M2.7.** `tools/route_handoffs.py` makes ONE Hermes call per refresh classifying new claims into 6 lanes (`buildroom/content/monetize/subc/verify/watch`); spec-required schema `{claim_id, suggested_action, urgency, lane, routed_at, routed_by_model, rationale}`; deterministic keyword-scorer fallback labels itself `routed_by_model: "fallback:keyword_scorer (<reason>)"`. Write-only until downstream agents exist. | 2026-05-15: 12 items routed via M2.7 across 4 lanes; buildroom received 2 implementation-flavored routings. |
| H1-P7 | **6 remaining modes + operator surfaces.** `daily-summary` (refresh + render `~/wiki/queries/cstar-hub-daily-…`), `subconscious` (cross-spoke ≥3-spoke patterns + `cstar-hub-subc-…`), `midday-focus` (NO scrape — `tools/render_cockpit.py` for `ops/operator-cockpit.html` + `operator-action-ledger.md` + `operator-action-dispatch.json` + midday digest), `backup` (snapshots ledgers/queues to `.backups/`), `restore` (default dry-run, requires `--force`), `recover` (`--latest-backup` or `--bootstrap` self-heal). Cockpit HTML renders 8 cards + open-actions table. Collector-degraded now lifts into overall `degraded=true` with banner in operator-brief. | 2026-05-15: each mode runs end-to-end; cockpit HTML renders cleanly; degraded-state failsafe verified live (banner appears on broken collector + receipt status flips). |
| H1-P8 | **Cron migration.** `~/.hermes/cron/jobs.json` gained 4 hub jobs: `040172f9c0f6` refresh `0 */6 * * *`, `51a27512b0d8` daily 08:00 ET, `504fe9910176` midday 12:00 ET, `2783e3596dc1` subconscious 03:00 ET. 7 per-spoke daily jobs paused (`paused_at: 2026-05-15T14:10 ET`), not deleted — re-enable with `hermes cron resume <id>`. | 2026-05-15: 4 hub jobs `state=scheduled`, `next_run_at` populated. |
| H1-P9 | **Layout migration for corvuseye + securesphere — SKIPPED per spec.** Roadmap explicitly authorizes skip "if P4 brings these spokes' research entirely hub-side via collectors". P4 cybersecurity coverage = 57 GitHub findings; computer_vision queries wired (no results this round). Migration would write to per-spoke vaults and violate hard constraint #2. corvuseye/securesphere remain `vault_missing` in source-balance — honest reporting since hub-side coverage stands in. | 2026-05-15: documented in `docs/plans/cstar-hub-completion-summary.md`; no code change. |

Other already-built surface: `cstar_spoke action=doctor / prune / project`, spoke projector with Hermes integration, full authority handshake (5 contract files), `removeHallMountedSpokeByRootPath`, `listAllHallMountedSpokes`, `touchSpokeHeartbeat`, `getValidationRunById`.

---

## Open items, ranked by harm-prevented-per-hour

Each item is self-contained. Pick any order; cross-item dependencies are flagged where they exist.

---

### #H1 Hub-level Hermes research agent (per Graeme spec) — P3 onward

**Severity**: HIGH (was), MEDIUM (now — P1+P2 shipped 2026-05-15 with cross-cutting synthesis live; remaining phases extend the spec).

**Status**: P1+P2 LANDED. Hub profile exists at `~/.hermes/profiles/cstar-hub/` with full vault, BOOTSTRAP/REFRESH modes work end-to-end, cross-cutting synthesis via Hermes/MiniMax-M2.7 produces honest output. Remaining phases below.

**Why**: User's chosen topology is "hub-level research agent + per-spoke collection lanes" (decided 2026-05-15). Per-spoke standalone profiles can't deliver the full Graeme value: separation of raw → finding → claim → verified knowledge, verification queue, handoff lanes to other tiers, wiki layer, operator cockpit. There are still no downstream agents (main / coder / content) for the research to feed — that's a separate topology buildout.

**Acceptance criteria** (✓ = landed in P1+P2; ☐ = open):
- ✓ Hub profile at `~/.hermes/profiles/cstar-hub/` with vault (16 dirs created — context/config/dossiers/knowledge/queue/notes/raw/sources/decisions/runs/indexes/health/ops/wiki + wiki/concepts + wiki/articles + topics)
- ✓ Per-spoke findings flow UP via collection-lane primitive with content-hash dedup + provenance tagging
- ✓ Cross-cutting synthesis via Hermes/MiniMax-M2.7 (REFRESH mode)
- ✓ Source-balance dashboard: `ops/source-balance.json` tracks per-spoke status (active/stale/missing) + counts
- ✓ Health check (basic): `health/latest-health-check.json` reports degraded if any spoke vault missing or synthesis fails
- ✓ Operator brief: `notes/operator-brief.md` with collection-lane table + synthesis section + health summary
- ✓ Run receipts: `runs/run-receipt-*.json` on every BOOTSTRAP and REFRESH
- ✓ Honest degraded-state reporting throughout (no fake-success)
- ✓ **P3**: Evidence chain wired raw → finding → claim → verified with promotion logic
- ✓ **P3**: Verification queue: `queue/verification-review.md` populated from synthesis verification_gaps + low-confidence findings
- ✓ **P4**: External collectors (X / GitHub / RSS / web / HuggingFace / ArXiv) — GitHub and RSS collectors active in REFRESH; X/ArXiv deferred to future P4 expansion
- ✓ **P5**: Wiki compile pipeline: `tools/compile_refresh_to_wiki.py` rebuilds `wiki/concepts/` and `wiki/articles/` each refresh
- ✓ **P6**: Handoff lanes: `queue/{buildroom,content,monetize,subc,verify,watch}-handoff.json` writers
- ✓ **P7**: 6 remaining skill modes (DAILY_SUMMARY / SUBCONSCIOUS_BRIEF / MIDDAY_FOCUS / BACKUP / RESTORE / RECOVER) + operator cockpit HTML + action ledger + action dispatch
- ✓ **P8**: Cron migration — 4 hub jobs created (6-hourly refresh, daily digest 8am, midday focus 12pm, subconscious 3am); 7 per-spoke daily jobs paused. Migration complete 2026-05-15.
- ✓ **P9**: SKIPPED per spec ("if P4 brings these spokes' research entirely hub-side via collectors"). P4 covers cybersecurity (57 GitHub findings) + computer_vision (queries wired). Migration to nested layout would write to per-spoke vaults, violating hard constraint #2. corvuseye/securesphere remain `vault_missing` in source-balance — honest reporting since hub-side collector coverage stands in. See `docs/plans/cstar-hub-completion-summary.md`.

**Implementation sketch (P3 onward)**:
- **P3 — Claims promotion + verification queue**: per-refresh pass that examines fresh findings, clusters by topic, promotes high-confidence findings to `knowledge/claims.jsonl`, routes low-confidence to `queue/verification-review.md` + `queue/verification-leads.json`. Quality gate from `config.yaml` (currently `min_claim_confidence=0.7`, `promotion_requires_corroborating_findings=2`). Synthesis verification_gaps from P2 already populate naturally — P3 closes the loop.
- **P4 — External collectors**: each collector is a separate integration. Recommend: GitHub first (cross-repo trending in lanes — easy API), then RSS (low-friction high-signal). Defer X API (account binding overhead) and ArXiv until first 2 are proven.
- **P5 — Wiki compile**: `tools/compile_refresh_to_wiki.py` walks dossiers + claims + findings, generates Obsidian-style concept pages with `[[wikilinks]]`, rebuilds `wiki/articles/index.md`. Idempotent.
- **P6 — Handoff lanes**: 6 JSON files in `queue/`. Each refresh, examine new claims for action implications, route via:
  - `buildroom-handoff.json` → coder agent (when implementation work is implied)
  - `content-handoff.json` → content agent
  - `monetize-handoff.json`
  - `subc-handoff.json` → subconscious / pattern-noticer
  - `verify-handoff.json` → verification agent
  - `watch-handoff.json` → continuous monitoring
  Until downstream agents exist, these are write-only ledgers — but they capture the routing intent for future consumers.
- **P7 — Remaining 6 modes + operator surfaces**: DAILY_SUMMARY / SUBCONSCIOUS_BRIEF / MIDDAY_FOCUS / BACKUP / RESTORE / RECOVER. The cockpit HTML is a static-render of the operator-brief + lane status table + recent decisions + verification queue depth.
- **P8 — Cron migration**: edit `~/.hermes/cron/jobs.json` to add hub jobs (refresh every 6h + DAILY_SUMMARY + MIDDAY_FOCUS + SUBCONSCIOUS_BRIEF). Once hub is producing real research, the per-spoke daily cron jobs can be paused — but only if their per-spoke loops are also re-pointed at the hub OR replaced with real collectors that feed the hub.
- **P9 — Layout migration for corvuseye + securesphere**: move flat-layout content into `<profile>/workspace/research-vault/` so they show up as `active` not `vault_missing` in hub source-balance. May be skipped entirely if P4 brings them under hub-side collection.

**Tests** (integration-flavored, since file-system + cross-profile):
- ✓ P1+P2 verified live 2026-05-15 (BOOTSTRAP 43ms; REFRESH 17.9s → 5 new findings, 3 verification gaps from real M2.7 synthesis, correctly flagged 2 spokes as vault_missing).
- ✓ P3: promotion logic moves a high-confidence finding to claims, leaves a low-confidence finding in verification queue. Covered by `tests/test_promotion.py::TestPromotionGate` (7 cases incl. distinct-source rejection) + verified live (4 lane-level claims promoted from cross-source corroboration).
- ✓ P4: each collector produces findings tagged with its source. Verified live 2026-05-15 (GitHub 65 findings `provenance.collector=github`, RSS 56-57 findings `provenance.collector=rss`).
- ✓ P5: wiki compile produces Obsidian-clickable links. Verified live (146 concept pages, 144 with `## Related` cross-link sections; `claims-summary` article emitted; index.md present).
- ✓ P6: a synthesized claim with action implication writes to the correct handoff lane. Verified live 2026-05-15 (12 items routed via Hermes/M2.7: buildroom=2 implementation-flavored claims, subc=3, verify=3, watch=4).
- ✓ Hardening Pass 2 (2026-05-15 ~19:00 UTC): 52 unit tests at `~/.hermes/profiles/cstar-hub/skills/research/research-agent-loop/tests/` covering candidate normalization, corroboration index, source labels (collector vs spoke), JSON-array vs JSONL detection, promotion gate (incl. single-source rejection), all 4 verify subactions, all 4 handoff subactions, cost ledger logging, auto-sweep helpers, tee stream tolerance, utility helpers. Concurrent-refresh failsafe + degraded-state banner + auto-sweep all verified live.

**Remaining effort (P3-P9)**: estimated 1.5-2 weeks. Largest sub-items: P3 promotion logic (~2 days), P4 collectors (~1 day per source × 5 sources), P5 wiki (~1 day), P6 handoff (~0.5 day), P7 modes (~1.5 days), P8 cron (~0.5 day), P9 layout (~0.5 day).

**Dependencies**: none from CStar side. Reference `~/wiki/cstar-research-architecture.md` (operator's earlier notes) and the Graeme article (the spec). The P1+P2 baseline at `~/.hermes/profiles/cstar-hub/` is the foundation everything else extends.

---

### #3 Engram parent-bead provenance gate

**Severity**: HIGH (closes a real trust hole — a read_write spoke can currently anchor engrams to ANY bead in the Hall).

**Why**: `handleEngramRecord` (`cstar-kernel-mcp.ts:1860+`) accepts `(intent, bead_id, spoke?)` but does not verify that `bead_id` actually originated from the declared `spoke`. A compromised/buggy spoke could attach engrams to beads owned by other spokes, polluting cross-spoke war-game scoring and lessons.

**Acceptance criteria**:
- When `args.spoke` is set, the gate verifies `database.getHallBead(bead_id).metadata.spoke_slug` (set during `cstar_bead create`) matches `args.spoke`.
- On mismatch: hard reject with explicit error naming both spokes.
- When the bead has no `spoke_slug` metadata: allow (legacy beads); record `provenance_check: 'unproven'` in the engram metadata.
- When `args.spoke` is absent: pass through unchanged (hub-anchored engrams unaffected).

**Implementation sketch**:
1. New helper in `cstar-kernel-mcp.ts` (or extract to `src/node/core/engram_provenance.ts` if it grows):
   ```typescript
   function gateEngramProvenance(beadId: string, spokeSlug: string | undefined): { verdict: 'ok' | 'unproven' | 'mismatch'; reason?: string }
   ```
2. Call from `handleEngramRecord` before the INSERT, after `resolveSpokeAnchor` but before scoring.
3. On `mismatch` → `return textResponse({ error: ... }, true)`.
4. On `unproven` → continue, but include in the returned engram payload.
5. Stamp `metadata.provenance` on the engram for audit.

**Tests** (`tests/unit/engram_provenance.test.ts`):
- ok: matching slug → verdict='ok'
- mismatch: spoke claims A, bead's metadata.spoke_slug=B → 'mismatch'
- unproven: bead has no spoke_slug metadata → 'unproven'
- hub-anchored: no spoke arg → 'ok' (bypass)

**Effort**: ~1.5 hr including tests.

**Dependencies**: none (independent of all other items).

---

### #5 Stale-projection drift detection

**Severity**: MEDIUM (silent staleness — `cstar_manifest` returns stale capability sets indefinitely until someone re-projects).

**Why**: Every spoke has `last_scan_at` populated by the projector. Nothing checks staleness. Spokes can grow 10 new skills and the hub manifest never updates. The `doctor` survey already returns `last_scan_at` per row but doesn't classify a spoke as "stale by TTL".

**Acceptance criteria**:
- Add a 5th doctor bucket: `stale-projection` for LIVE rows where `Date.now() - last_scan_at > TTL`.
- TTL default = 7 days, configurable per call via `staleness_threshold_days` arg.
- Doctor report's `counts` includes the new bucket.
- New convenience action: `cstar_spoke action=refresh` — runs `project` on every spoke whose `last_scan_at` exceeds the TTL. Returns per-spoke outcomes.
- Optionally surface stale spokes in `cstar_manifest` response so the host LLM knows the data may be aged.

**Implementation sketch**:
1. In `spoke_doctor.ts`:
   ```typescript
   export type SpokeBucket = 'live' | 'phantom' | 'duplicate' | 'stale' | 'stale-projection';
   ```
   Update `surveySpokesForRecords` to take an optional `stalenessThresholdMs` arg (default 7 * 86400_000) and demote live rows whose `last_scan_at + threshold < now` to `stale-projection`.
2. New function `refreshStaleProjections(thresholdMs)` that iterates `surveySpokes()`, collects `stale-projection` rows, calls `projectSpoke` + `establishAuthority` on each. Returns array of outcomes.
3. Wire into `handleSpoke` as `action='refresh'`. Add to the zod enum.
4. Existing tests need updates: the `SpokeBucket` enum widened.

**Tests**:
- Stale row with `last_scan_at = now - 8 days` classified as `stale-projection`.
- Fresh row (under TTL) stays `live`.
- `refresh` action regenerates artifacts and bumps `last_scan_at`.

**Effort**: ~1.5 hr.

**Dependencies**: `surveySpokesForRecords` and projector already exist; just compose them.

---

### #6 hall_spoke_audit log table

**Severity**: MEDIUM-HIGH (incident response prerequisite — no current audit trail for link/unlink/quarantine/prune/token-rotation events).

**Why**: Today, an unlink leaves no trace. If a spoke is unlinked + re-linked maliciously, the gap is invisible. We have no record of WHO did WHAT and WHEN at the registry level. This is a foundational gap for any future trust review.

**Acceptance criteria**:
- New SQLite table `hall_spoke_audit` with columns: `audit_id` (PK, uuid), `slug`, `repo_id`, `event_kind`, `actor`, `payload_json`, `created_at`.
- `event_kind` enum: `link`, `unlink`, `relink`, `project`, `prune`, `quarantine`, `rotate_token`, `health_fail`, `verify_drift`.
- Every state-mutating action in `handleSpoke` writes an audit row.
- `cstar_spoke action=audit_log` returns recent events (paginated, default last 50).
- Filter by slug, event_kind, date range.

**Implementation sketch**:
1. In `src/tools/pennyone/intel/schema.ts`, add the table:
   ```sql
   CREATE TABLE IF NOT EXISTS hall_spoke_audit (
       audit_id TEXT PRIMARY KEY,
       slug TEXT NOT NULL,
       repo_id TEXT NOT NULL,
       event_kind TEXT NOT NULL,
       actor TEXT,
       payload_json TEXT,
       created_at INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_hall_spoke_audit_slug ON hall_spoke_audit(slug, created_at);
   CREATE INDEX IF NOT EXISTS idx_hall_spoke_audit_event ON hall_spoke_audit(event_kind, created_at);
   ```
   Schema migrations in CStar are additive (CREATE TABLE IF NOT EXISTS); no migration version bump needed unless removing.
2. In `src/tools/pennyone/intel/repository_manager.ts`, add:
   ```typescript
   export function recordSpokeAuditEvent(event: {
       slug: string; repo_id: string; event_kind: string; actor?: string; payload?: unknown;
   }): void
   export function listSpokeAuditEvents(filter?: {
       slug?: string; event_kind?: string; since_ms?: number; limit?: number;
   }): SpokeAuditEvent[]
   ```
   Export via `database.ts` singleton.
3. Hook every state-mutating branch in `handleSpoke` (link, unlink, prune outcomes, project) + the new `quarantine` / `rotate_token` actions (#9, #8) to call `recordSpokeAuditEvent`.
4. Hook `verifySpoke` drift detection: when `drift_detected=true`, write a `verify_drift` event.
5. New action: `action='audit_log'` with optional `slug`, `event_kind`, `since_days`, `limit` args.

**Tests** (`tests/unit/spoke_discovery/spoke_audit.test.ts`):
- Link writes a `link` event.
- Unlink writes an `unlink` event.
- Prune writes per-target `prune` events (one per target).
- Verify-with-drift writes `verify_drift` event.
- Filter by slug / event_kind / since_ms returns correct subset.
- Limit caps result size.

**Effort**: ~2 hr including schema + helpers + hooks + tests.

**Dependencies**: Best to do BEFORE #8 and #9 so they can write audit entries from day one.

---

### #8 Token rotation MCP/CLI surface

**Severity**: MEDIUM (if a token leaks, today you'd have to manually edit the Hall — operationally untenable).

**Why**: `establishAuthority` already accepts `rotateToken=true`. Neither CLI nor MCP exposes it. Token rotation is the standard incident-response action for credential compromise.

**Acceptance criteria**:
- New action: `cstar_spoke action=rotate_token slug=<x> reason=<string>`.
- Reads existing spoke, calls `establishAuthority({...existing, rotateToken: true})`.
- New mount_token written to IDENTITY.json + Hall in one transaction.
- Old token immediately invalid (the next `resolveSpokeAnchor` call from a stale IDENTITY would mismatch).
- Reason is required and recorded in the audit log (#6 dependency).
- CLI surface: `./cstar spoke rotate-token <slug> --reason "..."`.

**Implementation sketch**:
1. In `handleSpoke` (`cstar-kernel-mcp.ts`), add `action='rotate_token'` branch:
   ```typescript
   if (action === 'rotate_token') {
       if (!slug) return textResponse({ error: 'rotate_token requires slug' }, true);
       const reason = (args.reason ?? '').trim();
       if (reason.length === 0) return textResponse({ error: 'rotate_token requires reason' }, true);
       const found = database.getHallMountedSpoke(normalized);
       if (!found) return textResponse({ error: 'spoke not registered' }, true);
       const r = establishAuthority({
           slug: normalized, rootPath: found.root_path,
           hubRepoId: found.repo_id, hubRoot: root,
           hubKernelVersion: HUB_KERNEL_VERSION,
           trustLevel: found.trust_level, writePolicy: found.write_policy,
           rotateToken: true,
       });
       // persist new mount_token to Hall metadata.authority
       database.saveHallMountedSpoke({ ...found, ..., metadata: {...found.metadata, authority: r.metadataPatch} });
       database.recordSpokeAuditEvent({ slug: normalized, repo_id: found.repo_id, event_kind: 'rotate_token', payload: { reason, new_token_prefix: r.identity.mount_token.slice(0,8) } });
       return textResponse({ status: 'rotated', slug, mount_token: r.identity.mount_token });
   }
   ```
2. Add `reason: z.string().optional()` to the zod schema.
3. CLI: add `./cstar spoke rotate-token <slug> --reason "..."` subcommand in `src/node/core/commands/spoke.ts` — mirror the link/unlink shape.

**Tests** (`tests/unit/spoke_discovery/token_rotation.test.ts`):
- Rotating produces a new token, different from the prior.
- Missing reason → rejected.
- Old token no longer verifies via `verifyMountToken`.
- New token persists to IDENTITY.json.

**Effort**: ~1 hr.

**Dependencies**: #6 (audit log) — rotation events should be logged.

---

### #9 `action=quarantine` workflow with reason

**Severity**: MEDIUM.

**Why**: Trust level can be `quarantined` (the kernel already rejects bead intake from quarantined spokes), but the only way to flip it is to re-link with `--trust quarantined`. No recorded reason. No clear path to lift quarantine.

**Acceptance criteria**:
- New action: `cstar_spoke action=quarantine slug=<x> reason=<string>`.
- Sets `trust_level='quarantined'` on the Hall row.
- Writes audit event with reason.
- Stamps `<spoke>/.cstar/QUARANTINE.md` in the spoke directory explaining (a) why quarantined, (b) when, (c) what's blocked, (d) how to un-quarantine.
- Symmetric `cstar_spoke action=unquarantine slug=<x> reason=<string>` flips back to `trusted` (or the original trust level if cached in metadata).
- Un-quarantine writes its own audit event.
- Regenerates `INTAKE.md` to reflect the new state (existing projector handles this if you call `establishAuthority` after).

**Implementation sketch**:
1. Add the two actions in `handleSpoke`. Each:
   - Validates spoke exists.
   - Updates `trust_level` via `saveHallMountedSpoke`.
   - Calls `establishAuthority` to refresh INTAKE.md (which renders differently for `quarantined`).
   - Writes `QUARANTINE.md` (or removes it on un-quarantine).
   - Records audit event.
2. Cache the prior trust level in `metadata.pre_quarantine_trust_level` so un-quarantine restores it (default 'trusted' if absent).
3. Update CLI: `./cstar spoke quarantine <slug> --reason "..."`.

**Tests**:
- Quarantine flips trust_level + writes QUARANTINE.md + INTAKE.md reflects quarantined state.
- `cstar_bead create spoke=<quarantined>` now rejected (already handled by `resolveSpokeAnchor`).
- Un-quarantine restores prior trust level.
- Both actions require non-empty reason.

**Effort**: ~1.5 hr.

**Dependencies**: #6 (audit log).

---

### #10–14 Nice-to-have (group these or skip)

These are quality-of-life improvements. Each is independently shippable; pick whichever the current operational pain points warrant.

#### #10 `action=discover` — filesystem-walk for unmounted spokes
- Scan a given root for repo-shaped directories (`.git/` or `package.json` or `Cargo.toml`) that have no entry in `hall_mounted_spokes`.
- Returns list of candidates with `suggested_slug` (derived from dir name, normalized) and detected stack.
- Read-only.
- Effort: ~1 hr.

#### #11 `action=batch_link` — bulk onboarding
- Accept array of `{slug, root_path, trust_level?, write_policy?}` and link each in sequence.
- Stop-on-first-error vs continue-on-error mode via arg.
- Returns per-spoke outcome.
- Effort: ~45 min.

#### #12 `action=rebind` — hub relocation
- For when the hub directory itself moves (git clone to new path).
- Updates `hub_root` in every spoke's IDENTITY.json and HUB_ACK.json across all 7+ spokes.
- New mount_tokens are NOT minted (rotation is a separate concern); only the hub_root field changes.
- Required arg: `new_hub_root: string`.
- Effort: ~1 hr.

#### #13 CLI parity for new actions
- `./cstar spoke doctor / prune / verify / health / rotate-token / quarantine / discover / batch-link / refresh`.
- Mirror the MCP arg shape in commander syntax.
- Pure UX improvement; humans get the same surface as MCP.
- Effort: ~2 hr for the full set, ~15 min per action.

#### #14 PennyOne backup primitive
- `cstar_hall action=backup` writes a timestamped snapshot of `.stats/pennyone.db` to `.stats/backups/pennyone-YYYY-MM-DDTHH-MM-SS.db`.
- `cstar_hall action=restore path=<x>` swaps the active DB (with explicit confirmation).
- Don't worry about WAL files — `Database#backup()` from `better-sqlite3` handles atomicity.
- Adds a separate `cstar_hall` MCP tool (currently doesn't exist) OR extends an existing one.
- Effort: ~1.5 hr.

---

## Execution playbook for the downstream agent

1. **Before touching anything**: run the regression suite to confirm a clean baseline:
   ```bash
   unset NODE_OPTIONS
   node scripts/run-tsx.mjs --test 'tests/unit/spoke_discovery/*.test.ts' tests/unit/sterling_mandate.test.ts tests/unit/test_cstar_kernel_mcp.test.ts tests/unit/test_spoke_command.test.ts tests/unit/test_spoke_runtime.test.ts
   ```
   Expected: **156/156 pass** as of this plan's authorship.

2. **Pick one item**. Recommend order: **#6 (audit log) FIRST**, then **#3 (engram provenance)** in parallel, then #5 / #8 / #9 once #6 is in. The nice-to-haves last.

3. **Plan files first** if any of these touch the public MCP surface: emit the Augury block (`Route: HARDEN -> ...`), confirm scope with the user if it would change a tool signature for downstream hosts.

4. **Test pattern to follow** (proven across spoke_authority / spoke_doctor / sterling_mandate):
   - Pure function with a `*ForRecords` test seam where the function reads the Hall.
   - Live wrapper that calls `database.*` for production.
   - Unit tests use `mkdtemp` fixtures, never the live PennyOne.
   - One integration / smoke test per feature against the live Hall.

5. **Before claiming done**:
   - Lint: `npx eslint <new files> <modified files>` — zero errors.
   - Regression suite passes.
   - Smoke test the live MCP behavior (e.g., `node scripts/run-tsx.mjs -e "..."` calling the handler directly).
   - Update this file: move the item from "Open" to "Already landed" at the top.

6. **Update memory**:
   - User's persistent memory lives at `/home/morderith/.claude/projects/-home-morderith-Corvus-CStar/memory/`.
   - Existing entries: `project_spoke_init_skill.md`, `reference_hermes_research.md`.
   - Add a brief note when you ship something material.

---

## Patterns / anti-patterns from prior work

**DO**:
- Use `database.listAllHallMountedSpokes()` when surveying across repos. Hub-scoped listing was a real bug that took a verification run to catch (the doctor first reported zero phantoms because the hub-scoped listing hid them).
- Return structured envelopes from MCP actions: `{ status: 'ok', report: {...} }` for read-only, `{ status: 'mutated', changes: [...] }` for writes.
- Use `dry_run=true` default for any destructive bulk operation (prune already does this).
- Adapt `SovereignBead` ↔ `HallBeadRecord` at boundaries — both are real types; pick the one closest to the source and adapt at the call site.
- Embed deterministic timestamps in fixtures (`now: new Date('2026-...')`) to avoid flaky tests on rapid same-ms operations.

**DON'T**:
- Don't add `--no-verify` to git commands. Hooks exist for a reason.
- Don't issue raw SQL `DELETE` from a feature handler unless there is no kernel primitive — extend `repository_manager.ts` instead.
- Don't bypass `gateSterlingMandate` from any new resolve path.
- Don't write to a spoke directory outside `<spoke>/.cstar/`.
- Don't kill the Sterling Mandate gate via metadata gymnastics — the `force=true + force_reason` path exists for a reason; emergency override should be visible.

---

## Snapshot: current surface (as of 2026-05-15)

- `cstar_spoke` actions: `list, link, unlink, inspect, project, doctor, prune, verify, health` (9)
- `cstar_bead` actions: `get, list, create, update_status, claim, resolve, block` (Sterling Mandate gates `resolve` + `update_status=RESOLVED`)
- Other MCP tools: `cstar_handoff, cstar_hall_search, cstar_hall_maintenance, cstar_augury, cstar_doctor, cstar_verify_plan, cstar_spoke_bead_import, cstar_record_result, cstar_engram_record, cstar_war_game_score, cstar_manifest, cstar_skill_info, cstar_spoke_journal, cstar_status, cstar_evolve, cstar_intent_route, cstar_warden, cstar_telemetry` (≈19 tools)
- Live spokes: corvuseye, fallowshallowrpg, moonshot, nexplaynexus, securesphere, taliesin, xo (7)
- Phantom rows: 0
- Tests in spoke + mandate + MCP suite: **156 passing**.

When this plan is complete: `cstar_spoke` will have ~13 actions (+ rotate_token, quarantine, unquarantine, audit_log, refresh, discover, batch_link, rebind) and a hardened security posture worth describing in CLAUDE.md.
