# Host-Native Skill Bridge

> Current invocation authority is
> `docs/integrations/host_native_skill_contract.md`. This short document keeps
> the older filename as a compatibility pointer.

The current host-native surface consists only of `corvus-forge`, `researcher`,
and `cstar-closeout`. The active host reads each skill's `SKILL.md` and performs
the bounded procedure in-session while using `cstar-kernel` for deterministic
lifecycle transitions.

There is no reverse model bridge from CStar into the active host. Do not use
`cstar run-skill`, dynamic registry dispatch, `MimirClient`, One Mind, public
AutoBot, Ravens, a legacy weave, or a model-memory loop to simulate activation.

A skill may instruct the active host to run a specific bounded terminal command
when the command is intrinsic to authorized work. This does not make the skill
itself terminal-executable. Registry discovery, local source generation,
installed/cache state, restart, live activation, and production evidence remain
separate boundaries.
