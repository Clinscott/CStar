# Council autoresearch provenance

This reference skill was extracted from a project-local prototype used for the
Northammer site. No site source, private pass ledger, ratings, state file,
receipt, or project baseline is included here.

The generic implementation was rewritten against CStar's host-native and
CONTROL_ROOT boundaries after independent adversarial review. In particular,
the CStar version rejects the prototype's filename-only state, unsigned ratings,
same-receipt mapping reveal, reusable protocol identities, source-lock cleanup
race, and syntax-only publication gate.

The registered landing followed independent adversarial review and a separate
registry/distribution change. Registration is a capability declaration only.
Generated plugin bundles advertise the `exec-bridge` and expect this runtime in
the installed CStar checkout; they do not embed arbitrary `src/` runtime files
or turn the workflow into a standalone kernel adapter.

Runtime evidence remains bounded: signed host receipts attest the configured
host invocation and exact inputs/outputs, not a model's metaphysical identity or
independent statistical sampling. Council verdicts are advisory and never grant
source, Git, provider, Hall, deployment, or promotion authority.
