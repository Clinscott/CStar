# BEAD-CSTAR-WAR-GAME-SCORING-001 — Design Record

**Current Intent**: Add a generic war-game scoring schema and MCP/CLI surface to the CStar kernel so attacker-vs-defender Engram conversations are arbitrated by the kernel, not by either combatant. First contest registered: "USB Forge vs USB Sentry" (Claude/CorvusEye vs Codex/SecureSphere). Schema is generic enough to host future contests (network/RF pen tests, agentic prompt injection, etc.).

**Anchor**: `BEAD-CSTAR-WAR-GAME-SCORING-001`, kernel-anchored (no spoke).

**Companion Specs**:
- `CorvusEye/architecture/USB_FORGE_LOOP.md` §3 (three-Engram protocol — the wire format).
- `CorvusEye/docs/design/USB_PENETRATION.md` §3 (Forge contract).
- `SecureSphere/docs/design/USB_SENTRY_FORGE_LISTENER.md` (defender's design).

**Operating Model**: Dia-Logos.

---

## 1. Why the kernel, not either side

The listener (defender) cannot keep score on itself — that would be the boxer reffing their own match. The Forge (attacker) cannot keep score either — it writes its own verdict Engram, which an honest mistake or future cheating attempt could falsify. The kernel is the only party that:

- Sees both producers' Engrams as they land.
- Has no stake in the outcome.
- Already serialises Engram writes through a single record path (`cstar_record_result`), which is the natural hook point.

This bead places the arbiter where it belongs.

## 2. Open Questions (Dia-Logos)

### Q1. Synchronous or lazy scoring?

**Ruling:** synchronous on the *defender's* verdict-Engram write. When `cstar_record_result` fires with `intent` matching any registered contest's `defender_intent_prefix`, the kernel looks up the matching attacker Engram by `shot_id`, derives the outcome, inserts into `war_game_scores`, and emits a `cstar/war-game/scored/<shot_id>` Engram in the same transaction. Lazy scoring (compute on tally-query) was rejected because it makes the live scoreboard impossible without polling history.

### Q2. What defines a "contest"?

**Ruling:** a registered tuple in `war_game_contests`:

- `contest_name` — human label ("USB Forge vs USB Sentry").
- `attacker_label`, `defender_label` — short identifiers ("claude:forge", "codex:sentry").
- `attacker_bead_id`, `defender_bead_id` — anchoring beads.
- `attacker_intent_prefix` — e.g. `usb-forge/shot-fired/`.
- `defender_intent_prefix` — e.g. `usb-sentry/verdict/`.
- `shot_id_path` — JSONPath-like locator into the Engram metadata for the shared join key (default `metadata.shot_id`).
- `expected_path` — locator for the attacker's declared expectation (default `metadata.expected`).
- `terminal_event_path` — locator for the defender's outcome (default `metadata.terminal_event`).

A contest is registered once and then operates indefinitely. Multiple contests can run concurrently; the scoring engine matches an inbound verdict Engram against every contest whose `defender_intent_prefix` matches.

### Q3. Outcome enumeration

Per shot, exactly one outcome is recorded:

| Outcome | Triggered when | Score impact |
|---|---|---|
| `defender_blocked` | attacker `expected = Deflected{..}` AND defender `terminal_event` is a refusal/hit/rejection class | +1 defender |
| `attacker_bypassed` | attacker `expected = Deflected{..}` AND defender `terminal_event = complete` | +1 attacker |
| `false_positive` | attacker `expected = CapturedClean` AND defender `terminal_event` is a refusal/hit class | +1 attacker (Sentry blocked a benign device) |
| `baseline_pass` | attacker `expected = CapturedClean` AND defender `terminal_event = complete` | no point (control sample passed) |
| `inconclusive` | defender `terminal_event` is a timeout/panic/listener-internal failure | no point, recorded |
| `protocol_violation` | defender `terminal_event` is structurally impossible for the scenario_id | no point, flagged for audit |

The mapping from `terminal_event` strings to outcome classes lives in the contest's `terminal_event_class_map_json` so future contests can define their own taxonomy.

### Q4. Protocol-violation detection

**Ruling:** each contest registers a `scenario_compatibility_map_json` — for each `scenario_id`, the set of structurally-valid `terminal_event` values. If the observed `terminal_event` falls outside that set, the score outcome is `protocol_violation`. Catches both honest implementation bugs (defender reports the wrong terminal event) and any future cheating attempt (defender claims it deflected when the scenario can't reach that path).

For the USB Forge vs Sentry contest, the v1 compatibility map is:

```jsonc
{
  "FORGE-MS-001":  ["usb-sentry/complete"],                                              // baseline; only success is valid
  "FORGE-MS-002":  ["usb-sentry/phase1-hit"],                                            // EICAR straddle must hit
  "FORGE-MS-003":  ["usb-sentry/phase1-hit"],                                            // multi-rule must hit
  "FORGE-MS-004":  ["usb-sentry/complete"],                                              // oversized LUN — capture finishes, Phase 2 LUKS-tmpfs refused (a separate Forge assertion)
  "FORGE-MS-005":  ["usb-sentry/complete"],                                              // 4K sectors — capture finishes with right block size
  "FORGE-FS-001":  ["usb-sentry/phase1-hit", "usb-sentry/complete"],                     // malformed FAT — depends on whether userspace parser triggers a hit
  "FORGE-SCSI-001":["usb-sentry/complete"],                                              // recoverable errors retry to completion
  "FORGE-SCSI-002":["usb-sentry/phase1-hit"],                                            // unrecoverable medium error halts with LBA
  "FORGE-HID-001": ["usb-sentry/device-held-rejected"],                                  // pure HID never reaches Phase 1
  "FORGE-HID-002": ["usb-sentry/device-held-rejected", "usb-sentry/phase1-hit"],         // composite — held or, if approved, scanned
  "FORGE-UAS-001": ["usb-sentry/device-held-rejected"]                                   // UAS refusal returns to authorized=0
}
```

Plus the always-valid listener-failure terminal events: `forge-listener-refused`, `forge-listener-timeout`, `forge-listener-panic` (these classify to `inconclusive`, not `protocol_violation`).

### Q5. Score deduplication

**Ruling:** `UNIQUE(contest_id, shot_id)` constraint on `war_game_scores`. A second defender verdict Engram for the same `shot_id` triggers an `UPSERT` that updates `outcome` only if the new outcome is *more severe* (`protocol_violation > attacker_bypassed > false_positive > inconclusive > defender_blocked > baseline_pass`). Otherwise the second write is ignored and logged. This handles defender retries without double-counting and surfaces post-hoc disagreements.

### Q6. Query surface

**Ruling:** one MCP tool `cstar_war_game_score` with bounded actions:

- `register_contest` — register a contest tuple (Q2).
- `tally` — `{ contest_id?, since?, until? } → { contest, scores: { defender_blocked: N, attacker_bypassed: N, ... }, total_shots: N }`.
- `recent` — last N scored events.
- `by_scenario` — breakdown grouped by `scenario_id`.
- `get_score` — single shot lookup by `shot_id`.

And a CLI surface `./cstar war-game <action>` that wraps the same.

## 3. Schema

Additions to `ensureHallSchema` in `src/tools/pennyone/intel/schema.ts`:

```sql
CREATE TABLE IF NOT EXISTS war_game_contests (
    contest_id TEXT PRIMARY KEY,
    repo_id TEXT NOT NULL,
    contest_name TEXT NOT NULL,
    attacker_label TEXT NOT NULL,
    defender_label TEXT NOT NULL,
    attacker_bead_id TEXT,
    defender_bead_id TEXT,
    attacker_intent_prefix TEXT NOT NULL,
    defender_intent_prefix TEXT NOT NULL,
    shot_id_path TEXT NOT NULL DEFAULT 'metadata.shot_id',
    expected_path TEXT NOT NULL DEFAULT 'metadata.expected',
    terminal_event_path TEXT NOT NULL DEFAULT 'metadata.terminal_event',
    terminal_event_class_map_json TEXT NOT NULL,
    scenario_compatibility_map_json TEXT NOT NULL,
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
);

CREATE INDEX IF NOT EXISTS idx_war_game_contests_repo
    ON war_game_contests(repo_id);

CREATE TABLE IF NOT EXISTS war_game_scores (
    score_id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL,
    shot_id TEXT NOT NULL,
    scenario_id TEXT NOT NULL,
    outcome TEXT NOT NULL,
    expected_summary TEXT,
    observed_terminal_event TEXT,
    inconclusive_reason TEXT,
    attacker_engram_intent TEXT NOT NULL,
    defender_engram_intent TEXT NOT NULL,
    scored_at INTEGER NOT NULL,
    UNIQUE(contest_id, shot_id),
    FOREIGN KEY(contest_id) REFERENCES war_game_contests(contest_id)
);

CREATE INDEX IF NOT EXISTS idx_war_game_scores_contest
    ON war_game_scores(contest_id, scored_at);
CREATE INDEX IF NOT EXISTS idx_war_game_scores_outcome
    ON war_game_scores(contest_id, outcome);
CREATE INDEX IF NOT EXISTS idx_war_game_scores_shot
    ON war_game_scores(shot_id);
```

All additive. `ensureHallSchema` remains idempotent.

## 4. Scoring trigger — hook point

Modify `cstar_record_result` (in `src/tools/cstar-kernel-mcp.ts`, ~line 1701-1799) to invoke a new `scoreEngramIfArbitrated(engram, db)` helper **after** the Engram is persisted, **in the same transaction**. The helper:

1. Iterates registered contests whose `defender_intent_prefix` is a prefix of the inbound Engram's intent.
2. For each match, extracts `shot_id` from the Engram per `defender.shot_id_path`.
3. Searches the Hall for a recorded attacker Engram with intent prefix `attacker_intent_prefix` whose payload at `shot_id_path` equals the extracted shot_id.
4. If no attacker Engram found → inconclusive (records score with `inconclusive_reason = "no_attacker_engram"`).
5. If found → derives outcome per Q3/Q4 → inserts into `war_game_scores` → records a `cstar/war-game/scored/<shot_id>` Engram (in the same path that just ran).

The helper is fail-soft: any error during scoring is logged and the original Engram write is still committed. War-game scoring is observational; it must never block the underlying Hall write.

## 5. The First Contest

Registered at first use (idempotent `register_contest` call):

```jsonc
{
  "contest_id": "usb-forge-vs-sentry-v1",
  "contest_name": "USB Forge vs USB Sentry — v1 (Mode A)",
  "attacker_label": "claude:forge",
  "defender_label": "codex:sentry",
  "attacker_bead_id": "BEAD-USB-FORGE-001",
  "defender_bead_id": "BEAD-USB-SENTRY-FORGE-LISTENER-001",
  "attacker_intent_prefix": "usb-forge/shot-fired/",
  "defender_intent_prefix": "usb-sentry/verdict/",
  "terminal_event_class_map": {
    "block":      ["usb-sentry/phase1-hit", "usb-sentry/device-held-rejected", "usb-sentry/forge-listener-refused"],
    "complete":   ["usb-sentry/complete"],
    "inconclusive":["usb-sentry/forge-listener-timeout", "usb-sentry/forge-listener-panic"]
  },
  "scenario_compatibility_map": /* see Q4 */
}
```

The Forge's existing `ExpectedOutcome` enum maps to attack-vs-baseline via:
- `Deflected{..}` → attacker expects "block"
- `CapturedClean` → attacker expects "complete"
- `CapturedThreat{..}` → attacker expects "block"

## 6. CStar Discipline

- **Bead anchor:** `BEAD-CSTAR-WAR-GAME-SCORING-001`, kernel-anchored (no spoke).
- **Lore (Triad leg 1):** `CStar/tests/features/war_game_scoring.feature`.
- **Isolation (Triad leg 2):** unit tests under `tests/unit/war_game/`. One per Q ruling, one per outcome variant in Q3, one per protocol-violation case.
- **Audit (Triad leg 3):** Gungnir on the integration PR. Wardens: Norn (lore coverage), Ghost (the score-trigger seam in `cstar_record_result`), Heimdall (no new privileged surface — score table is local SQLite only), Valkyrie (no dead outcome branches).

## 7. Acceptance Criteria

The bead resolves when:

1. **Lore exists** — `tests/features/war_game_scoring.feature` covers Q1–Q6.
2. **Isolation passes** — `npm run test:node -- tests/unit/war_game/` green.
3. **Integration passes** — a fixture test registers the USB-Forge-vs-Sentry contest, records a synthetic shot-fired Engram followed by a synthetic verdict Engram, and asserts: (a) a `cstar/war-game/scored/<shot_id>` Engram lands; (b) `war_game_scores` has exactly one row with the expected outcome; (c) `cstar_war_game_score tally` returns the right count.
4. **Audit recorded** — Gungnir score on the integration PR; wardens listed in §6 green.
5. **No regression** — existing `npm test` passes with 0 new failures. `cstar_record_result` write path is byte-identical for Engrams that match no registered contest.
6. **CLI surface** — `./cstar war-game tally`, `./cstar war-game recent`, `./cstar war-game by-scenario` all functional.

## 8. Open Items (do not block)

- **OI-1.** Persistent `seen_shot_id` dedup — currently `UNIQUE(contest_id, shot_id)` handles it at the SQL level. v1.1 could add an in-memory LRU to reject duplicates faster.
- **OI-2.** Time-windowed scoring (`tally` by week/day). Useful for tracking Forge progress over time. Defer to v1.1.
- **OI-3.** Cross-contest scoring leagues (rank attackers across multiple contests). Far future.
- **OI-4.** Live SSE/WebSocket push of `cstar/war-game/scored/*` Engrams for the CorvusEye scoreboard. Defer to the kernel's push-notification surface when it lands; for v1, CorvusEye polls.
