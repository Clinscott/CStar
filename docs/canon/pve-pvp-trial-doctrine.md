# PvE and PvP Trial Doctrine

Status: derived canon amendment for CStar White Paper v0.3

## Purpose

CStar shared play should reward validated outcomes, not verbosity, persuasion,
cosmetic activity, token burn, or unsafe behavior.

PvE is the primary progression engine. PvP is later-stage, consensual,
sandboxed, and Warden-adjudicated.

## Scoring Model: V-E-R

Trial scoring uses three dimensions:

| Dimension | Meaning | Primary scorer |
| --- | --- | --- |
| Validation | Did the work satisfy the locked verification suite, invariant, scanner, or SPRT harness? | Deterministic tools. |
| Efficiency | How much time, token budget, API budget, and iteration budget did the work consume? | Runtime telemetry and deterministic counters. |
| Resilience | Did the spoke stay inside granted verbs, arena boundaries, and policy? | Wardens and Star Core. |

Wardens grant execution rights, enforce boundaries, run or authorize the test
harness, and record violations. Wardens should not award subjective style
points.

The engine awards points from resulting state.

## Never Score

CStar should not award points for:

- verbosity
- rhetorical persuasion
- sycophancy
- token volume
- cosmetic-only changes
- unverified claims
- unsafe exploit attempts outside the arena
- editing tests or scoring harnesses
- bypassing Warden gates

## PvE Trial

Example: code repair, documentation repair, research synthesis, validation
gauntlet, security posture check on owned or synthetic targets.

Flow:

1. Warden loads a `TrialSpec`.
2. Arena creates a clean isolated workspace.
3. Spoke registers an `InteractionContract`.
4. Warden grants a bounded verb set.
5. Spoke acts inside the arena.
6. Deterministic verification runs.
7. Score is computed from validation, efficiency, and resilience.
8. Result is engraved only after acceptance.

## Co-op Raid

Example: observer finds signal, oracle explains it, builder repairs it, Warden
validates it, archivist engraves it.

Co-op scoring should emphasize the final validated outcome and boundary
compliance, not internal chatter.

Each spoke should have asymmetric verbs. For example, the observer may read
logs, the builder may write files, and the archivist may record accepted
Engrams. A raid is healthy when the final result passes while each participant
stays in its contract.

## PvP Duel

PvP duels compare two or more spokes on the same bounded task in isolated
workspaces.

Rules:

- starting state must be identical
- target must be synthetic or operator-owned
- consent must be explicit
- cross-workspace interference is forbidden
- if both pass validation, efficiency is the tiebreaker
- failure to stay within granted verbs is a zero-score or negative-score event

## Red/Blue Arena

Red/Blue play must remain inside synthetic or explicitly authorized arenas.

Red scores by achieving predefined arena flags. Blue scores by denying those
flags while maintaining required service behavior. Blue cannot win by breaking
the service. Red cannot win through host escape, secret theft, or out-of-arena
activity.

## Counsel and Debate

Counsel/debate is the exception case where the output is primarily reasoning.
It still should not be scored on persuasion.

Score factual support:

- valid file paths
- correct API names
- real constraints
- cited evidence matching the target state
- absence of invented facts

Rhetoric, length, confidence, and theatricality do not score.

## Stop Conditions

Stop a trial immediately on:

- attempted verb not granted
- write attempt against locked path
- missing or invalid interaction contract
- missing Warden gate
- resource limit breach
- out-of-arena target
- non-consensual PvP
- hallucinated tool/file invocation when the arena requires exact references
- attempt to alter scoring harness or verification suite
