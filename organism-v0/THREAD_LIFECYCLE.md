# Independent peer thread lifecycle

## Construction

Estate roles are independent native Codex peers. The controller uses
`codex_app.create_thread`, persists its returned `threadId` and `hostId`, and
delivers a compact typed packet. The packet binds the role, Bead, effect,
selector, reasoning, limits, terminal schema, and controller return thread.

`collaboration.spawn_agent`, `codex_app.fork_thread`, `fork_turns`, and
inherited-history agent construction are forbidden. This rule prevents hidden
ancestry, missing peer tools, and context replay from becoming execution state.

Peers use `codex_app.send_message_to_thread`. Messages carry evidence and work;
they do not grant lifecycle authority.

## Terminal handoff

When a peer terminalizes, it emits its typed terminal packet and stops. A
worker, watcher, validator, controller, or other ordinary role does not write
its retirement Engram and does not archive any thread.

## Reaper-owned Engram closeout

The CStar Organism reaper consumes the terminal event, verifies zero open
effects, collects the bounded relevant data, and creates one idempotent Engram
through `cstar_engram_record`. The Engram includes:

- thread and host IDs;
- role, Bead, effect, and controller generation;
- requested model/reasoning and actual identity when attested;
- terminal verdict, receipt path, terminal SHA-256, and validation status;
- material decisions, reusable learning, exact gaps, effects, and artifact
  references;
- an idempotency key derived from thread ID and terminal SHA-256.

Do not copy the full transcript or high-volume artifacts into Hall.

## Reaper and garbage collector

The CStar Organism reaper performs this sequence:

1. The peer is terminal.
2. The terminal receipt has a valid SHA-256.
3. The Bead/effect has no open external effect.
4. The reaper records the compact Engram with a deterministic memory ID.
5. The durable Engram acknowledgement names the same thread and terminal
   SHA-256.
6. The archive actor is `organism_reaper`.

Only then may the host adapter call `codex_app.set_thread_archived` with
`archived=true`. The reaper persists a bounded archive receipt. It never
deletes a thread. A missing or mismatched proof holds the thread live.

`peer_thread_reaper.ts` implements this sequence with injected CStar Engram,
Codex archive, and receipt-store ports. It returns a typed hold or failure and
does not call a later port after an earlier non-pass.
