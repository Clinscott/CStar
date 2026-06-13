# Interaction Contract v0.3

Status: draft canonical schema derived from CStar White Paper v0.3 and
interaction-doctrine review.

## Purpose

An Interaction Contract lets freeform spokes participate in structured shared
play. It separates manifestation from machine-interoperable behavior.

The minimum viable shared-play atom is a PvE Trial Alpha: one spoke enters an
arena, receives a fractured module and locked test suite, acts through granted
verbs, and receives a deterministic score.

## Minimal PvE Trial Alpha

User story:

> As a spoke, I enter a Trial Arena, receive a fractured module and a sealed
> test suite from the Warden, execute a targeted repair using strictly
> authorized verbs, and receive a deterministic score based on validation,
> efficiency, and resilience.

Success criteria:

1. Warden ingests a `TrialSpec` and initializes a clean sandbox.
2. Spoke registers an `InteractionContract`.
3. Warden grants only the required capability verbs.
4. Verification suite and locked paths cannot be modified by the spoke.
5. Spoke submits a bounded change.
6. Warden runs deterministic verification.
7. Score is computed through a `WardenScoringProfile`.
8. Trial terminates on success, failure, or boundary breach.

## Capability Verb

Capability verbs are atomic authority operations. They are the primary
enforcement surface.

```ts
interface CapabilityVerb {
  verbId: string;
  targetScope: string;
  executionContext?: 'sandboxed' | 'host';
}
```

Required fields:

- `verbId`
- `targetScope`

Optional fields:

- `executionContext`

Initial verb examples:

- `read_state`
- `read_file`
- `write_file`
- `propose_mutation`
- `execute_test`
- `assert_invariant`
- `emit_observation`
- `emit_verdict`
- `store_memory`
- `simulate_state`

## Interface Contract

Interfaces bundle verbs and event shapes for shared play.

```ts
interface InterfaceContract {
  interfaceId: string;
  requiredVerbs: string[];
  eventEmissions?: string[];
}
```

Required fields:

- `interfaceId`
- `requiredVerbs`

Optional fields:

- `eventEmissions`

## Interaction Contract

```ts
interface InteractionContract {
  spokeId: string;
  manifestation?: {
    mythicForm?: string;
    equipmentSlot?: string;
    flavorCategory?: string;
  };
  contracts: {
    implements: string[];
    consumes?: string[];
  };
  capabilities: {
    requestedVerbs: string[];
    grantedVerbs?: string[];
  };
}
```

Required fields:

- `spokeId`
- `contracts.implements`
- `capabilities.requestedVerbs`

Optional fields:

- `manifestation`
- `contracts.consumes`
- `capabilities.grantedVerbs`

`grantedVerbs` is assigned by Wardens or Star Core policy, not by the spoke.

## Trial Spec

```ts
interface TrialSpec {
  trialId: string;
  targetState: string;
  verificationSuite: string;
  arenaBoundary: string;
  scoringProfile: string;
  interactionMode: 'pve_trial' | 'co_op_raid' | 'pvp_duel' | 'red_blue_arena' | 'counsel_debate';
}
```

Required fields:

- `trialId`
- `targetState`
- `verificationSuite`
- `arenaBoundary`
- `scoringProfile`
- `interactionMode`

## Warden Scoring Profile

```ts
interface WardenScoringProfile {
  profileId: string;
  validationType: 'binary_test' | 'sprt_stability' | 'cve_scan' | 'citation_check';
  efficiencyWeight: number;
  speedWeight?: number;
  resiliencePolicy: 'zero_on_violation' | 'negative_on_violation';
}
```

Wardens validate safety and boundary compliance. Deterministic tools and state
checks produce the score.

## Arena Boundary

```ts
interface ArenaBoundary {
  boundaryId: string;
  maxTokens: number;
  maxIterations: number;
  maxWallClockMs: number;
  lockedPaths: string[];
  allowedTargets: string[];
}
```

Required fields:

- `boundaryId`
- `maxTokens`
- `maxIterations`
- `maxWallClockMs`
- `lockedPaths`
- `allowedTargets`

## PvP Consent Policy

PvP is deferred until PvE Trial Alpha is stable, but its contract must be
explicit before any adversarial mode exists.

```ts
interface PvPConsentPolicy {
  policyId: string;
  requiresMutualOptIn: true;
  allowedVectors?: string[];
  concessionProtocol: string;
  syntheticOrOwnedTargetsOnly: true;
}
```

## Stop Conditions

The Warden terminates immediately on:

- requested verb not granted
- write attempt against `lockedPaths`
- target outside `allowedTargets`
- missing interaction contract
- missing scoring profile
- resource ceiling breach
- non-consensual PvP
- attempt to alter verification suite
- attempt to affect host or external systems outside declared boundary

## Deferred Until After PvE Trial Alpha

- PvP duels
- Red/Blue arenas
- co-op raids
- counsel/debate scoring
- rich mythic UI rendering
- community matchmaking
- public renown
- AR/Aura-based shared presence
