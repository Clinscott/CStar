# Legacy Node and PennyOne Effect Boundary

The historical PennyOne CLI, invocation builder, repository scanner, estate
importer, live recorder, WebSocket relay, watcher, HTTP telemetry handlers,
EventManager, and JavaScript Sentinel are retired compatibility surfaces. They
fail with stable `legacy_*_retired_*` errors before filesystem traversal, Git,
host-model requests, Hall writes, process execution, watcher or timer creation,
network listener registration, client allocation, or request-body reads.

Supported state reads use `cstar_pennyone_context` or another bounded
`cstar-kernel` tool. Supported validation uses maintained project tests or the
classified `cstar_warden` execution surface. The direct PennyOne scan/import
and live telemetry paths cannot be re-enabled by command flags, injected
runners, ambient environment, or a caller-supplied remote.

This retirement removes two unbounded ownership hazards: import-time JS
Sentinel process execution and listener/client retention in legacy WebSocket
and EventManager paths. It also prevents the old scanner from combining broad
repository reads, host inference, filesystem telemetry, and direct Hall
projection in one unscoped call.

This source posture does not delete existing Hall evidence, stop a live
process, install or restart Codex, or claim production activation. Any future
replacement must begin as a bounded skill or kernel contract with explicit
inputs, outputs, authority, receipts, failure classes, and independent proof.
