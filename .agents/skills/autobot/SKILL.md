---
name: autobot
description: Delegate a bounded task from the host-native agent (Claude / Gemini / Codex in their harness) to a Hermes-managed sub-agent (default MiniMax-M2.7). Cost-audited, structured-intent, file-locked. Use when bulk synthesis / classification / summarization can be done by a cheaper model than the operator's host LLM.
tier: SKILL
risk: low
intent_category: ORCHESTRATE
entry_surface: cli
terminal_required: false
---

# 🤖 SKILL: AUTOBOT (v1.0)

Host-native agent → directs Hermes sub-agent. The Opus/Sonnet/Gemini host LLM you're running this skill from keeps reasoning + judgment + code review. The Hermes sub-agent (default `MiniMax-M2.7`) does the bulk execution. Every delegation is cost-audited and produces durable artifacts.

## 💎 WHEN TO USE

- **Synthesis at scale** — turning 50 findings into one trends summary
- **Classification / routing** — assigning items to lanes, categories, priorities
- **Summarization** — daily digests, briefs, long-doc compression
- **Self-reflection on artifacts** — "agent, read these diffs and write what changed"
- **Background research** — fetch + dedupe + extract claims (offload from interactive session)
- **Queue draining** — process N items from a pending-work queue without burning host LLM tokens
- **Profile-routed work** — delegate to a specific Hermes profile (`cstar-hub`, `moonshot`, etc.) so the sub-agent has the right SOUL.md + memory loaded

## ❌ WHEN NOT TO USE

- **Code review or architecture decisions** — keep on the host LLM
- **Anything requiring Sterling Mandate gating** — bead resolution stays on the host
- **Hard-real-time interactive answers to the operator** — Hermes subprocess adds 10-30s latency
- **Tasks the host has full context for** — don't pay the prompt overhead to re-establish context elsewhere
- **Writes into Sovereign locations** (per-spoke vaults, hub config.yaml, cron jobs) — those need explicit operator approval, not autobot delegation

## 🛠️ EXECUTION MODE

**Host-native**, not terminal-bound. Activation carries structured intent + payload per `docs/host-native-skill-bridge.md`. The script is callable from the terminal for diagnosis, but the canonical surface is the MCP tool `cstar_autobot` (Phase 2) or the harness adapter.

## 🧩 LOGIC PROTOCOL

### Phase 1 — Frame the intent (host LLM)

The host LLM constructs a JSON intent object:

```json
{
  "intent": "Read these cleanup artifacts and write a 2000-char self-reflection memory entry in your own voice.",
  "project_root": "/home/morderith/Corvus/CStar",
  "target_paths": [
    "docs/plans/cstar-hub-completion-summary.md",
    "/home/morderith/.hermes/profiles/cstar-hub/skills/research/research-agent-loop/scripts/research_agent_loop.py"
  ],
  "payload": {
    "hermes_profile": "cstar-hub",
    "model": "MiniMax-M2.7",
    "expected_output": "markdown",
    "max_chars": 2000,
    "session_name": null,
    "write_to": "~/.hermes/memories/MEMORY.md",
    "append_with_separator": "§",
    "tags": ["self_reflection", "cleanup_pass"]
  }
}
```

### Phase 2 — Delegate (autobot)

The skill:
1. Validates the intent against the schema (rejects malformed → exit 2)
2. Acquires an `fcntl` file lock on `.agents/state/autobot.<intent_hash>.lock` (prevents duplicate concurrent delegations of the *same* intent)
3. Reads each `target_path` (skips missing, surfaces in receipt)
4. Builds the Hermes prompt: system context + intent + materials + output schema reminder
5. Invokes `hermes --profile <profile> --provider minimax --model <model> chat -q <prompt>` with `--continue <session_name>` if provided
6. Captures response, validates against `expected_output` (markdown, json, plain — refuses unknown types)
7. Writes artifact per `write_to`/`append_with_separator` (or stdout if no target)
8. Appends one record to `.agents/state/autobot-cost-ledger.jsonl`
9. Returns a structured result envelope

### Phase 3 — Honest failure modes

The skill never fakes success. If Hermes fails, the result envelope reports `status=degraded` with a specific reason (`no_minimax_key`, `hermes_timeout_<N>s`, `hermes_exit_<code>`, `output_validation_failed`, `lock_held`, etc.) and the cost-ledger entry records the failure too.

## 📋 INTENT JSON SCHEMA

| Field | Type | Required | Notes |
|:---|:---|:---|:---|
| `intent` | string | yes | One-sentence task statement. Treat as the prompt's "your job" line. |
| `project_root` | string | yes | Anchors relative `target_paths`. |
| `target_paths` | string[] | no | Files to read into the prompt as context. Each capped at 32 KB. |
| `payload.hermes_profile` | string | no, default `cstar-hub` | Hermes profile loaded for the sub-agent run. |
| `payload.model` | string | no, default `MiniMax-M2.7` | Hermes model id. |
| `payload.expected_output` | enum | no, default `markdown` | `markdown` \| `json` \| `plain`. |
| `payload.max_chars` | int | no, default `4000` | Soft cap surfaced in the prompt; not enforced post-hoc. |
| `payload.session_name` | string\|null | no, default `null` | Sets `hermes chat --continue <name>` for cross-call continuity. |
| `payload.write_to` | path\|null | no, default `null` | If set, response written here; else stdout. |
| `payload.append_with_separator` | string\|null | no, default `null` | If set, response appended after this separator (e.g., `§` for Hermes MEMORY.md). |
| `payload.tags` | string[] | no | Logged to ledger for later filtering. |
| `payload.timeout_seconds` | int | no, default `300` | Subprocess timeout. |

## 📤 RESULT ENVELOPE

```json
{
  "status": "ok" | "degraded",
  "degraded_reason": null | "no_minimax_key" | "hermes_timeout_300s" | ...,
  "intent_id": "intent-2026-05-15-191428-a1b2c3",
  "duration_ms": 18432,
  "response_chars": 1843,
  "est_prompt_tokens": 612,
  "est_response_tokens": 461,
  "model": "MiniMax-M2.7",
  "hermes_profile": "cstar-hub",
  "wrote_to": "/home/morderith/.hermes/memories/MEMORY.md",
  "ledger_entry": ".agents/state/autobot-cost-ledger.jsonl#L17"
}
```

## 🔐 INVARIANTS

1. **No nested delegation.** An autobot task may not enqueue more autobot tasks. (Prevents runaway loops.) Enforced by setting `HERMES_AUTOBOT_DELEGATED=1` in the subprocess env; nested `delegate.py` invocations refuse to run when this is set.
2. **No writes outside `payload.write_to`.** The skill never touches files other than the explicit `write_to` target + the cost ledger + the lock file + the queue (Phase 3).
3. **No bypass of Hermes/MiniMax-M2.7.** Even if MiniMax is degraded, the skill does NOT silently route to Anthropic or another provider. It returns degraded.
4. **Cost is auditable post-hoc.** Every delegation appends one ledger record. `wc -l .agents/state/autobot-cost-ledger.jsonl` is the canonical "how many delegations have we done" answer.
5. **Lock granularity = (project_root, intent_hash).** Two different intents in the same project may run in parallel. The same intent can't double-fire from cron + manual.

## 📚 RELATED

- `docs/host-native-skill-bridge.md` — the contract this skill satisfies
- `.agents/skill_registry.json#intent_grammar.ORCHESTRATE` — `autobot` is already a trigger word
- `.agents/extension/skills/restoration/SKILL.md` — references `delegate_to_subagent("autobot")` (this skill is what that delegation now resolves to)
- `~/.hermes/profiles/cstar-hub/skills/research/research-agent-loop/scripts/research_agent_loop.py` — proof-of-concept of what host→Hermes delegation looks like in practice (cstar-hub uses Hermes for synthesis + claim_rewrite + handoff_routing); autobot generalizes that pattern

## 🎬 DEMO

`demos/self_reflect.json` — replays the M2.7 cleanup-pass self-reflection we ran manually on 2026-05-15 19:00 UTC, but as a formal autobot delegation. Run with:

```bash
python3 .agents/skills/autobot/scripts/delegate.py --intent-file .agents/skills/autobot/demos/self_reflect.json
```

Expected: same kind of memory entry M2.7 produced manually, written to `~/.hermes/memories/MEMORY.md` with `§` separator, plus one ledger entry, plus a result envelope on stdout.
