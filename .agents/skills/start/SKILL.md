---
name: start
description: "Use when awakening the system pulse, initiating a specific agent loop, or bootstrapping the runtime environment."
risk: safe
source: internal
---

# 🔱 START SKILL (v1.0)

## When to Use
- Use to awaken the system kernel and synchronize the kernel bridge.
- Use when starting a specific high-level agent loop (e.g., Loki mode).

## MANDATE
Act as the public host-native start front for Corvus Star by deciding whether to resume host governance or wake the kernel only, then delegating the bounded startup mechanics to the runtime.

## LOGIC PROTOCOL
1. **CEREMONY**: Execute the startup ceremony (visual and structural validation).
2. **PROVIDER RESOLUTION**: Identify the active host provider (Gemini, Codex, or Claude).
3. **SPINE AWAKENING**: Bootstrap the runtime dispatcher and all registered adapters.
4. **GOVERNANCE RESUME**: Check for active beads and resume the host governor if governed validation is needed.

## RUNTIME BOUNDARY
- Public start supervision belongs to the host session.
- Kernel wake and governor handoff remain bounded execution primitives.
- Treat `cstar start` as a supervisory decision surface, not as a purely local bootstrap command.

## USAGE
`cstar start`
`cstar start [target]`
