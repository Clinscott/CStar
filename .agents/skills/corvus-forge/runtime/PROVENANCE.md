# Historical CStar private Forge runtime

Forge is `TOMBSTONED_PERMANENT`. This directory is immutable historical
evidence. It is not a compatibility lane, fallback, executable route, or
Researcher transport.

This provenance describes the former sealed legacy v2 Forge runtime. It is not
current routing and is not the default Researcher route.

This directory is owned and versioned by CStar. It is the sealed, stdlib-only
provider child used by the explicitly selected legacy v2 private Forge adapter.
It is not a vendored Hermes agent checkout and it does not make AutoBot or the
upstream Hermes repository part of CStar's authorized estate.

The former legacy v2 lane used the Hermes-owned
`cstar-hub` OAuth profile and credential lifecycle. The isolated child in this
directory may open only the allowlisted MiniMax OAuth record through the
read-only resolver. It never refreshes or writes the store. The CStar kernel
receives only redacted readiness and provider-result envelopes; it never
receives the bearer.

The initial implementation was adapted from the locally validated CStar Forge
entrypoint previously staged under the Hermes checkout. The ownership migration
intentionally replaces upstream `__init__.py`, `pyproject.toml`, and
`uv.lock` lineage with this manifest, launcher, five source files, and the
system Python executable.

MiniMax M3 requests use the provider's OpenAI-compatible `/v1` route with
bounded SSE streaming. This describes the pinned legacy v2 Forge compatibility
transport only; it is not current v3 routing and is not the default Researcher
route. The Anthropic-compatible MiniMax route remains an M2.x route and is not
used by the pinned legacy v2 M3 worker.

The six-role topology was independently reimplemented from the design described
by `https://github.com/unclebob/swarm-forge`, branch `six-pack`, commit
`59803dadb38e0e09d5357d749452036e4a82ae60`. No upstream source, shell, Clojure,
tmux, or Git-worktree implementation is copied into this runtime. The inspected
tree had no root license file, so this provenance records design inspiration
only and makes no vendoring or upstream-execution claim.

Every provider child writes only a CStar-initialized, token-free, hash-chained
state journal. The journal records dispatch progress, never credentials,
provider bodies, prompts, paths, timestamps, or raw errors.
