import type { HallBeadRecord, HallBeadStatus, HallBeadTargetKind } from '../../../types/hall.js';
import type { SovereignBead } from '../../../types/bead.js';
import {
    verifySterlingMandate,
    mergeMandateEvidence,
    type MandateEvidence,
    type MandateVerdict,
} from '../../../node/core/sterling_mandate.js';
import { database } from '../../pennyone/intel/database.js';
import { mcpMutation, textResponse } from '../contracts/responses.js';
import {
    compactBead,
    generateBeadId,
    requireString,
    requestedResolvedValidationId,
    resolveActiveRepo,
    resolvedValidationIdForBead,
    resolveSpokeAnchor,
    upsertBeadFromExisting,
    withResolvedValidationMetadata,
} from './shared.js';

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
    force?: boolean;
    force_reason?: string;
}

interface SterlingMandateAuditEntry {
    verdict: MandateVerdict['verdict'];
    evaluated_at: number;
    legs: MandateVerdict['legs'];
    reasons: string[];
    exemption_reason?: string;
    forced?: boolean;
    force_reason?: string;
    actor: string;
}

function gateSterlingMandate(bead: SovereignBead, args: BeadToolArgs, hubRoot: string): SterlingMandateAuditEntry {
    const beadAsHallRecord = {
        bead_id: bead.id,
        repo_id: bead.repo_id,
        rationale: bead.rationale,
        status: bead.status,
        baseline_scores: bead.baseline_scores,
        metadata: bead.metadata,
        created_at: bead.created_at,
        updated_at: bead.updated_at,
    } as HallBeadRecord;

    const evidence = mergeMandateEvidence(beadAsHallRecord, args.mandate_evidence);
    const verdict = verifySterlingMandate(beadAsHallRecord, evidence, hubRoot);

    if (verdict.verdict === 'REJECTED') {
        if (args.force === true) {
            const forceReason = (args.force_reason ?? '').trim();
            if (forceReason.length === 0) {
                throw new Error(
                    `Sterling Mandate REJECTED for bead '${bead.id}'. ` +
                    `Override requires force=true AND a non-empty force_reason. Reasons: ${verdict.reasons.join('; ')}`,
                );
            }
            return {
                verdict: 'REJECTED',
                evaluated_at: verdict.evaluated_at,
                legs: verdict.legs,
                reasons: verdict.reasons,
                forced: true,
                force_reason: forceReason,
                actor: 'cstar-kernel-mcp',
            };
        }
        throw new Error(
            `Sterling Mandate REJECTED for bead '${bead.id}': ${verdict.reasons.join('; ')}. ` +
            `Provide mandate_evidence with lore_paths + isolation_paths + audit, set mandate_exempt=true with exemption_reason, or override with force=true + force_reason.`,
        );
    }

    return {
        verdict: verdict.verdict,
        evaluated_at: verdict.evaluated_at,
        legs: verdict.legs,
        reasons: verdict.reasons,
        ...(verdict.exemption_reason !== undefined ? { exemption_reason: verdict.exemption_reason } : {}),
        actor: 'cstar-kernel-mcp',
    };
}

export async function handleBead(args: BeadToolArgs) {
    try {
        const { root, repoId: kernelRepoId } = resolveActiveRepo();
        const now = Date.now();

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
                metadata: {
                    source: 'cstar-kernel-mcp',
                    ...(anchor.metadata || {}),
                    ...(args.metadata || {}),
                },
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
                    ...(bead.metadata || {}),
                    ...(args.metadata || {}),
                    updated_by: 'cstar-kernel-mcp',
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
                metadata: { ...(bead.metadata || {}), ...(args.metadata || {}), claimed_by: assignedAgent, claim_source: 'cstar-kernel-mcp' },
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
                    ...(bead.metadata || {}),
                    ...(args.metadata || {}),
                    resolved_by: 'cstar-kernel-mcp',
                    sterling_mandate: sterlingPatch,
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
                metadata: { ...(bead.metadata || {}), ...(args.metadata || {}), blocked_by: 'cstar-kernel-mcp' },
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
        return textResponse({ error: error.message }, true);
    }
}
