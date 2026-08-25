# CStar Organism v0 Thread Lifecycle

Apply the Corvus estate instructions first. These are Organism-local deltas.

- `peer_thread_lifecycle.ts` is the deterministic policy boundary for delegated
  peer construction and terminal-thread reaping.
- `peer_thread_reaper.ts` is the Organism side-effect adapter. It executes only
  policy-admitted Engram and archive actions and persists the archive receipt.
- The only admitted construction surface is `codex_app.create_thread`.
  Collaboration children and Codex forks are forbidden.
- The Organism reaper owns terminal knowledge collection, the idempotent CStar
  Engram write, acknowledgement verification, and archival. No ordinary role
  may perform any retirement step for itself or another role.
- A terminal thread remains live until the reaper verifies that all effects are
  closed and its CStar Engram durably binds the thread ID and terminal receipt
  hash.
- Reaping means archival through `codex_app.set_thread_archived`. It never means
  deletion.
- Keep the policy pure and deterministic. Host adapters execute admitted
  archive commands and persist their receipts; they do not redefine policy.
