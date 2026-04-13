# Host-Native Skill Bridge

Skills are harness skills, not shell commands.

## Rule

Agents must activate CStar skills through the host harness, not through terminal dispatch.

Forbidden by default:
- `cstar run-skill <skill>`
- dynamic terminal fallback from registry triggers
- shell wrappers around `.agents/skills/*/scripts/*`
- ad hoc terminal smoke tests for host-only or agent-native skills

Allowed only with an explicit terminal-required contract:
- `terminal_required: true`
- `execution.requires_terminal: true`
- `execution.terminal_contract: "required"`

`entry_surface: "cli"` is a discovery surface, not permission to execute a skill through the terminal.

## Harness Activation Shape

Host-native skill activation must carry structured intent and payload:

```json
{
  "skill_id": "chant",
  "intent": "Plan bounded Corvus Star work through the Trace Gate.",
  "project_root": "/home/morderith/Corvus/CStar",
  "target_paths": [],
  "payload": {
    "source": "host-harness",
    "query": "..."
  }
}
```

The runtime may record, trace, and audit the activation, but it must not convert host-native work into shell execution unless the registry says the terminal is intrinsic to the capability.

## Migration Rule

Existing script entrypoints under `.agents/skills/*/scripts/*` are compatibility artifacts. Each must be classified as one of:

- `host-native`: remove terminal dispatch and document the harness flow in `SKILL.md`.
- `compatibility-only`: keep for legacy users, but block agent workflow routing.
- `terminal-required`: add an explicit terminal-required contract and a short reason.

New skills should be `SKILL.md` plus host workflow/runtime adapter first. Do not add a script shim to make a skill callable from the terminal.

Migration ledger: `docs/terminal-skill-migration.md`.
