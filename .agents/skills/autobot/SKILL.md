---
name: autobot
description: "Use when a sovereign bead should be executed by AutoBot/Hermes as an ephemeral worker with checker-gated retries and forced teardown after every attempt."
risk: safe
source: internal
---

# AUTOBOT SKILL

## When to Use
- Use when CorvusStar should assign a bounded sovereign bead to AutoBot instead of doing the implementation itself.
- Use when Hermes must be treated as disposable compute: one bead, one attempt, then tear it down to flush local context and VRAM.

## MANDATE
Claim a sovereign bead, launch Hermes inside `/home/morderith/Corvus/AutoBot`, assign exactly one bounded implementation attempt, run an external checker from the CorvusStar root, and either retry with validation feedback or finalize the bead honestly.
AutoBot must assume a tight 32k context window. The bead brief it receives should already be compressed to immediate Hall/PennyOne context, and AutoBot must preserve that discipline while working.

## AUTHORITY
`autobot` is a first-class skill package.
The authoritative entrypoint is `.agents/skills/autobot/scripts/autobot.py`.
`overseer.py` is a compatibility wrapper only.

## LOOP
1. Claim an explicit bead or the next actionable bead from `hall_beads`.
2. Launch Hermes from the AutoBot directory in a PTY and wait for the ready prompt.
3. Inject one bounded bead prompt that makes AutoBot the worker and CorvusStar the orchestrator.
4. Terminate Hermes as soon as the attempt completes, fails, or times out.
5. Run the checker command in the CorvusStar project root.
6. On checker failure, launch a fresh Hermes process with the validation feedback and retry within policy.
7. Resolve the bead only after accepted validation evidence exists; otherwise leave it `READY_FOR_REVIEW` or block it honestly.

## CONSTRAINTS
- AutoBot does the implementation work.
- The orchestrator only claims, validates, retries, resolves, or blocks the bead.
- Every Hermes run is ephemeral and must be killed after each attempt.
- Treat the provided Hall/PennyOne brief as the authoritative non-local context budget.
- Keep exploration local to the target path and directly adjacent files unless the bead proves that more is required.
