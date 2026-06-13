# Refinement Gate v0.3

Status: draft canonical schema derived from CStar White Paper v0.3

## Purpose

A Refinement Gate is the pre-implementation ratification checkpoint for major
CStar work. It exists to keep the operator sovereign and to prevent silent
scope, authority, autonomy, or public-exposure expansion.

## Required For

Use a Refinement Gate for:

- new phase
- new spoke
- new authority class
- external integration
- public/community feature
- AR or profile visibility
- self-building workflow
- high-risk or security-sensitive change

## Gate Types

| Gate type | Required for | Depth |
| --- | --- | --- |
| full | New phase, new spoke, new authority class, external integration, public/community feature, AR visibility, self-building workflow. | Complete brief and explicit approval. |
| light | Small UI change, copy change, low-risk local refactor, minor schema extension. | Condensed review and approval. |
| emergency | Security incident, secret exposure, broken auth, spoke quarantine, recovery action. | Fast review with post-action Engram. |

## Conceptual Type

```ts
interface RefinementGate {
  id: string;
  phaseId: string;
  title: string;
  gateType: 'full' | 'light' | 'emergency';
  intent: string;
  mainPoints: string[];
  proposedDeliverables: string[];
  inScope: string[];
  outOfScope: string[];
  minimumUsefulVersion: string;
  authorityRequired: AuthorityClass[];
  executionModesIntroduced: ExecutionMode[];
  riskClass: 'low' | 'medium' | 'high' | 'critical';
  operatorDecisionsNeeded: string[];
  acceptanceCriteria: string[];
  validationRequired: string[];
  unlocks: string[];
  doesNotUnlock: string[];
  xpEligibleEvents: string[];
  xpIneligibleEvents: string[];
  deferrals: string[];
  status:
    | 'proposed'
    | 'reviewing'
    | 'revised'
    | 'approved'
    | 'deferred'
    | 'rejected'
    | 'implemented'
    | 'validated'
    | 'engraved';
}
```

## Acceptance Rules

- `doesNotUnlock` is mandatory for major gates.
- `authorityRequired` must use authority classes from
  `docs/security/authority-doctrine.md`.
- `executionModesIntroduced` must name any new execution pattern.
- `validationRequired` must include at least one Warden, test, review, or
  evidence path for non-trivial work.
- Gate approval does not imply implementation, merge, publication, rollout, or
  durable skill installation unless those are explicitly in scope.
