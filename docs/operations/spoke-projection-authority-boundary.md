# Spoke Projection and Read Boundary

CStar treats mounted-spoke rows as authority-adjacent references, not as
permission to inspect or mutate an arbitrary path. `cstar_spoke` remains
read-only and its legacy `link`, `unlink`, and `project` actions return
`spoke_mutation_requires_verified_request_scoped_operator_attestation` before
path, remote, Git, private-home, writable-Hall, or spoke-filesystem activity.
The supported compatibility-first mutation is `cstar_spoke_attachment`.

`cstar_spoke_attachment` proves one canonical absolute repository root under
`/home/morderith/Corvus`, the SHA-256 of its nearest `AGENTS.md` bytes, a stable
root device/inode/size identity, its Git marker, exact lowercase basename slug,
and exact Hall binding. It rejects policy-byte drift, same-path root replacement,
symlinks, hardlinks,
aliases, collisions, moved roots, ancestor/descendant overlap, and suffix
inference. Link writes only Hall: it atomically consumes one immutable
`cstar.spoke_attachment_authority_grant.v1`, inserts one immutable link-authority receipt,
and creates an active trusted local read/write row with missing projection. It
never writes the spoke repository or `.cstar/IDENTITY.json`.

Link authority is either an exact current root-user direct grant whose operative
sentence includes `now` (no question, conditional, quoted, reported, modal,
negated, revoked, duplicate, or expired text) or an exact existing persisted
Hall mission set-grant parent. The selected record identity and complete ordered
current-turn record set are both bound. Project and unlink reject
`authority_source`; each still requires and consumes its own exact current-turn
grant. Project can only project an already active attachment and its receipt
binds that active link parent. Unlink records one immutable revocation of that
same parent and deletes the exact active row atomically.

Attachment grants, attachment receipts, and `attachment_authority` metadata
represent the root only through hashes and identifiers; none retains the raw
root path. The private legacy `hall_mounted_spokes.root_path` operational field
retains the canonical root for bounded resolution, and every public projection
redacts it. The authority records additionally bind stable root-object identity,
source mission/dispatch receipt identifiers when present, record hash/count,
and parent link identifiers. Hall constraints enforce one receipt per consumed
grant, one revocation per link parent, exact event shapes, and
projection-to-active-link parentage. Persisted mission JSON rejects duplicate
keys, and dispatch receipt hashes are recomputed from canonical receipt bytes
before use.

## Safe inspection

Doctor reads Hall rows only and hashes stored row bindings without stat,
realpath, policy, Git-marker, receipt, or identity reads. Its exact typed
projection is `attachment_authority: { observation: "unobserved", verification:
"not_checked" }` with `filesystem_observation: "not_performed"`; Doctor emits
no verified-authority or mount-token verdict. List and inspect remain redacted,
but their explicit attachment verification is not a Doctor observation. These
public outputs never return raw roots, repository identifiers, remotes, branch
names, metadata, raw mount-token values, credentials, or projection content.
`prune` is limited to an explicitly requested `dry_run=true` exact row/root
comparison and never deletes rows or artifacts.

`verifyMountedSpokeAuthority` validates Hall binding, hub, root, active trusted
read/write policy, receipt integrity, and revocation before invoking the
unchanged `verifyMountToken`. A valid legacy token is reported as
`token_verified`. When the identity file is absent and the active Hall receipt
is valid, the result is `hall_attachment_verified`. An existing malformed,
missing, or mismatched identity cannot be masked by Hall. The safe failure codes
cover policy drift, root moved/drift, wrong hub, receipt mismatch, receipt
revocation, and token mismatch. Every permitted file read is contained,
bounded, no-follow, and rejects hardlinks.
Symlinked or hardlinked skill, lore, design, identity, and journal files are
never consumed.

Capability, journal, health, verify, list, inspect, status, and bead-import
results expose `authority_verification`, a safe failure code when present, and
the legacy `mount_token` verdict. Doctor is intentionally excluded and reports
only the Hall-only not-checked projection above. All of these outputs redact raw
roots, tokens, receipt ids, metadata, and operator text. Spoke bead imports
persist relative lore/design/target paths; absolute targets and any public
`metadata` field fail closed. The attachment projector never reads Hermes
profiles, Git remotes, contributor identities, or repository content, and it
never writes `.cstar` projection or authority artifacts.

## Evidence classes

These contracts prove the source read/mutation boundary only. They do not
activate a new spoke, restore mutation authority, install a plugin, restart a
host, or claim production readiness. A future mutation design requires its own
bead, feature contract, request-identity proof, independent validation, and
separate operator authorization.
