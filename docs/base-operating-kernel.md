# CStar Base Operating Kernel

This is the austerity contract for CStar.

CStar is retained only where it reduces cognitive load: memory, task state, route advice, resume state, health checks, and focused verification. It is not retained as a universal host operating system.

## Keep

- `hall`: searchable estate memory.
- `bead`: active task and session state.
- `augury`: compact mission advice: route, scope, expert, next action.
- `doctor`: health check for broken kernel state.
- `handoff`: compact resume summary.
- `verify`: focused checker recommendation and result recording.

## Freeze

- Cross-host inference gates.
- Silent hooks.
- Host plugin parity work.
- Persona ceremony that does not affect technical output.
- Spell recursion.
- Auto-learning pipelines without quick auditability.
- Generated install surface churn.

## Mission Loop

1. Recover state with `./cstar augury handoff --json`.
2. Search memory with one bounded `./cstar hall "<query>"`.
3. Inspect only relevant files.
4. Make the smallest useful change.
5. Run the focused checker.
6. Record or summarize the result.

## Failure Loop

1. Run `./cstar augury doctor --json`.
2. Repair the failed kernel surface or explicitly defer it.
3. Continue the mission loop.

## Success Criteria

- Session start takes under 30 seconds.
- One command exposes active state.
- One Hall query finds relevant memory.
- Agents do not need repeated correction to use CStar.
- Verification is focused and explainable.
- CStar reduces user attention instead of consuming it.
