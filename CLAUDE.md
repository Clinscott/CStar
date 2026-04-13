## Host-Native Skill Mandate

Skills are harness skills, not shell commands.

- Do not run CStar skills through terminal dispatch (`cstar run-skill`, dynamic command fallback, shell wrappers, or script shims) unless the skill is explicitly marked terminal-required.
- `entry_surface: "cli"` is not terminal permission. Terminal execution requires `terminal_required: true`, `execution.requires_terminal: true`, or `execution.terminal_contract: "required"`.
- Use the host-native skill bridge/harness for agent-native and host-only skills. `chant` is a host-native skill/planning surface, not a shell workflow.
- Do not add shell scripts as skill entrypoints unless a terminal is intrinsically required. Prefer `SKILL.md` instructions, host workflow adapters, and harness-native activation.
- Verification should be bounded and harness-native. Broad scans or live terminal smoke tests require explicit user approval for the exact command.
- Canonical bridge contract: `docs/host-native-skill-bridge.md`.
