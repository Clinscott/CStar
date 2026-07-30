# Retired Node Deployment Surface

`src/node/deployment.ts` is a fail-closed compatibility tombstone. Its former
behavior renamed a candidate over a target and automatically ran `git add` and
`git commit`. That path bypassed the current CStar lifecycle and collapsed
separate operator gates into one helper call.

Every invocation now raises
`legacy_node_deployment_retired_use_operator_gated_cstar_git_closure` before
filesystem, process, Git, log, or injected callback activity. Forge delivery
remains unverified evidence until independent CStar validation. Exact-file
staging, commit, push, pull-request creation, and merge each require their own
current operator grant and supported Git workflow.
