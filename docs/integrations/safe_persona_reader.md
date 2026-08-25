# Safe Persona Context

The active CStar persona is a style-only scalar projected by Hall and returned
as the top-level `persona` field from `cstar_status`. The only accepted values
are the exact strings `O.D.I.N.` and `A.L.F.R.E.D.`. Do not trim, case-fold,
accept aliases, or use substring matching. Do not open, parse, print, diff, or request
`.agents/config.json` or any object containing it.

Hall exposes a persona only when metadata contains a
`cstar.persona_projection.v2` SHA-256 self-consistency marker bound to the exact
canonical scalar. This marker proves row integrity only; it is deliberately
reported as `self_consistent_unverified`, not as source authority. Legacy v1
rows may be read as `legacy_self_consistent_unverified` but are never upgraded
or described as independently verified. Generic `metadata.source` labels,
timestamps, bootstrap rows, document ingestion, doctrine seeds, migrations,
profiles, and arbitrary unknown source names grant no persona provenance.

There is no local-file fallback. If `cstar_status` is unavailable, omit persona
context and record `persona_projection_status: unavailable` plus a freshness
gap. The compatibility style registry resolves
only an explicitly supplied scalar and otherwise returns no persona; it neither
reads local state nor proves which persona is active.

Persona changes tone and domain emphasis only. It cannot grant execution,
spend, Git, restart, installation, deployment, or lifecycle authority.
