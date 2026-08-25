# Safe Persona Context

The active CStar persona is returned as the top-level `persona` field from
`cstar_status`. The only public values are the exact strings `O.D.I.N.` and
`A.L.F.R.E.D.`. Ordinary callers must not open, parse, print, diff, or request
`.agents/config.json` or any object containing it.

The one exception is `scripts/read_active_persona.py`, an isolated runtime
reader. It reads only the fixed persona field (`system.persona`, with exact
legacy top-level compatibility), maps exact `ODIN` or `ALFRED` values to the
public canonical scalar, suppresses stderr, and emits
only that scalar. The parent process accepts at most the canonical output; no
configuration object, neighboring key, raw value, or exception crosses the
process boundary. `cstar_status` reports this source as
`bounded_config_projection`.

Hall exposes a persona only when metadata contains a
`cstar.persona_projection.v2` SHA-256 self-consistency marker bound to the exact
canonical scalar. This marker proves row integrity only; it is deliberately
reported as `self_consistent_unverified`, not as source authority. Legacy v1
rows may be read as `legacy_self_consistent_unverified` but are never upgraded
or described as independently verified. Generic `metadata.source` labels,
timestamps, bootstrap rows, document ingestion, doctrine seeds, migrations,
profiles, and arbitrary unknown source names grant no persona provenance.

The parent launches the reader through a fixed, root-owned system interpreter
with Python isolated mode, site loading disabled, bytecode disabled, and a
minimal environment. Only an absent config may use an already marked Hall
projection as a compatibility fallback. Malformed or conflicting config is
reported as `bounded_config_invalid`; an unavailable isolated reader is
reported as `bounded_config_reader_unavailable`. Both fail closed without Hall
fallback. If neither source is available, omit persona context and record
`persona_projection_status: unavailable` plus a freshness gap. The compatibility style registry resolves
only an explicitly supplied scalar and otherwise returns no persona; it neither
reads local state nor proves which persona is active.

Persona supplies non-authoritative development-process guidance. `O.D.I.N.`
means build, run, repair recoverable failures, and continue to validation.
`A.L.F.R.E.D.` means establish working behavior, then emphasize trust
boundaries, abuse cases, failure containment, hardening, and validation.
Neither persona grants execution, spend, Git, restart, installation,
deployment, lifecycle authority, or permission to cross an operator gate.
