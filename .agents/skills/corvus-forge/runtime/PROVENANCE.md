# Native Forge runtime provenance

This directory describes the native Codex collaboration boundary used by the
CStar Forge replacement. It is not a provider runtime and contains no provider
credentials, launch command, fallback adapter, or network contract.

The authoritative connection is `forge-native-codex-swarm-v1`. Native task
operations are supplied by the host. CStar records the requested selector,
host-attested actual identity, task graph, bounded work package, receipts, and
candidate digest. Without a distinct host attestation the actual identity is
`unreported`. Missing capability fails closed before a run lease is reserved.

The native Forge parent/leaf ceiling is one parent, zero to three useful disjoint leaves,
and zero descendants. The parent retains integration ownership. Worker and
control receipts are separate. Native delivery is `DELIVERED_UNVERIFIED` and
requires an independent validator before any lifecycle acceptance.

The manifest and schema are parity evidence only. They do not authorize
installation, activation, restart, deployment, production, Git publication,
or protected configuration effects.
