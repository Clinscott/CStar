# Terminal Skill Migration

Status: COMPLETE FOR THE CURRENT REGISTRY

The current registry contains only the host-native agent skills
`corvus-forge`, `researcher`, and `cstar-closeout`. None has a public shell
invocation. The runtime recognizes their declarations only to support discovery
and enforce fail-closed terminal/runtime dispatch.

Legacy scripts and weave entrypoints are compatibility artifacts. They are not
part of the current registry and must remain read-only or fail closed before
model, process, filesystem, Git, Hall, or memory mutation. Their continued
source cleanup is a retirement task, not an active skill-migration path.

New reusable behavior starts as `SKILL.md` instructions for the active host.
Individual focused test/build/inspection commands may be terminal-required
inside that procedure, but no wrapper may make the whole skill executable from
the terminal.

See `docs/integrations/host_native_skill_contract.md` and
`docs/architecture/SKILL_REGISTRY.md` for the current contract.
