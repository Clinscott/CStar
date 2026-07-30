# Spoke Projection and Read Boundary

CStar treats mounted-spoke rows as authority-adjacent references, not as
permission to inspect or mutate an arbitrary path. The public spoke surface is
currently read-only. `link`, `unlink`, `project`, and destructive `prune`
return
`spoke_mutation_requires_verified_request_scoped_operator_attestation` before
path, remote, Git, private-home, writable-Hall, or spoke-filesystem activity.
They remain retired until a purpose-built request-scoped attestation binds the
exact Hall row, canonical root, action, outputs, and operator turn.

## Safe inspection

`list`, `inspect`, and `doctor` read Hall rows only. Their output is an
allowlist of lifecycle fields plus SHA-256 bindings. It never returns raw
roots, repository identifiers, remotes, branch names, metadata, mount tokens,
credentials, or projection content. Doctor does not probe mounted paths.
`prune` is limited to an explicitly requested `dry_run=true` exact row/root
comparison and never deletes rows or artifacts.

`verify`, `health`, spoke capability discovery, journal discovery, and spoke
bead import require an exact `mount_token` match between the Hall row and the
bounded `.cstar/IDENTITY.json` file. `unproven` is not accepted. The root must
be a canonical directory outside a private home. Every permitted file read is
contained, bounded to 256 KiB or less, no-follow, and rejects hardlinks.
Symlinked or hardlinked skill, lore, design, identity, and journal files are
never consumed.

Capability and journal results use relative paths and a root SHA-256 only.
Spoke bead imports persist relative lore/design/target paths; absolute targets
and unstructured caller metadata fail closed. The deprecated projector never
reads Hermes profiles, Git remotes, contributor identities, or repository
content, and it never writes `.cstar` projection or authority artifacts.

## Evidence classes

These contracts prove the source read/mutation boundary only. They do not
activate a new spoke, restore mutation authority, install a plugin, restart a
host, or claim production readiness. A future mutation design requires its own
bead, feature contract, request-identity proof, independent validation, and
separate operator authorization.
