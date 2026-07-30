# MCP Telemetry Storage Boundary

MCP usage and usefulness telemetry are best-effort evidence, not lifecycle authority.
Beads and validations do not depend on these JSONL files, and a
telemetry failure never changes a tool result.

Each stream is a single rolling segment capped at 2 MiB with individual records
capped at 8 KiB. When the next valid record would exceed the file cap, the
non-authoritative segment is truncated before that record is written. Summary
reads use the same 2 MiB ceiling instead of loading an unbounded file. This
prevents historical usage logs from growing indefinitely or being read wholly
into memory on every status request.

The writer uses only the current canonical CStar root. `.agents` must already
be a regular directory; only its `state` child may be created. Symlinked roots,
`.agents`, state directories, or files fail closed. Telemetry files must be
unique regular files, are opened with no-follow and append flags, and new files
use mode 0600. Root, `.agents`, state, lock, and file objects must be owned by
the current Unix UID and not writable by group or other users. A per-stream
atomic lock directory serializes writers; contention or a stale lock drops
best-effort telemetry instead of waiting, racing the cap, or deleting a lock it
did not acquire. Filenames are fixed JSONL basenames, not caller paths.

Telemetry remains bounded local evidence. It grants no source, execution,
installation, restart, deployment, production, or cleanup authority.

## Preauthorization boundary

Forge request, authorize, and execute calls produce stable machine-readable
`error_code` values. Before the relevant request identity, bounded root-user
operator intent, or current-authorizing-turn proof succeeds, the kernel marks the
response with a private non-recordable disposition. Instrumentation tests that
disposition directly; it never infers authority from error-message prefixes.
An attacker-controlled string that resembles a known error therefore cannot
suppress an ordinary post-boundary event.

Preauthorization responses write no usage or usefulness JSONL and create no
Hall or SQLite state. The authorize handler verifies root-user identity first,
then resolves exactly one eligible work item and masks failures as
`forge_operator_authorization_required`; preserved v2 compatibility may verify
its internal exact challenge. The execute handler returns the single non-oracular code
`forge_execution_authorization_required` until exact execution authority is
established. An identity-gated replay may return an already durable attempt
only when its stored authorization receipt, immutable request lineage,
supplied authorization reference, and idempotency key match; this no-spend
replay is non-recordable and cannot reserve or invoke an adapter. Post-boundary
telemetry may record only bounded event metadata; it
never stores raw errors, paths, stacks, authorization challenges, or authority
records.

Processes already running as the same Unix UID remain inside this local trust
boundary. Stronger same-UID isolation requires a separate service account or
sandbox and is not claimed by this file writer.
