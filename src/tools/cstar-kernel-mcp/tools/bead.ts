import fs from 'node:fs';
import path from 'node:path';

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
import { resolveProspectiveRelativePathInside } from '../contracts/runtime.js';
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

const RESERVED_METADATA_KEYS = new Set([
    'source', 'repo_id', 'spoke_slug', 'spoke_id', 'spoke_root', 'spoke_trust_level', 'spoke_write_policy',
    'augury_contract', 'trace_contract', 'host_cli_context', 'host_context', 'trace_id', 'mission_id',
    'mission_bead_id', 'execution_bead_id', 'trace_scope', 'trace_weave_id', 'target_domain', 'requested_root',
    'planning_session_id', 'augury_designation_source', 'trace_designation_source', 'operator_authorization_ref',
    'lore_path', 'lore_absolute_path', 'design_doc_path', 'design_doc_absolute_path', 'extra_target_paths',
    'augury_block', 'reported_augury_block', 'reported_augury_block_authoritative',
]);

export function boundedBeadText(value: string | undefined, field: string, max = 4096): string | undefined {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > max || /[\0\r\n]/.test(trimmed)) throw new Error(`${field}_invalid`);
    return trimmed;
}

export function safeBeadMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!value) return {};
    const keys = Object.keys(value);
    if (keys.length > 50 || keys.some((key) => RESERVED_METADATA_KEYS.has(key))) {
        throw new Error('bead_metadata_contains_reserved_or_excessive_keys');
    }
    const encoded = JSON.stringify(value);
    if (encoded.length > 8 * 1024) throw new Error('bead_metadata_too_large');
    return JSON.parse(encoded) as Record<string, unknown>;
}

export function safeBeadChecker(value: string | undefined): string | undefined {
    const checker = boundedBeadText(value, 'checker_shell', 1024);
    if (!checker) return undefined;
    if (/[;&|><`$\\]/.test(checker) || /\$\(|\b(?:sudo|bash|sh|zsh|rm|curl|wget)\b/.test(checker)) {
        throw new Error('checker_shell_must_be_one_non_shell_command');
    }
    const executable = checker.split(/\s+/, 1)[0];
    if (!/^(?:node|npm|npx|python3|pytest|uv|ruff|tsc|cargo|go)$/.test(executable)) {
        throw new Error('checker_shell_executable_not_allowed');
    }
    const argv = checker.split(/\s+/);
    if (
        ((executable === 'node' || executable === 'python3')
            && argv.some((arg) => ['-e', '--eval', '-p', '--print', '-c'].includes(arg)))
        || (executable === 'npx' && !argv.includes('--no-install'))
        || (executable === 'npm' && argv.some((arg) => ['exec', 'x', 'install', 'add', 'publish'].includes(arg)))
    ) {
        throw new Error('checker_shell_inline_or_remote_execution_not_allowed');
    }
    return checker;
}

function safeBeadTarget(root: string, spokeRoot: string | undefined, value: string | undefined): string | undefined {
    const raw = boundedBeadText(value, 'target_path', 1024);
    if (!raw) return undefined;
    const authorityRoot = fs.realpathSync(spokeRoot ?? root);
    const candidate = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(authorityRoot, raw);
    const relative = path.relative(authorityRoot, candidate);
    if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        if (relative === '') return authorityRoot;
        throw new Error('bead_target_outside_authorized_root');
    }
    return resolveProspectiveRelativePathInside(authorityRoot, relative);
}

function rootForExistingBead(root: string, bead: SovereignBead): string {
    const spoke = database.listHallMountedSpokes(root).find((entry) => entry.repo_id === bead.repo_id);
    return spoke?.root_path ?? root;
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
            `Provide mandate_evidence with lore_paths + isolation_paths + a verified validation_id or receipt-backed warden_results, ` +
            `set mandate_exempt=true with exemption_reason, or override with force=true + force_reason.`,
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
            const beads = database.getHallBeads(root, args.statuses)
                .sort((left, right) => right.updated_at - left.updated_at);
            return textResponse({
                status: 'ok',
                action: 'list',
                count: Math.min(beads.length, limit),
                beads: beads.slice(0, limit).map(compactBead),
            });
        }

        if (args.action === 'create') {
            const rationale = boundedBeadText(requireString(args.rationale, 'rationale'), 'rationale')!;
            const anchor = resolveSpokeAnchor(args.spoke);
            const repoId = anchor.repoId || kernelRepoId;
            const beadId = args.bead_id?.trim() || generateBeadId(rationale);
            if (beadId.length > 240 || !/^[A-Za-z0-9._:-]+$/.test(beadId)) throw new Error('bead_id_invalid');
            const targetPath = safeBeadTarget(root, anchor.spoke?.root_path, args.target_path);
            const targetKind = args.target_kind || (targetPath ? 'FILE' : 'OTHER');
            const metadata = safeBeadMetadata(args.metadata);
            database.upsertHallBead({
                bead_id: beadId,
                repo_id: repoId,
                target_kind: targetKind,
                target_ref: boundedBeadText(args.target_ref, 'target_ref', 1024) || targetPath,
                target_path: targetPath,
                rationale,
                contract_refs: args.contract_refs || [],
                baseline_scores: {},
                acceptance_criteria: boundedBeadText(args.acceptance_criteria, 'acceptance_criteria'),
                checker_shell: safeBeadChecker(args.checker_shell),
                status: args.status || 'OPEN',
                assigned_agent: args.assigned_agent,
                source_kind: 'MCP',
                metadata: {
                    ...metadata,
                    ...(anchor.metadata || {}),
                    source: 'cstar-kernel-mcp',
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
        if (beadId.length > 240 || !/^[A-Za-z0-9._:-]+$/.test(beadId)) throw new Error('bead_id_invalid');
        const bead = database.getHallBead(beadId);
        if (!bead) return textResponse({ error: `Bead not found: ${beadId}` }, true);

        if (args.action === 'get') {
            return textResponse({ status: 'ok', action: 'get', bead: compactBead(bead) });
        }

        if (args.action === 'update_status') {
            const status = args.status || (() => { throw new Error('status is required.'); })();
            const metadata = safeBeadMetadata(args.metadata);
            const beadRoot = rootForExistingBead(root, bead);
            const sterlingPatch = status === 'RESOLVED' ? gateSterlingMandate(bead, args, root) : null;
            const resolvedValidationId = status === 'RESOLVED'
                ? requestedResolvedValidationId(args, bead)
                : resolvedValidationIdForBead(bead);
            const updated = upsertBeadFromExisting(bead, {
                status,
                checker_shell: args.checker_shell !== undefined ? safeBeadChecker(args.checker_shell) : bead.checker_shell,
                target_path: args.target_path !== undefined ? safeBeadTarget(root, beadRoot, args.target_path) : bead.target_path,
                target_ref: args.target_ref !== undefined ? boundedBeadText(args.target_ref, 'target_ref', 1024) : bead.target_ref,
                resolution_note: args.resolution_note ?? bead.resolution_note,
                resolved_validation_id: resolvedValidationId,
                triage_reason: args.triage_reason ?? bead.triage_reason,
                metadata: withResolvedValidationMetadata({
                    ...(bead.metadata || {}),
                    ...metadata,
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
            if (assignedAgent.length > 120 || /[\0\r\n]/.test(assignedAgent)) throw new Error('assigned_agent_invalid');
            const metadata = safeBeadMetadata(args.metadata);
            const updated = upsertBeadFromExisting(bead, {
                assigned_agent: assignedAgent,
                status: args.status || 'IN_PROGRESS',
                metadata: { ...(bead.metadata || {}), ...metadata, claimed_by: assignedAgent, claim_source: 'cstar-kernel-mcp' },
            });
            return textResponse({
                status: 'claimed',
                action: 'claim',
                mutation: mcpMutation('hall_bead_claim', beadId, 'Hall bead claim was persisted through the MCP write surface.'),
                bead: compactBead(updated),
            });
        }

        if (args.action === 'resolve') {
            const metadata = safeBeadMetadata(args.metadata);
            const sterlingPatch = gateSterlingMandate(bead, args, root);
            const resolvedValidationId = requestedResolvedValidationId(args, bead);
            const updated = upsertBeadFromExisting(bead, {
                status: 'RESOLVED',
                resolution_note: args.resolution_note || bead.resolution_note || 'Resolved through cstar-kernel MCP.',
                resolved_validation_id: resolvedValidationId,
                metadata: withResolvedValidationMetadata({
                    ...(bead.metadata || {}),
                    ...metadata,
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
            const metadata = safeBeadMetadata(args.metadata);
            const updated = upsertBeadFromExisting(bead, {
                status: 'BLOCKED',
                triage_reason: triageReason,
                resolution_note: args.resolution_note ?? bead.resolution_note,
                metadata: { ...(bead.metadata || {}), ...metadata, blocked_by: 'cstar-kernel-mcp' },
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
