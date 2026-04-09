# Hall Multi-Agent Coordination API

## Purpose

This protocol makes concurrent agent work in `/Corvus` and `/CStar` explicit inside the Hall of Records.

Use it when up to three agents are working at the same time and each agent needs to know:

- where to look
- why to look there
- what the other agent is actively touching

The Hall is the authority. The War Room blackboard is now a projection surface, not the canonical coordination store.

## Design Rule

Do not invent a fourth coordination channel.

Existing surfaces already had partial truth:

- `hall_planning_sessions` tracks planner state
- `hall_one_mind_*` tracks host delegation and branch work
- `sovereign_state.blackboard` tracks UI-visible handoffs and broadcasts

This API unifies runtime communication around two Hall-native records:

1. `hall_agent_presence`
2. `hall_coordination_events`

## Discovery Order

Every agent should follow the same lookup sequence:

1. Read `hall_agent_presence` to see who is active, what bead they own, and what task they claim.
2. Resolve the relevant coordination thread id.
3. Read `hall_coordination_events` for that thread, bead, session, or trace.
4. Only then inspect files or resume execution.

This removes guesswork about whether context lives in the TUI blackboard, a planning session summary, or a transient host note.

## Thread Resolution

Use `buildHallCoordinationThreadId(...)` from [hall.ts](/home/morderith/Corvus/CStar/src/types/hall.ts).

Resolution order is deterministic:

- `bead:<bead_id>`
- `session:<session_id>`
- `trace:<trace_id>`
- `target:<normalized_path>`
- `repo:<repo_id>:coordination`

Rule:

- If a bead exists, the bead thread is the primary coordination thread.
- Session and trace ids are supporting filters, not replacements for bead coordination.
- Repository scope is only for broad broadcasts or pre-planning discovery.

## Table 1: `hall_agent_presence`

One row per `(repo_id, agent_id)`.

Purpose:

- current ownership
- current focus
- current claimed bead
- current declared task

Core fields:

- `agent_id`
- `name`
- `status`
- `current_task`
- `active_bead_id`
- `session_id`
- `trace_id`
- `target_path`
- `watch_paths_json`
- `updated_at`

Status contract:

- `SLEEPING`
- `THINKING`
- `WORKING`
- `WAITING_FOR_HANDOFF`
- `OFFLINE`

## Table 2: `hall_coordination_events`

Append-only event ledger.

Purpose:

- explicit handoffs
- claims
- blocker reports
- broadcasts
- progress notes
- decisions

Core fields:

- `event_id`
- `thread_id`
- `scope_kind`
- `scope_ref`
- `event_kind`
- `from_agent_id`
- `to_agent_id`
- `session_id`
- `trace_id`
- `bead_id`
- `target_path`
- `rationale`
- `summary`
- `payload_json`

Event kinds:

- `CLAIM`
- `HANDOFF`
- `BROADCAST`
- `INFO`
- `ALERT`
- `PROGRESS`
- `BLOCKER`
- `DECISION`
- `SUMMARY`

## Runtime Integration

Current runtime behavior:

- `StateRegistry.save(...)` mirrors the live roster into `hall_agent_presence`.
- `StateRegistry.postToBlackboard(...)` mirrors War Room posts into `hall_coordination_events`.
- Existing `broadcast` and `hand` operator commands therefore land in the Hall automatically.
- Existing dispatcher-driven agent state transitions now materialize as Hall presence because dispatcher already writes through `StateRegistry`.

This keeps legacy TUI behavior intact while moving authority into the Hall.

## TypeScript API

Source files:

- [hall.ts](/home/morderith/Corvus/CStar/src/types/hall.ts)
- [agent_coordination_controller.ts](/home/morderith/Corvus/CStar/src/tools/pennyone/intel/agent_coordination_controller.ts)
- [database.ts](/home/morderith/Corvus/CStar/src/tools/pennyone/intel/database.ts)

Primary functions:

- `saveHallAgentPresence(record, rootPath?)`
- `getHallAgentPresence(agentId, rootPath?)`
- `listHallAgentPresence(rootPath?, options?)`
- `saveHallCoordinationEvent(record, rootPath?)`
- `listHallCoordinationEvents(rootPath?, options?)`
- `buildHallCoordinationThreadId(scope)`

Minimal pattern:

```ts
const threadId = buildHallCoordinationThreadId({ beadId });

saveHallCoordinationEvent({
  event_id: `coord:${crypto.randomUUID()}`,
  repo_id,
  thread_id: threadId,
  scope_kind: 'BEAD',
  scope_ref: beadId,
  event_kind: 'HANDOFF',
  from_agent_id: 'alfred',
  to_agent_id: 'codex',
  bead_id: beadId,
  rationale: 'Codex owns the bounded runtime repair.',
  summary: 'Inspect dispatcher routing before editing.',
  payload: {
    why: 'Need the real control-plane boundary first.',
    where: 'src/node/core/runtime/dispatcher.ts',
  },
  created_at: Date.now(),
  updated_at: Date.now(),
}, rootPath);
```

## CLI Inspection

Use [one-mind.ts](/home/morderith/Corvus/CStar/src/node/core/commands/one-mind.ts).

Commands:

- `cstar one-mind agents`
- `cstar one-mind agents --json`
- `cstar one-mind events --bead <id>`
- `cstar one-mind events --thread <thread-id> --json`

Recommended operator workflow:

1. `cstar one-mind agents --json`
2. Identify `active_bead_id`
3. `cstar one-mind events --bead <active_bead_id> --json`

## Required Agent Behavior

When claiming work:

- update presence first
- emit a `CLAIM` or `HANDOFF` event

When blocked:

- keep presence current
- emit a `BLOCKER` event with a real rationale and target

When redirecting another agent:

- do not rely on prose alone
- include `why` and `where` in the event payload

## Non-Goals

This protocol does not replace:

- `hall_planning_sessions`
- `hall_one_mind_requests`
- `hall_one_mind_branches`

Those remain domain-specific ledgers. The coordination API is the shared cross-agent surface that tells every participant where to look next.
