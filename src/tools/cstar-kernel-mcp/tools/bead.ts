import type { HallBeadRecord, HallBeadStatus, HallBeadTargetKind } from '../../../types/hall.js';
import type { SovereignBead } from '../../../types/bead.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import {
    type MandateEvidence,
} from '../../../node/core/sterling_mandate.js';
import { database } from '../../pennyone/intel/database.js';
import {
    mcpErrorCode,
    mcpMutation,
    preAuthorizationErrorResponse,
    textResponse,
} from '../contracts/responses.js';
import { CODE_ROOT } from '../contracts/runtime.js';
import {
    bindKernelStampedSpokeAnchorMetadata,
    compactBead,
    generateBeadId,
    mergeCallerMetadataPreservingSpokeAnchor,
    requireString,
    resolveBeadValidationEvidenceRoots,
    requestedResolvedValidationId,
    resolveActiveRepo,
    resolvedValidationIdForBead,
    resolveSpokeAnchor,
    upsertBeadFromExisting,
    withResolvedValidationMetadata,
} from './shared.js';
import {
    verifyCodexRequestIdentity,
    type VerifiedCodexRequestIdentity,
} from './operator_authorization.js';
import { bindForgeMissionGrantEnvelopeMetadata }
    from '../../pennyone/intel/forge_mission_grant_envelope.js';
import {
    bindAutonomousDispatchPolicyCreationMetadata,
    isAutonomousDispatchPolicyMetadata,
} from './forge_autonomous_policy_contract.js';
import {
    gateSterlingResolution,
    type SterlingMandateAuditEntry,
} from './sterling_resolution.js';

type BeadAction = 'get' | 'list' | 'create' | 'update_status' | 'claim' | 'resolve' | 'block';

export interface BeadToolArgs {
    action: BeadAction;
    bead_id?: string;
    limit?: number;
    statuses?: HallBeadStatus[];
    target_kind?: HallBeadTargetKind;
    target_path?: string;
    target_ref?: string;
    rationale?: string;
    acceptance_criteria?: string;
    checker_shell?: string;
    contract_refs?: string[];
    status?: HallBeadStatus;
    assigned_agent?: string;
    resolution_note?: string;
    resolved_validation_id?: string;
    validation_id?: string;
    triage_reason?: string;
    metadata?: Record<string, unknown>;
    spoke?: string;
    mandate_evidence?: MandateEvidence;
}

function mutationIdentityMetadata(identity: VerifiedCodexRequestIdentity | null) {
    return identity ? {
        mutation_request_identity: {
            source: identity.source,
            thread_id: identity.thread_id,
            turn_id: identity.turn_id,
            turn_record_set_sha256: identity.turn_record_set_sha256,
        },
    } : {};
}

function gateSterlingMandate(
    bead: SovereignBead,
    args: BeadToolArgs,
    hubRoot: string,
): SterlingMandateAuditEntry {
    const validationId = args.mandate_evidence?.audit?.validation_id?.trim();
    const validation = validationId
        ? database.getValidationRunById(validationId)
        : undefined;
    const evidenceRoots = validationId ? resolveBeadValidationEvidenceRoots({
        controlRoot: hubRoot,
        codeRoot: CODE_ROOT,
        repoId: bead.repo_id,
        beadMetadata: bead.metadata,
    }) : undefined;
    return gateSterlingResolution({
        bead: {
            bead_id: bead.id,
            repo_id: bead.repo_id,
            rationale: bead.rationale,
            status: bead.status,
            target_path: bead.target_path,
            baseline_scores: bead.baseline_scores,
            metadata: bead.metadata,
            created_at: bead.created_at,
            updated_at: bead.updated_at,
        } as HallBeadRecord,
        evidence: args.mandate_evidence,
        resolved_validation_id: requestedResolvedValidationId(args, bead),
        hub_root: hubRoot,
        evidence_root: validation?.evidence_manifest?.schema === 'cstar.validation-evidence.v3'
            ? evidenceRoots?.v3Root : evidenceRoots?.v2Root,
        actor: 'cstar-kernel-mcp',
    });
}

export async function handleBead(args: BeadToolArgs, requestContext?: McpRequestContext) {
    const identityRequired = !['get', 'list'].includes(args.action);
    let requestIdentityVerified = !identityRequired;
    try {
        const now = Date.now();
        const requestIdentity = identityRequired
            ? await verifyCodexRequestIdentity(requestContext, now)
            : null;
        requestIdentityVerified = true;
        if (args.action !== 'get' && args.action !== 'list') {
            // Every remaining action is a declared Hall mutation. Bootstrap is
            // therefore permitted here, before read helpers inspect the store.
            database.getWritableDb();
        }
        const { root, repoId: kernelRepoId } = resolveActiveRepo();

        if (args.action === 'list') {
            const limit = Math.min(args.limit || 5, 10);
            const beads = database.getHallBeads(root, args.statuses);
            return textResponse({
                status: 'ok',
                action: 'list',
                count: Math.min(beads.length, limit),
                beads: beads.slice(0, limit).map(compactBead),
            });
        }

        if (args.action === 'create') {
            const rationale = requireString(args.rationale, 'rationale');
            const anchor = resolveSpokeAnchor(args.spoke);
            const repoId = anchor.repoId || kernelRepoId;
            const beadId = args.bead_id?.trim() || generateBeadId(rationale);
            const targetKind = args.target_kind || (args.target_path ? 'FILE' : 'OTHER');
            const rawMetadata = {
                ...bindKernelStampedSpokeAnchorMetadata(args.metadata, anchor.metadata),
                source: 'cstar-kernel-mcp',
                ...mutationIdentityMetadata(requestIdentity),
            };
            const existing = database.getHallBead(beadId);
            if (isAutonomousDispatchPolicyMetadata(rawMetadata)
                || isAutonomousDispatchPolicyMetadata(existing?.metadata)) {
                if (existing) throw new Error('forge_autonomous_policy_bead_already_exists');
            }
            const metadata = bindForgeMissionGrantEnvelopeMetadata(
                bindAutonomousDispatchPolicyCreationMetadata({
                    db: database.getWritableDb(), bead_id: beadId, repo_id: repoId,
                    target_ref: args.target_ref || args.target_path || '',
                    target_path: args.target_path ?? null, status: args.status || 'OPEN', now,
                    metadata: rawMetadata,
                }),
            );
            database.upsertHallBead({
                bead_id: beadId,
                repo_id: repoId,
                target_kind: targetKind,
                target_ref: args.target_ref || args.target_path,
                target_path: args.target_path,
                rationale,
                contract_refs: args.contract_refs || [],
                baseline_scores: {},
                acceptance_criteria: args.acceptance_criteria,
                checker_shell: args.checker_shell,
                status: args.status || 'OPEN',
                assigned_agent: args.assigned_agent,
                source_kind: 'MCP',
                metadata,
                created_at: now,
                updated_at: now,
            });
            return textResponse({
                status: 'created',
                action: 'create',
                mutation: mcpMutation('hall_bead_create', beadId, 'Hall bead was persisted through the MCP write surface.'),
                spoke: anchor.spoke?.slug,
                repo_id: repoId,
                bead: compactBead(database.getHallBead(beadId)),
            });
        }

        const beadId = requireString(args.bead_id, 'bead_id');
        const bead = database.getHallBead(beadId);
        if (!bead) return textResponse({ error: `Bead not found: ${beadId}` }, true);

        if (args.action === 'get') {
            return textResponse({ status: 'ok', action: 'get', bead: compactBead(bead) });
        }
        if (isAutonomousDispatchPolicyMetadata(bead.metadata)) {
            throw new Error('forge_autonomous_policy_bead_mutation_forbidden');
        }

        if (args.action === 'update_status') {
            const status = args.status || (() => { throw new Error('status is required.'); })();
            const sterlingPatch = status === 'RESOLVED' ? gateSterlingMandate(bead, args, root) : null;
            const resolvedValidationId = status === 'RESOLVED'
                ? requestedResolvedValidationId(args, bead)
                : resolvedValidationIdForBead(bead);
            const updated = upsertBeadFromExisting(bead, {
                status,
                resolution_note: args.resolution_note ?? bead.resolution_note,
                resolved_validation_id: resolvedValidationId,
                triage_reason: args.triage_reason ?? bead.triage_reason,
                metadata: withResolvedValidationMetadata({
                    ...mergeCallerMetadataPreservingSpokeAnchor(bead.metadata, args.metadata),
                    updated_by: 'cstar-kernel-mcp',
                    ...mutationIdentityMetadata(requestIdentity),
                    ...(sterlingPatch !== null ? { sterling_mandate: sterlingPatch } : {}),
                }, resolvedValidationId),
            });
            return textResponse({
                status: 'updated',
                action: 'update_status',
                mutation: mcpMutation('hall_bead_update_status', beadId, 'Hall bead status was persisted through the MCP write surface.'),
                bead: compactBead(updated),
                ...(sterlingPatch !== null ? { sterling_mandate: sterlingPatch } : {}),
            });
        }

        if (args.action === 'claim') {
            const assignedAgent = requireString(args.assigned_agent, 'assigned_agent');
            const updated = upsertBeadFromExisting(bead, {
                assigned_agent: assignedAgent,
                status: args.status || 'IN_PROGRESS',
                metadata: {
                    ...mergeCallerMetadataPreservingSpokeAnchor(bead.metadata, args.metadata),
                    claimed_by: assignedAgent,
                    claim_source: 'cstar-kernel-mcp',
                    ...mutationIdentityMetadata(requestIdentity),
                },
            });
            return textResponse({
                status: 'claimed',
                action: 'claim',
                mutation: mcpMutation('hall_bead_claim', beadId, 'Hall bead claim was persisted through the MCP write surface.'),
                bead: compactBead(updated),
            });
        }

        if (args.action === 'resolve') {
            const sterlingPatch = gateSterlingMandate(bead, args, root);
            const resolvedValidationId = requestedResolvedValidationId(args, bead);
            const updated = upsertBeadFromExisting(bead, {
                status: 'RESOLVED',
                resolution_note: args.resolution_note || bead.resolution_note || 'Resolved through cstar-kernel MCP.',
                resolved_validation_id: resolvedValidationId,
                metadata: withResolvedValidationMetadata({
                    ...mergeCallerMetadataPreservingSpokeAnchor(bead.metadata, args.metadata),
                    resolved_by: 'cstar-kernel-mcp',
                    sterling_mandate: sterlingPatch,
                    ...mutationIdentityMetadata(requestIdentity),
                }, resolvedValidationId),
            });
            return textResponse({
                status: 'resolved',
                action: 'resolve',
                mutation: mcpMutation('hall_bead_resolve', beadId, 'Hall bead resolution was persisted after Sterling Mandate evaluation.'),
                bead: compactBead(updated),
                sterling_mandate: sterlingPatch,
            });
        }

        if (args.action === 'block') {
            const triageReason = requireString(args.triage_reason || args.resolution_note, 'triage_reason');
            const updated = upsertBeadFromExisting(bead, {
                status: 'BLOCKED',
                triage_reason: triageReason,
                resolution_note: args.resolution_note ?? bead.resolution_note,
                metadata: {
                    ...mergeCallerMetadataPreservingSpokeAnchor(bead.metadata, args.metadata),
                    blocked_by: 'cstar-kernel-mcp',
                    ...mutationIdentityMetadata(requestIdentity),
                },
            });
            return textResponse({
                status: 'blocked',
                action: 'block',
                mutation: mcpMutation('hall_bead_block', beadId, 'Hall bead blocker state was persisted through the MCP write surface.'),
                bead: compactBead(updated),
            });
        }

        return textResponse({ error: `Unsupported bead action: ${args.action}` }, true);
    } catch (error: any) {
        if (!requestIdentityVerified) {
            return preAuthorizationErrorResponse(mcpErrorCode(error), error);
        }
        return textResponse({ error: error.message }, true);
    }
}
