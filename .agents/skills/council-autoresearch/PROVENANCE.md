# Council autoresearch provenance

This reference skill was extracted from a project-local prototype used for the
Northammer site. No site source, private pass ledger, ratings, state file,
receipt, or project baseline is included here.

The generic implementation was rewritten against CStar's host-native and
CONTROL_ROOT boundaries after independent adversarial review. In particular,
the CStar version rejects the prototype's filename-only state, unsigned ratings,
same-receipt mapping reveal, reusable protocol identities, source-lock cleanup
race, syntax-only publication gate, unsealed crash visibility, receipt-path hash
permutation, and a published-runner checkpoint not bound to the checkout that
actually executes the workflow.

The first landing is deliberately unregistered. Promotion into
`.agents/skill_registry.json` and generated host distributions requires a later,
independent review and a separately versioned distribution change.

Runtime evidence remains bounded: signed host receipts attest the configured
host invocation and exact inputs/outputs, not a model's metaphysical identity or
independent statistical sampling. Council verdicts are advisory and never grant
source, Git, provider, Hall, deployment, or promotion authority.
