# CStar Authority Doctrine

Status: derived canon from CStar White Paper v0.3

## Core Split

Authority, risk, trust, execution mode, and capability tier are different
dimensions. CStar must not collapse them into one ladder.

| Dimension | Question |
| --- | --- |
| Authority | What is the spoke allowed to affect? |
| Risk | How much harm could occur if it fails or is misused? |
| Trust | How much confidence does CStar have in the spoke? |
| Execution mode | How and when may the spoke run? |
| Capability tier | How complex or impactful is the ability? |

## Authority Classes

| Authority class | Meaning |
| --- | --- |
| observe | Read or inspect authorized information. |
| advise | Recommend or critique without changing state. |
| draft | Prepare changes, plans, messages, or artifacts for review. |
| write_local | Modify local state inside an authorized boundary. |
| write_external | Affect external systems, remotes, accounts, or other people. |
| privileged | Act with elevated access, sensitive scopes, or security impact. |
| forbidden | Explicitly disallowed behavior. |

## Execution Modes

| Execution mode | Meaning |
| --- | --- |
| manual | Operator initiates every run. |
| confirmed | System prepares; operator confirms before execution. |
| scheduled | Runs on a schedule under policy. |
| triggered | Runs when a declared event occurs under policy. |
| autonomous_under_policy | Runs without per-event approval only inside explicit policy and kill-switch boundaries. |

## Governance Rules

- Public profile and AR presence must be opt-in and privacy-filtered.
- User-created spokes must declare category, eligible slots, authority, risk,
  execution mode, validation, and visibility.
- Community-published spokes require manifests, docs, tests, risk declarations,
  and Warden Seal eligibility.
- Any spoke touching security, infrastructure, personal data, finance, health,
  identity, or external systems requires stricter gates.
- Spoke manifestations must not imply prohibited or ungranted capabilities.
- CStar must support hiding, disabling, quarantining, or deleting spokes and
  manifestations.

## Ratification Rule

CStar may propose. CStar may organize. CStar may draft. CStar may recommend.
CStar may not silently expand scope, authority, autonomy, or public exposure.
