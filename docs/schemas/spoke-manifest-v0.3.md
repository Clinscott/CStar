# Spoke Manifest v0.3

Status: draft canonical schema derived from CStar White Paper v0.3

## Purpose

A Spoke Manifest declares what a spoke is, what category it belongs to, where
it can be equipped, what it may do, how risky it is, how it is validated, and
how it may be represented. It is the system contract behind any mythic or
visual form.

## Category and Slot Types

```ts
type SpokeCategory =
  | 'defense_wardenry'
  | 'observation_scout'
  | 'story_voice'
  | 'companion_tutor'
  | 'forge_builder'
  | 'oracle_research'
  | 'archive_memory'
  | 'operations_utility'
  | 'presence_aura'
  | 'custom';

type EquipmentSlot =
  | 'armor'
  | 'shield'
  | 'weapon'
  | 'familiar'
  | 'companion'
  | 'voice'
  | 'oracle'
  | 'forge'
  | 'archive'
  | 'relic'
  | 'aura'
  | 'custom';
```

## Conceptual Type

```ts
interface SpokeManifest {
  id: string;
  slug: string;
  displayName: string;
  creatorId: string;
  category: SpokeCategory;
  eligibleSlots: EquipmentSlot[];
  functionalRole: string;
  authorityRequired: AuthorityClass[];
  riskClass: 'low' | 'medium' | 'high' | 'critical';
  executionModes: ExecutionMode[];
  capabilityTiers: CapabilityTier[];
  validationRequired: string[];
  publicDescription?: string;
  privateNotes?: string;
}

interface SpokeUtilityProfile {
  spokeId: string;
  personalAffinity: number;
  buildSynergy: number;
  validatedPerformance: number;
  communityRenown?: number;
  operatorNotes?: string;
  declaredUseContext?: string;
}

interface SpokeManifestation {
  spokeId: string;
  baseArchetype: string;
  symbolicRole: string;
  visualDescription: string;
  slotExpression: EquipmentSlot;
  visibility: 'private' | 'trusted' | 'public';
  evolutionStage:
    | 'unseen'
    | 'marked'
    | 'shaped'
    | 'embodied'
    | 'attuned'
    | 'awakened'
    | 'projected'
    | 'mythic';
  customAssetsAllowed: boolean;
  doesNotImplyAuthority: true;
}
```

## Acceptance Rules

- Every spoke must declare category, eligible slots, functional role, authority,
  risk, execution modes, capability tiers, and validation requirements.
- Manifestation is optional, but if present it must set
  `doesNotImplyAuthority: true`.
- Utility scores must remain separated into personal affinity, build synergy,
  validated performance, and optional community renown.
- Public descriptions must not reveal private operational details.
- Security-sensitive spokes must define stricter validation and visibility
  rules before publication.
