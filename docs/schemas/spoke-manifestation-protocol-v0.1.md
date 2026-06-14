# Spoke Manifestation Protocol v0.1

Status: draft interoperability protocol derived from CStar White Paper v0.3,
Progression and Manifestation Doctrine, and the Corvus Spatial AI Vision v0.1.

Purpose: Preserve creative freedom for spoke manifestations while giving CStar
enough common structure for visibility, interaction, authority review, and
Warden validation.

## Design Rule

The protocol must define ports, not imagination.

A builder may manifest a spoke as almost anything. CStar needs only enough
structure to answer:

- what is it?
- who controls it?
- what can it do?
- what may it touch?
- how is it invoked?
- how can another spoke or operator interact with it?
- what has been validated?
- who can see which layer?
- what must remain private?

## Relationship To Existing Schemas

This protocol does not replace `SpokeManifest v0.3` or
`InteractionContract v0.3`.

- `SpokeManifest v0.3` defines the system identity and authority surface.
- `InteractionContract v0.3` defines verbs and arena behavior for shared play.
- `Spoke Manifestation Protocol v0.1` defines the spatial and visibility layer
  that binds functional identity to manifest form.

## Conceptual Type

```ts
type ManifestationKind =
  | 'item'
  | 'familiar'
  | 'companion'
  | 'ward'
  | 'aura'
  | 'sanctum'
  | 'vessel'
  | 'instrument'
  | 'structure'
  | 'environment'
  | 'interface'
  | 'custom';

type VisibilityLayer = 'private' | 'trusted' | 'public' | 'hidden';

type InvocationMode =
  | 'manual_ui'
  | 'voice'
  | 'gesture'
  | 'physical_object'
  | 'nfc'
  | 'bluetooth'
  | 'device_bridge'
  | 'scheduled'
  | 'triggered_under_policy';

interface SpokeManifestationProtocol {
  schema: 'cstar.spoke_manifestation.v0.1';
  spokeId: string;
  ownerId: string;
  displayName: string;
  category: string;
  eligibleSlots: string[];
  functionalRole: string;
  authorityClass: string[];
  executionModes: string[];
  riskClass: 'low' | 'medium' | 'high' | 'critical';
  manifestation: ManifestationProfile;
  invocation: InvocationProfile;
  interaction: InteractionProfile;
  proof: ProofProfile;
  visibility: VisibilityProfile;
  privacy: PrivacyProfile;
}

interface ManifestationProfile {
  kind: ManifestationKind;
  mythicForm: string;
  visualSummary: string;
  spatialScale: 'icon' | 'handheld' | 'body' | 'room' | 'building' | 'world';
  assetRefs?: AssetRef[];
  doesNotImplyAuthority: true;
}

interface AssetRef {
  assetId: string;
  assetType: 'icon' | 'image' | 'model' | 'scene' | 'sound' | 'animation' | 'other';
  uri: string;
  integrity?: string;
  license?: string;
}

interface InvocationProfile {
  modes: InvocationMode[];
  defaultMode: InvocationMode;
  requiresConfirmationFor: string[];
  physicalObjectBinding?: {
    bindingType: 'nfc' | 'bluetooth' | 'qr' | 'device_bridge' | 'manual';
    objectDescription: string;
    grantsAuthority: false;
  };
}

interface InteractionProfile {
  implements?: string[];
  consumes?: string[];
  publicInteractions?: string[];
  trustedInteractions?: string[];
  privateInteractions?: string[];
}

interface ProofProfile {
  validationRequired: string[];
  currentSeals?: string[];
  lastVerifiedAt?: string;
  proofRefs?: string[];
}

interface VisibilityProfile {
  defaultLayer: VisibilityLayer;
  publicSummary?: string;
  trustedSummary?: string;
  privateSummary?: string;
  publicFields: string[];
  trustedFields: string[];
  privateFields: string[];
}

interface PrivacyProfile {
  neverExpose: string[];
  consentRequiredFor: string[];
  childSafetyRelevant?: boolean;
  familyDataRelevant?: boolean;
  operationalSecurityRelevant?: boolean;
}
```

## Required Fields

Every manifestation protocol object must include:

- `schema`
- `spokeId`
- `ownerId`
- `displayName`
- `category`
- `eligibleSlots`
- `functionalRole`
- `authorityClass`
- `executionModes`
- `riskClass`
- `manifestation.kind`
- `manifestation.mythicForm`
- `manifestation.visualSummary`
- `manifestation.spatialScale`
- `manifestation.doesNotImplyAuthority: true`
- `invocation.modes`
- `invocation.defaultMode`
- `invocation.requiresConfirmationFor`
- `interaction`
- `proof.validationRequired`
- `visibility.defaultLayer`
- `visibility.publicFields`
- `visibility.trustedFields`
- `visibility.privateFields`
- `privacy.neverExpose`
- `privacy.consentRequiredFor`

## Acceptance Rules

- Manifestation must never expand authority.
- Physical objects may invoke or focus attention; they must not grant authority.
- Public visibility must be privacy-safe and must not expose private memory,
  child data, secrets, operational state, device identity, infrastructure, live
  security posture, or hidden spokes.
- Trusted visibility must be consented and revocable.
- Private visibility remains local/operator-controlled unless a separate gate
  authorizes sync or sharing.
- Public or trusted interactions must be backed by `InteractionContract`
  interfaces or explicitly marked as non-interactive display only.
- Warden seals and proof references must point to real validation artifacts.
- If child safety, family data, security, or external account authority is
  relevant, the risk class cannot be treated as cosmetic.

## YAML Example: XO Compass

```yaml
schema: cstar.spoke_manifestation.v0.1
spokeId: xo
ownerId: morderith
displayName: XO Compass
category: companion_tutor
eligibleSlots: [companion, relic, instrument]
functionalRole: Child-safe tutor and counsel surface under guardian authority.
authorityClass: [observe, advise, draft]
executionModes: [manual, confirmed]
riskClass: high
manifestation:
  kind: instrument
  mythicForm: A mechanical compass that opens into a guardian tutor.
  visualSummary: Brass compass, soft star glow, tutor figure and learning surface visible only in private AR.
  spatialScale: handheld
  doesNotImplyAuthority: true
invocation:
  modes: [manual_ui, physical_object, device_bridge]
  defaultMode: manual_ui
  requiresConfirmationFor: [memory_write, curriculum_change, external_message]
  physicalObjectBinding:
    bindingType: manual
    objectDescription: Connected mechanical compass concept; prototype must begin as software-only.
    grantsAuthority: false
interaction:
  implements: [companion_tutor.private_view]
  consumes: [guardian_policy, curriculum_context]
  publicInteractions: []
  trustedInteractions: [show_guardian_approved_learning_seal]
  privateInteractions: [open_tutor_surface, review_curriculum, draft_learning_plan]
proof:
  validationRequired:
    - child_safety_review
    - guardian_control_review
    - privacy_review
    - curriculum_quality_review
  currentSeals: []
visibility:
  defaultLayer: private
  publicSummary: Private companion tutor, public projection disabled by default.
  trustedSummary: Guardian-approved learning companion, no child details exposed.
  privateSummary: Full tutor, curriculum, memory, and counsel surface.
  publicFields: [displayName, category]
  trustedFields: [displayName, category, publicSummary, currentSeals]
  privateFields: [functionalRole, authorityClass, executionModes, proof, privateSummary]
privacy:
  neverExpose:
    - child_identity
    - child_memory
    - curriculum_state
    - guardian_controls
    - family_schedule
  consentRequiredFor: [trusted_projection, any_external_message]
  childSafetyRelevant: true
  familyDataRelevant: true
```

## YAML Example: Corvus Forge

```yaml
schema: cstar.spoke_manifestation.v0.1
spokeId: corvus-forge
ownerId: morderith
displayName: Corvus Forge
category: forge_builder
eligibleSlots: [forge, weapon, relic]
functionalRole: Controlled build-and-review loop for accepted CStar work.
authorityClass: [draft, write_local]
executionModes: [confirmed]
riskClass: high
manifestation:
  kind: structure
  mythicForm: A forge where Researcher signal becomes reviewed artifacts.
  visualSummary: Anvil, flame, worker sparks, Warden seals, receipt chains, and PR gates.
  spatialScale: room
  doesNotImplyAuthority: true
invocation:
  modes: [manual_ui]
  defaultMode: manual_ui
  requiresConfirmationFor: [live_fire, worker_dispatch, push, pr_creation, merge]
interaction:
  implements: [forge.reviewed_artifact_flow]
  consumes: [research_proposal, cstar_bead, pmt_packet]
  publicInteractions: [show_readiness_posture]
  trustedInteractions: [show_worker_pr_evidence, show_receipt_summary]
  privateInteractions: [inspect_packets, inspect_receipts, inspect_blockers]
proof:
  validationRequired:
    - exact_head_validation
    - dirty_root_isolation
    - finalizer_result
    - verified_finalization
    - pmt_review
  currentSeals: []
visibility:
  defaultLayer: private
  publicSummary: Controlled CStar build loop; no live operational details.
  trustedSummary: Selected proof posture and draft PR evidence.
  privateSummary: Full packet, receipt, worker, finalizer, and review state.
  publicFields: [displayName, category, publicSummary]
  trustedFields: [displayName, category, trustedSummary, currentSeals]
  privateFields: [functionalRole, authorityClass, executionModes, proof, privateSummary]
privacy:
  neverExpose:
    - secrets
    - private_repo_state
    - dirty_worktree_content
    - unpublished_security_findings
    - worker_prompts_with_sensitive_context
  consentRequiredFor: [trusted_projection, worker_evidence_sharing]
  operationalSecurityRelevant: true
```

## Open Research Questions

- Which asset format should be the first durable target: plain JSON plus web
  preview, glTF, USDZ, WebXR profile, or another bridge?
- How should public aura identity be signed or verified without exposing
  operational internals?
- How should a physical invocation object bind to a spoke without creating a
  false authority grant?
- What is the minimum shared presence protocol for trusted peers?
- What Warden checks are required before community zones exist?

## Deferrals

The following are deferred until the private protocol and viewer are stable:

- public marketplace
- public AR layer
- city-scale or world-scale overlays
- PvP using live user assets
- automatic device bridge permissions
- production physical-object activation
- durable public identity claims
