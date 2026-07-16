# Retired StateRegistry Mutation Boundary

`StateRegistry` is a read-only compatibility view. It projects bounded status,
persona, mounted-spoke, and agent-presence fields from canonical Hall tables.
It does not read `.agents/sovereign_state.json`, trust a generic
`sovereign_projection` metadata object, infer active agents, or manufacture a
current mission.

The former mutation methods `updateMission`, `updateFramework`,
`postToBlackboard`, `pushTerminalLog`, and `save` return
`legacy_state_registry_mutation_retired_use_cstar_kernel` before Hall,
filesystem, blackboard, mounted-spoke, presence, or coordination effects. A
caller must use the matching request-classified `cstar-kernel` lifecycle tool;
calling the compatibility class is not an authorization path.

`cstar_status` is therefore a read operation. A missing, unsafe, or unavailable
Hall store produces an inert projection and a freshness gap. Lifecycle truth
comes from bead, handoff, goal, Forge, Researcher, and validation receipts—not
from legacy JSON or arbitrary repository metadata.
