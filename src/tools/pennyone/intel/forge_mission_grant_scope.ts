import { createHash } from 'node:crypto';
import path from 'node:path';
import type Database from 'better-sqlite3';

import type {
    ForgeMissionGrantEnvelope,
    HallForgeMissionGrantRecord,
    HallForgeRequestRecord,
    MaterializeForgeMissionGrantInput,
} from '../../../types/forge.js';
import { FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS }
    from '../../../types/forge.js';
import { readForgeMissionGrantEnvelope } from './forge_mission_grant_envelope.js';
import { assertAutonomousDispatchPolicyGrantLineage }
    from '../../cstar-kernel-mcp/tools/forge_autonomous_policy_contract.js';

interface CanonicalGrantRequest {
    schema: 'cstar.forge_request.v3';
    target_paths: string[];
    required_output_paths: string[];
    requested_actions: string[];
    prohibited_actions: string[];
    adapter_ref: string | null;
    write_capability: string | null;
    retry_budget: number;
    max_attempts: number;
    spend_policy: {
        mode: string;
        max_retries: number;
        live_source_allowed: boolean;
    };
}

function stableValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, stableValue(item)]));
    }
    return value;
}

function sha256(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex');
}

function parseStringArray(value: string, code: string): string[] {
    try {
        const parsed = JSON.parse(value) as unknown;
        if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
            throw new Error(code);
        }
        return parsed;
    } catch {
        throw new Error(code);
    }
}

export function parseCanonicalGrantRequest(
    request: HallForgeRequestRecord,
): CanonicalGrantRequest {
    try {
        const parsed = JSON.parse(request.request_summary_json) as CanonicalGrantRequest;
        if (parsed.schema !== 'cstar.forge_request.v3'
            || !Array.isArray(parsed.target_paths)
            || !Array.isArray(parsed.required_output_paths)
            || !Array.isArray(parsed.requested_actions)
            || !Array.isArray(parsed.prohibited_actions)
            || sha256(parsed) !== request.request_sha256
            || sha256(parsed.target_paths) !== request.target_paths_sha256
            || Number(parsed.spend_policy.live_source_allowed) !== request.live_source_allowed
            || parsed.max_attempts !== request.max_attempts
            || parsed.adapter_ref !== request.adapter_ref
            || parsed.write_capability !== request.write_capability) {
            throw new Error('forge_mission_grant_request_summary_invalid');
        }
        return parsed;
    } catch {
        throw new Error('forge_mission_grant_request_summary_invalid');
    }
}

function pathIsWithin(candidate: string, parent: string): boolean {
    const relative = path.relative(parent, candidate);
    return relative === '' || (
        relative !== '..'
        && !relative.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relative)
    );
}

function arraySubset(actual: string[], allowed: string[]): boolean {
    const allowedSet = new Set(allowed);
    return actual.every((value) => allowedSet.has(value));
}

function targetsNarrow(actual: string[], allowed: string[]): boolean {
    return actual.every((candidate) =>
        allowed.some((parent) => pathIsWithin(candidate, parent)));
}

function readBeadMetadata(
    db: Database.Database,
    beadId: string,
): { status: string; repo_id: string; target_ref: string; metadata: Record<string, unknown> } {
    const row = db.prepare(
        'SELECT repo_id, status, target_ref, metadata_json FROM hall_beads WHERE bead_id = ?',
    ).get(beadId) as Record<string, unknown> | undefined;
    if (!row || typeof row.metadata_json !== 'string') {
        throw new Error('forge_mission_grant_child_not_found');
    }
    try {
        const metadata = JSON.parse(row.metadata_json) as unknown;
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
            throw new Error('forge_mission_grant_child_metadata_invalid');
        }
        return {
            status: String(row.status),
            repo_id: String(row.repo_id),
            target_ref: String(row.target_ref),
            metadata: metadata as Record<string, unknown>,
        };
    } catch {
        throw new Error('forge_mission_grant_child_metadata_invalid');
    }
}

export function isForgeMissionGrantCandidate(
    db: Database.Database,
    request: HallForgeRequestRecord,
): boolean {
    const child = db.prepare(
        'SELECT metadata_json FROM hall_beads WHERE bead_id = ?',
    ).get(request.bead_id) as { metadata_json?: unknown } | undefined;
    if (typeof child?.metadata_json !== 'string') return false;
    try {
        const metadata = JSON.parse(child.metadata_json) as Record<string, unknown>;
        if (typeof metadata.parent_bead_id !== 'string') return false;
        const parent = db.prepare(
            'SELECT metadata_json FROM hall_beads WHERE bead_id = ?',
        ).get(metadata.parent_bead_id) as { metadata_json?: unknown } | undefined;
        if (typeof parent?.metadata_json !== 'string') return true;
        const parentMetadata = JSON.parse(parent.metadata_json) as Record<string, unknown>;
        return parentMetadata.schema === 'cstar.set_manifest.v1'
            || parentMetadata.operator_set === true;
    } catch {
        return true;
    }
}

export function assertForgeMissionGrantLineage(
    db: Database.Database,
    grant: HallForgeMissionGrantRecord,
    request: HallForgeRequestRecord,
): void {
    if (assertAutonomousDispatchPolicyGrantLineage(db, grant, request)) return;
    const child = readBeadMetadata(db, request.bead_id);
    const allowedChildren = parseStringArray(
        grant.allowed_child_lineage_json,
        'forge_mission_grant_lineage_invalid',
    );
    const order = allowedChildren.indexOf(request.bead_id) + 1;
    if (child.status !== 'IN_PROGRESS' || child.repo_id !== grant.repo_id
        || request.requester_thread_id !== grant.root_thread_id
        || child.metadata.parent_bead_id !== grant.root_bead_id
        || child.metadata.design_sha256 !== grant.design_sha256
        || order < 1 || child.metadata.order !== order
        || child.target_ref !== `${grant.mission_decision_id}:batch-${order}`
        || request.decision_id !== child.target_ref) {
        throw new Error('forge_mission_grant_lineage_widened');
    }
    const parent = readBeadMetadata(db, grant.root_bead_id);
    const envelope = readForgeMissionGrantEnvelope(parent.metadata).envelope;
    if (parent.status !== 'IN_PROGRESS' || parent.repo_id !== grant.repo_id
        || parent.metadata.schema !== 'cstar.set_manifest.v1'
        || parent.metadata.operator_set !== true
        || parent.metadata.decision_id !== grant.mission_decision_id
        || parent.metadata.design_sha256 !== grant.design_sha256
        || JSON.stringify(parent.metadata.batch_order) !== JSON.stringify(allowedChildren)
        || JSON.stringify(envelope.allowed_targets) !== grant.allowed_targets_json
        || JSON.stringify(envelope.allowed_outputs) !== grant.allowed_outputs_json
        || JSON.stringify(envelope.allowed_actions) !== grant.allowed_actions_json
        || JSON.stringify(envelope.prohibited_actions) !== grant.prohibited_actions_json
        || envelope.adapter_ref !== grant.adapter_ref
        || envelope.write_capability !== grant.write_capability
        || envelope.total_provider_attempt_ceiling !== grant.total_provider_attempt_ceiling
        || envelope.retry_derived_iteration_ceiling !== grant.retry_derived_iteration_ceiling
        || envelope.paid_attempt_ceiling !== grant.paid_attempt_ceiling) {
        throw new Error('forge_mission_grant_design_or_scope_drift');
    }
}

export function assertForgeMissionGrantScope(
    db: Database.Database,
    grant: HallForgeMissionGrantRecord,
    request: HallForgeRequestRecord,
): CanonicalGrantRequest {
    assertForgeMissionGrantLineage(db, grant, request);
    const canonical = parseCanonicalGrantRequest(request);
    const allowedTargets = parseStringArray(
        grant.allowed_targets_json,
        'forge_mission_grant_targets_invalid',
    );
    const allowedOutputs = parseStringArray(
        grant.allowed_outputs_json,
        'forge_mission_grant_outputs_invalid',
    );
    const allowedActions = parseStringArray(
        grant.allowed_actions_json,
        'forge_mission_grant_actions_invalid',
    );
    const requiredProhibitions = parseStringArray(
        grant.prohibited_actions_json,
        'forge_mission_grant_prohibitions_invalid',
    );
    const requiredSet = new Set(requiredProhibitions);
    if (!targetsNarrow(canonical.target_paths, allowedTargets)
        || !targetsNarrow(canonical.required_output_paths, allowedOutputs)
        || !arraySubset(canonical.requested_actions, allowedActions)
        || !arraySubset(requiredProhibitions, canonical.prohibited_actions)
        || FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS.some(
            (action) => !requiredSet.has(action),
        )
        || canonical.adapter_ref !== grant.adapter_ref
        || canonical.write_capability !== grant.write_capability
        || request.adapter_ref !== grant.adapter_ref
        || request.write_capability !== grant.write_capability
        || canonical.spend_policy.mode !== 'live_authorized'
        || canonical.spend_policy.live_source_allowed
        || canonical.spend_policy.max_retries > grant.retry_derived_iteration_ceiling
        || canonical.retry_budget > grant.retry_derived_iteration_ceiling
        || canonical.max_attempts > grant.total_provider_attempt_ceiling) {
        throw new Error('forge_mission_grant_request_scope_widened');
    }
    return canonical;
}

export function missionGrantInputFromSetAuthority(
    request: HallForgeRequestRecord,
    authority: {
        projection: {
            parent: {
                repo_id: string;
                decision_id: string;
                bead_id: string;
                batch_order: string[];
                design_sha256: string;
                mission_grant_envelope: ForgeMissionGrantEnvelope;
            };
        };
        original_identity: { thread_id: string; turn_id: string };
        intent: {
            session_record_sha256: string;
            session_record_set_sha256: string;
            session_record_count: number;
            authorized_at: number;
            expires_at: number;
        };
    },
): MaterializeForgeMissionGrantInput {
    const parent = authority.projection.parent;
    const envelope = parent.mission_grant_envelope;
    if (request.repo_id !== parent.repo_id) {
        throw new Error('forge_mission_grant_repository_mismatch');
    }
    return {
        repo_id: parent.repo_id,
        mission_decision_id: parent.decision_id,
        root_bead_id: parent.bead_id,
        allowed_child_lineage: parent.batch_order,
        root_thread_id: authority.original_identity.thread_id,
        set_turn_id: authority.original_identity.turn_id,
        set_record_sha256: authority.intent.session_record_sha256,
        set_record_set_sha256: authority.intent.session_record_set_sha256,
        set_record_count: authority.intent.session_record_count,
        design_sha256: parent.design_sha256,
        allowed_targets: envelope.allowed_targets,
        allowed_outputs: envelope.allowed_outputs,
        allowed_actions: envelope.allowed_actions,
        prohibited_actions: envelope.prohibited_actions,
        adapter_ref: envelope.adapter_ref,
        write_capability: envelope.write_capability,
        total_provider_attempt_ceiling: envelope.total_provider_attempt_ceiling,
        retry_derived_iteration_ceiling: envelope.retry_derived_iteration_ceiling,
        paid_attempt_ceiling: envelope.paid_attempt_ceiling,
        authorized_at: authority.intent.authorized_at,
        expires_at: authority.intent.expires_at,
    };
}

export function missionGrantInputFromRecord(
    grant: HallForgeMissionGrantRecord,
): MaterializeForgeMissionGrantInput {
    return {
        repo_id: grant.repo_id,
        mission_decision_id: grant.mission_decision_id,
        root_bead_id: grant.root_bead_id,
        allowed_child_lineage: parseStringArray(
            grant.allowed_child_lineage_json,
            'forge_mission_grant_lineage_invalid',
        ),
        root_thread_id: grant.root_thread_id,
        set_turn_id: grant.set_turn_id,
        set_record_sha256: grant.set_record_sha256,
        set_record_set_sha256: grant.set_record_set_sha256,
        set_record_count: grant.set_record_count,
        design_sha256: grant.design_sha256,
        allowed_targets: parseStringArray(
            grant.allowed_targets_json,
            'forge_mission_grant_targets_invalid',
        ),
        allowed_outputs: parseStringArray(
            grant.allowed_outputs_json,
            'forge_mission_grant_outputs_invalid',
        ),
        allowed_actions: parseStringArray(
            grant.allowed_actions_json,
            'forge_mission_grant_actions_invalid',
        ),
        prohibited_actions: parseStringArray(
            grant.prohibited_actions_json,
            'forge_mission_grant_prohibitions_invalid',
        ),
        adapter_ref: grant.adapter_ref,
        write_capability: grant.write_capability,
        total_provider_attempt_ceiling: grant.total_provider_attempt_ceiling,
        retry_derived_iteration_ceiling: grant.retry_derived_iteration_ceiling,
        paid_attempt_ceiling: grant.paid_attempt_ceiling,
        authorized_at: grant.authorized_at,
        expires_at: grant.expires_at,
    };
}
