# Autobot — Build Summary

**Status**: Phases 1A → 4C all shipped 2026-05-15. **33/33 autobot tests + 52/52 cstar-hub tests = 85/85 passing.** Live cron registered.

## What is autobot

A formalized skill for **host-native LLM agents to delegate bounded tasks to a Hermes-managed sub-agent** (default `MiniMax-M2.7`). Generalizes the host→Hermes pattern that the cstar-hub research agent had hardcoded for synthesis/claim_rewrite/handoff_routing — now any task family can be delegated through a single contract.

The pattern from the 2026-05-15 cleanup session — Opus 4.7 directs M2.7 via `subprocess.run(["hermes", ...])` for self-reflection — is now an addressable surface, not a one-off.

## Components shipped

### Phase 1 — Foundation (sync delegation)

- **`.agents/skills/autobot/SKILL.md`** — full contract, when-to-use vs when-NOT-to-use, intent JSON schema, result envelope schema, 5 invariants. Frontmatter registers it as `tier=SKILL, risk=low, intent_category=ORCHESTRATE, terminal_required=false`.
- **`.agents/skills/autobot/scripts/delegate.py`** — single-shot helper. Validates intent, materializes target_paths (32 KB cap), builds prompt, invokes Hermes/MiniMax-M2.7, validates output (markdown/json/plain — incl. brace-counting JSON extractor for prose-then-JSON), writes artifact, logs to ledger. Lock granularity = `(project_root, intent_hash)`. Honest degraded states.
- **`.agents/skills/autobot/demos/self_reflect.json`** — replays the manual M2.7 cleanup-pass self-reflection as a formal autobot intent. Verified live: produced 2519-char self-reflection in 27s, wrote to `~/.hermes/memories/MEMORY.md`.
- **`.agents/state/autobot-cost-ledger.jsonl`** — every delegation appends one record with timestamp, intent_id, intent_hash, status, duration_ms, est tokens, model, profile, tags, wrote_to.

### Phase 2 — MCP integration

- **`cstar_autobot` tool** in `src/tools/cstar-kernel-mcp.ts` — wraps `delegate.py` via `child_process.spawnSync`. MCP-capable hosts (Gemini, Codex, Claude Desktop, anything reading the cstar-kernel MCP) can now delegate without shelling out themselves. Returns the structured result envelope. TypeScript-checked clean.
- **Smoke verified**: M2.7 returned "autobot mcp wrapper smoke test passed" in 6 seconds via the MCP path.

### Phase 3 — Async queue topology

- **`.agents/state/autobot-queue.jsonl`** — durable JSONL queue. Records: `{task_id, status, priority, enqueued_at, intent, started_at, completed_at, result_envelope, error, attempts}`. Status transitions: `pending → running → done | failed | dead_letter`.
- **`.agents/skills/autobot/scripts/enqueue.py`** — append a task. Lock-protected. Returns task_id.
- **`.agents/skills/autobot/scripts/queue_inspect.py`** — read-only. Summary by status, list by status, full record by task_id.
- **`.agents/skills/autobot/scripts/queue_processor.py`** — the drainer. fcntl-locked (skip cleanly on contention). Atomic claim → run → finalize via temp-file-rename. Priority order high → normal → low. Failed tasks re-queue up to 3 attempts then move to `dead_letter`. Per-task results saved to `.agents/state/autobot-results/<task_id>.json`.

### Phase 4 — Hardening

- **Profile validation** — `_hermes_profile_exists` short-circuits with `profile_not_found:<name>` before the Hermes subprocess fires. No more confusing deep-stack errors when a profile slug is misspelled.
- **Session continuity** — `payload.session_name` triggers `hermes chat --continue <name>`. If the session doesn't exist yet, falls through to a fresh session (verified live: "What number did I ask you to remember?" → first call cold-starts, second call resumes via name).
- **Profile routing** — `payload.hermes_profile` selects which Hermes profile loads (cstar-hub, moonshot, etc.) so the sub-agent has the right SOUL.md + memory.
- **Nested-delegation guard** — `HERMES_AUTOBOT_DELEGATED` env var. If set, `delegate()` refuses with `nested_delegation_forbidden`. Prevents runaway loops.
- **No-fallback contract** — when MiniMax is unreachable, the skill does NOT silently route to Anthropic or another provider. Returns degraded.

### Phase 4B — Tests + registry

- **`tests/unit/autobot/test_autobot.py`** — 33 cases covering intent validation (8), intent identity (3), target materialization (4), output validation (6), ledger record shape (2), nested guard (1), profile validation (1), enqueue/inspect (3), queue processor (5: dry-run, claim+finalize, dead-letter, priority order, processor lock).
- **`.agents/skill_registry.json`** — autobot now a real registered SKILL entry (was previously only an ORCHESTRATE intent trigger). Includes input/output JSON schemas, invariants, and adapter pointers (entry_point, queue_entry_point, queue_drainer_entry_point, mcp_tool).

### Phase 4C — Cron + docs + memory

- **Cron job `a448b91baa65`** — "autobot — queue drainer (every 15m)" running `~/.hermes/scripts/autobot-queue-drain.py` via `--no-agent` (no LLM wrapping; the drainer itself orchestrates Hermes calls when there's work). Silent when queue is empty. Next fire: every 15 min on the quarter hour.
- **`docs/plans/autobot-build-summary.md`** — this file.
- Memory entry will land in `~/.claude/projects/.../memory/project_autobot_skill.md` (built next).

## Verification commands the operator can run anytime

```bash
# Tests (must pass)
pytest /home/morderith/Corvus/CStar/tests/unit/autobot/ -q
# expect: 33 passed

# Skill is registered
grep -c '"id": "autobot"' /home/morderith/Corvus/CStar/.agents/skill_registry.json
# expect: 1

# Cron job is scheduled
hermes cron list | grep -i autobot
# expect: a448b91baa65 entry, state=scheduled

# Sync delegation works (free — invalid intent path)
python3 /home/morderith/Corvus/CStar/.agents/skills/autobot/scripts/delegate.py --intent "" --project-root /tmp; echo $?
# expect: exit 2, JSON with status=invalid_intent

# Queue inspect (free — read-only)
python3 /home/morderith/Corvus/CStar/.agents/skills/autobot/scripts/queue_inspect.py
# expect: JSON summary; total_tasks may be >0 from prior runs

# Cost ledger
wc -l /home/morderith/Corvus/CStar/.agents/state/autobot-cost-ledger.jsonl
# expect: increases by 1 per real delegation
```

## Real delegation example (costs Hermes credits)

```bash
# Sync — synchronous, returns result envelope on stdout
python3 /home/morderith/Corvus/CStar/.agents/skills/autobot/scripts/delegate.py \
  --intent-file /home/morderith/Corvus/CStar/.agents/skills/autobot/demos/self_reflect.json

# Async — enqueue + cron picks up at next /15-min tick (or run drainer manually)
python3 /home/morderith/Corvus/CStar/.agents/skills/autobot/scripts/enqueue.py \
  --intent-file /home/morderith/Corvus/CStar/.agents/skills/autobot/demos/self_reflect.json \
  --priority normal
# task_id printed; cron drains within 15 min
```

## Operator follow-ups

- **Per-host README** — when a host (Gemini CLI, Codex, etc.) connects to the `cstar-kernel` MCP, it'll see `cstar_autobot` in the tool list. The tool description should be enough, but a short README in `docs/host-native-skill-bridge.md` showing example delegations across host types would be welcome.
- **Cost monitoring** — `.agents/state/autobot-cost-ledger.jsonl` grows forever. Consider a sweep or rotation policy if this gets big (>100k records). Current single-record overhead is ~600 bytes; 100k records ≈ 60 MB.
- **Dead-letter inspection** — `queue_inspect.py --status dead_letter` shows tasks that failed 3 attempts. Probably worth a periodic operator scan or an alert when count > 0.
- **Session GC** — Hermes session files at `~/.hermes/profiles/<profile>/sessions/` accumulate. autobot uses `--continue session_name` so they're at least named, but no GC. If session count grows large, consider `hermes sessions list` review.
- **Downstream consumers** — autobot is now the producer-side of "host directs sub-agent." The reverse (sub-agent surfacing results back to host) currently happens via:
  - `payload.write_to` for memory/file writes the host can read on next turn
  - The result envelope returned synchronously
  - The cost ledger for after-the-fact audit
  - The queue results dir for async callbacks
  No event-driven push back to the host yet (would require harness-side webhook support).

## Score

The autobot skill itself is feature-complete for the use cases we identified. **88/100** as a standalone artifact — the missing 12 are:
- No automatic ledger rotation / GC (~3pt)
- No session-id capture in result envelope so async callers can resume by id (~3pt)
- No per-host adapter README beyond SKILL.md (~2pt)
- No metrics dashboard for delegation cost trends (~2pt)
- No dead-letter alerting (~2pt)

All "polish later" items, not blocking for the documented use cases. The system can:
- Be invoked sync from the host LLM (CLI or MCP)
- Be invoked async via queue + cron
- Audit every call's cost
- Fall back honestly when Hermes/MiniMax is unreachable
- Run with concurrency safety (intent-level + processor-level locks)
- Ship under unit-test coverage that catches regressions before they hit production
