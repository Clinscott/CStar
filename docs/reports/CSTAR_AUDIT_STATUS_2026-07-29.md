# CStar audit remediation status — 2026-07-29

## Active boundary

Audit remediation may change only CStar-owned, Hermes-safe surfaces. The mature
Researcher and Corvus Forge profiles, MiniMax/xPremium OAuth state, local worker
enrollment, and server deployment remain deferred until their approved source
and runtime are available. CorvusEye work belongs in the separate CorvusEye
repository.

## Repository policy added to the audit

GitHub is a remote repository and PR record, not a verification authority.
CStar's canonical gate is `npm run verify`, which writes a local JSON receipt.
The GitHub workflow definitions have been removed so failing hosted jobs do not
spam the operator or block review.

## Verified Researcher/Forge preliminary contract

The existing preliminary control plane is correctly stubbed for later server
integration:

- Worker-job MCP tools are absent by default.
- The exact opt-in exposes inert queue/read/cancel/artifact primitives only.
- Public inputs accept logical work contracts, never providers, models,
  profiles, OAuth data, credentials, commands, endpoints, or host paths.
- Preliminary job reads and starts report `execution_available: false`.
- Metadata-only local profile intake does not copy profile contents and does not
  grant execution authority.
- Live execution remains blocked pending server-derived subject/tenant binding,
  authenticated worker identity, enrollment, and server-owned artifact
  verification.

Evidence is maintained by
`tests/features/cstar_v2_worker_control_plane.feature`,
`tests/unit/cstar-kernel-mcp/test_worker_job_registration.test.ts`,
`tests/unit/test_worker_job_controller.test.ts`, and
`tests/integration/cstar_worker_jobs_v2_stdio.test.ts`.

## Deferred findings

- Mature Researcher/Forge source intake and server linkage.
- Forge-owned delegation and any AutoBot retirement that might disturb the
  mature local profile.
- Authenticated worker/tenant binding and artifact-integrity enforcement.
- Sites Streamable HTTP/OAuth/deployment proof.
- React/Fiber visual dependency migration, pending rendering verification.
- CorvusEye red-team framework, in the CorvusEye repository only.

These are not silently counted as complete.
