# S03A topology adoption

`CSO-ORGANISM-V0-S03A-TIERED-TOPOLOGY-ADOPTION` is an additive metadata
scope. The operator and CStar packet remain the authority.

1. Verify the packet hash, root preimage, and all 19 flat source hashes.
2. Verify that each new path was absent before dispatch.
3. Run `tools/topology_lint.ts`, `tools/inheritance_check.ts`, and
   `tools/compatibility_check.ts` through the three focused tests.
4. Keep the accepted flat files in place. Do not move, copy, symlink, rename,
   overwrite, or activate a tier-local implementation.
5. Keep S04 closed until independent validation and a CSF-D007 checkpoint
   accept this scope.
6. Treat unavailable runtime, identity, or token measurements as typed
   `unavailable`; never infer them.

This runbook cannot create a Bead, reserve an effect, launch a worker, write
the Hall or SQLite, or change a protected gate.
