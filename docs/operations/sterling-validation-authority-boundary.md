# Sterling Validation Authority Boundary

A bead can reach `RESOLVED` only when all three Sterling legs are current and
cryptographically joined:

- Lore is one or more safe relative `.feature` files inside the CStar root.
- Isolation is one or more safe relative focused-test files under `tests/`.
- Audit is the exact positive `hall_validation_runs` receipt for the same bead
  and repository.

Caller paths are resolved without following symlinks, must be regular
single-link files, and are read with a 1 MiB bound. Absolute paths, traversal,
duplicates, missing files, non-Gherkin Lore, and unrecognized Isolation names
fail closed with value-free error classes. Sterling never reads an arbitrary
caller path outside the repository.

The Hall receipt is authoritative only when `cstar_record_result` stored it
through one of two independent kernel-verified paths. Forge work uses
`authority_class=verified_v2`; its canonical `cstar.validation-evidence.v2`
manifest binds the exact request, authorization, execution receipt, attempt,
adapter, result artifact, target set, bead, and repository. Its validator root
thread must differ from both the Forge requester and authorizing executor.

Host-workflow work uses `authority_class=verified_v3`; its canonical
`cstar.validation-evidence.v3` manifest binds the exact bead, repository,
target, validation manifest, recording root CoS, and depth-one validator
subagent receipt. The validator must have one latest completed final turn that
names the exact manifest SHA-256 and validation id. This path grants neither the
subagent mutation authority nor the root a Forge-finalization shortcut. In a
separated live runtime these evidence bytes come from the canonical code root;
Hall state remains in the control root.

Both schemas require nonempty artifact and passed-check arrays whose SHA-256
values recompute. The receipt must be no older than 24 hours, postdate the bead,
and retain unchanged evidence files. The current Lore and Isolation byte hashes
must appear exactly in the manifest.

Verified-v2 and verified-v3 receipts are immutable. A repeated validation id
cannot change its scope, verdict, identity, manifest, or authority. Legacy
verified-v1 receipts remain readable history but cannot be promoted, finalize
Forge, or satisfy Sterling; a verified-v2 or verified-v3 receipt cannot be
downgraded or replaced. Only verified-v2 can finalize Forge.

Sterling ignores cached `bead.metadata.mandate_evidence`. Scalar Gungnir
scores, claimed Warden results, free-form force reasons, and mandate exemptions
cannot resolve a bead. Emergency work remains open or blocked until an
independent receipt exists; the operator may authorize work, but a prose
override is not validation evidence.

Focused proof:

- `tests/unit/sterling_mandate.test.ts`
- `tests/unit/test_hall_read_only_boundary.test.ts`
- `tests/unit/test_sterling_validation_authority_documentation.py`
- `tests/features/cstar_sterling_validation_authority.feature`
