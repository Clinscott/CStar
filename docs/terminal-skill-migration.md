# Terminal Skill Migration

Status: OPEN

## Policy

Skills are harness skills, not shell commands.

Default classification:
- `SKILL.md` / host workflow adapter only: `host-native`
- `.agents/skills/*/scripts/*` entrypoint with no explicit terminal contract: `compatibility-only`
- explicit `terminal_required: true`, `execution.requires_terminal: true`, or `execution.terminal_contract: "required"`: `terminal-required`

`entry_surface: "cli"` is not terminal permission.

## Migration Steps

1. For each `.agents/skills/*/scripts/*` registry entry, move agent workflow instructions into `SKILL.md` and route activation through the host harness.
2. Leave legacy scripts as `compatibility-only` only where external users still need them.
3. Add explicit terminal-required contracts only when a terminal is intrinsic to the capability, such as installing packages, invoking an operating-system tool, or running a bounded test/build command.
4. Block all other skill execution through terminal dispatch.
5. Promote the terminal skill policy audit into the authoritative test suite once the registry has been classified.

## Non-Goals

- Do not delete compatibility scripts blindly.
- Do not use broad terminal scans as migration verification.
- Do not add new shell wrappers to make host-native skills callable from the terminal.
