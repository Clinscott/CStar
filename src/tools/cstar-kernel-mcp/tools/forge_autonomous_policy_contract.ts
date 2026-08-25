import { createHash } from 'node:crypto';
import path from 'node:path';
import type Database from 'better-sqlite3';

import type { HallForgeMissionGrantRecord, HallForgeRequestRecord } from '../../../types/forge.js';
import { FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS } from '../../../types/forge.js';
import {
    bindForgeChildRequestTemplate,
    canonicalForgeChildRequestTemplate,
    type ForgeChildRequestTemplateV1,
} from '../contracts/forge_child_request_template.js';
import {
    hashAuguryMissionValue,
    stableAuguryMissionJson,
} from '../contracts/augury_mission.js';
import {
    hashCanonicalForgeRequest,
    hashForgeTargetPaths,
    stableJson,
    type CanonicalForgeRequest,
} from './forge_request_contract.js';

export const AUTONOMOUS_DISPATCH_POLICY_SCHEMA =
    'cstar.autonomous_hermes_dispatch_policy.v1' as const;
export const AUTONOMOUS_DISPATCH_CHILD_SCHEMA =
    'cstar.autonomous_hermes_dispatch_child.v1' as const;

interface Identity {
    source: 'codex_request_meta';
    thread_id: string;
    turn_id: string;
    turn_record_set_sha256: string;
}

interface BeadRow {
    bead_id: string;
    repo_id: string;
    target_ref: string;
    target_path: string | null;
    status: string;
    metadata: Record<string, unknown>;
    created_at: number;
    updated_at: number;
}

export interface AutonomousDispatchPolicyBinding {
    parent: {
        bead_id: string;
        repo_id: string;
        decision_id: string;
        code_root: string;
        policy_sha256: string;
        identity: Identity;
        issued_at: number;
        expires_at: number;
        provider_attempt_ceiling: number;
        prohibited_actions: string[];
    };
    child: {
        bead_id: string;
        decision_id: string;
        scope: string;
        target_paths: string[];
        adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter';
        write_capability: 'project_files';
        provider_profile: 'hermes:minimax';
        source_callback_thread_id: string;
        state_update_thread_id: string | null;
        dispatch_surface_ref: string | null;
        template: ForgeChildRequestTemplateV1;
    };
}

const SHA256 = /^[a-f0-9]{64}$/;
const REFERENCE = /^[^\u0000-\u001f\u007f]{1,1024}$/u;
const PARENT_KEYS = [
    'source', 'schema', 'version', 'policy_id', 'policy_sha256', 'code_root',
    'allowed_lanes', 'provider_profiles', 'prohibited_actions',
    'provider_attempt_ceiling', 'max_child_attempts', 'max_child_retries',
    'live_source_allowed', 'issued_at', 'expires_at', 'mutation_request_identity',
    'authority_tier', 'archived',
] as const;
const CHILD_KEYS = [
    'source', 'schema', 'version', 'child_sha256', 'parent_bead_id', 'policy_sha256',
    'decision_id', 'lane', 'scope', 'target_paths', 'adapter_ref', 'write_capability',
    'provider_profile', 'source_callback_thread_id', 'state_update_thread_id',
    'dispatch_surface_ref', 'forge_child_request_template',
    'forge_child_request_template_sha256', 'forge_child_request_template_bytes',
    'mutation_request_identity', 'authority_tier', 'archived',
] as const;
const PARENT_CREATION_KEYS = PARENT_KEYS.filter((key) => ![
    'policy_sha256', 'authority_tier', 'archived', 'issued_at',
].includes(key));
const CHILD_CREATION_KEYS = CHILD_KEYS.filter((key) => ![
    'child_sha256', 'policy_sha256',
    'forge_child_request_template_sha256', 'forge_child_request_template_bytes',
    'authority_tier', 'archived',
].includes(key));

function fail(code: string): never { throw new Error(code); }

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
        fail(code);
    }
}

function reference(value: unknown, code: string): string {
    if (typeof value !== 'string' || value !== value.trim() || !REFERENCE.test(value)) fail(code);
    return value;
}

function hash(value: unknown): string {
    return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

function hashValue(value: unknown, code: string): string {
    if (typeof value !== 'string' || !SHA256.test(value)) fail(code);
    return value;
}

function integer(value: unknown, code: string): number {
    if (!Number.isSafeInteger(value)) fail(code);
    return Number(value);
}

function exactStrings(value: unknown, code: string, minimum = 1): string[] {
    if (!Array.isArray(value) || value.length < minimum) fail(code);
    const values = value.map((item) => reference(item, code));
    const normalized = [...new Set(values)].sort();
    if (JSON.stringify(values) !== JSON.stringify(normalized)) fail(code);
    return values;
}

function identity(value: unknown, code: string): Identity {
    if (!isRecord(value)) fail(code);
    exactKeys(value, ['source', 'thread_id', 'turn_id', 'turn_record_set_sha256'], code);
    if (value.source !== 'codex_request_meta') fail(code);
    return {
        source: 'codex_request_meta',
        thread_id: reference(value.thread_id, code),
        turn_id: reference(value.turn_id, code),
        turn_record_set_sha256: hashValue(value.turn_record_set_sha256, code),
    };
}

function bead(db: Database.Database, beadId: string, code: string): BeadRow {
    const row = db.prepare(`
        SELECT bead_id, repo_id, target_ref, target_path, status, metadata_json, created_at, updated_at
        FROM hall_beads WHERE bead_id = ? LIMIT 1
    `).get(beadId) as Record<string, unknown> | undefined;
    if (!row || typeof row.metadata_json !== 'string') fail(code);
    let metadata: unknown;
    try { metadata = JSON.parse(row.metadata_json); } catch { fail(code); }
    if (!isRecord(metadata)) fail(code);
    return {
        bead_id: String(row.bead_id), repo_id: String(row.repo_id),
        target_ref: String(row.target_ref ?? ''),
        target_path: typeof row.target_path === 'string' ? row.target_path : null,
        status: String(row.status), metadata, created_at: Number(row.created_at),
        updated_at: Number(row.updated_at),
    };
}

function sealedHashPayload(
    value: Record<string, unknown>, keys: readonly string[], selfHash: string,
): Record<string, unknown> {
    return Object.fromEntries(keys.filter((key) => key !== selfHash).map((key) => [key, value[key]]));
}

export function hashAutonomousDispatchPolicy(value: Record<string, unknown>): string {
    return hash(sealedHashPayload(value, PARENT_KEYS, 'policy_sha256'));
}

export function hashAutonomousDispatchChild(value: Record<string, unknown>): string {
    return hash(sealedHashPayload(value, CHILD_KEYS, 'child_sha256'));
}

export function isAutonomousDispatchPolicyMetadata(value: unknown): boolean {
    return isRecord(value) && (value.schema === AUTONOMOUS_DISPATCH_POLICY_SCHEMA
        || value.schema === AUTONOMOUS_DISPATCH_CHILD_SCHEMA);
}

function parseParent(row: BeadRow, now: number): AutonomousDispatchPolicyBinding['parent'] {
    const value = row.metadata;
    exactKeys(value, PARENT_KEYS, 'forge_autonomous_policy_parent_metadata_invalid');
    const issuedAt = integer(value.issued_at, 'forge_autonomous_policy_parent_metadata_invalid');
    const expiresAt = integer(value.expires_at, 'forge_autonomous_policy_parent_metadata_invalid');
    if (value.source !== 'cstar-kernel-mcp' || value.schema !== AUTONOMOUS_DISPATCH_POLICY_SCHEMA
        || value.version !== 1 || value.authority_tier !== 'reference' || value.archived !== false
        || row.status !== 'IN_PROGRESS' || row.created_at !== row.updated_at || issuedAt !== row.created_at) {
        fail('forge_autonomous_policy_parent_immutable_invalid');
    }
    const policyId = reference(value.policy_id, 'forge_autonomous_policy_parent_metadata_invalid');
    const codeRoot = reference(value.code_root, 'forge_autonomous_policy_parent_metadata_invalid');
    const ceiling = integer(value.provider_attempt_ceiling, 'forge_autonomous_policy_parent_metadata_invalid');
    const lanes = exactStrings(value.allowed_lanes, 'forge_autonomous_policy_parent_metadata_invalid');
    const profiles = exactStrings(value.provider_profiles, 'forge_autonomous_policy_parent_metadata_invalid');
    const prohibited = exactStrings(value.prohibited_actions, 'forge_autonomous_policy_parent_metadata_invalid');
    if (policyId !== row.target_ref || codeRoot !== path.resolve(codeRoot)
        || row.target_path !== codeRoot || !lanes.includes('forge')
        || lanes.some((lane) => lane !== 'forge' && lane !== 'researcher')
        || profiles.some((profile) => profile !== 'hermes:minimax' && profile !== 'hermes:x-grok')
        || value.max_child_attempts !== 1 || value.max_child_retries !== 0
        || value.live_source_allowed !== false || ceiling < 1 || ceiling > 4_096
        || expiresAt <= now || expiresAt <= issuedAt
        || expiresAt - issuedAt > 366 * 24 * 60 * 60 * 1_000
        || FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS.some((action) => !prohibited.includes(action))
        || hashValue(value.policy_sha256, 'forge_autonomous_policy_parent_metadata_invalid')
            !== hashAutonomousDispatchPolicy(value)) {
        fail('forge_autonomous_policy_parent_scope_invalid');
    }
    return {
        bead_id: row.bead_id, repo_id: row.repo_id, decision_id: policyId, code_root: codeRoot,
        policy_sha256: String(value.policy_sha256),
        identity: identity(value.mutation_request_identity, 'forge_autonomous_policy_parent_identity_invalid'),
        issued_at: issuedAt, expires_at: expiresAt, provider_attempt_ceiling: ceiling,
        prohibited_actions: prohibited,
    };
}

function parseChild(
    db: Database.Database,
    row: BeadRow,
    parent: AutonomousDispatchPolicyBinding['parent'],
    expectedCandidates = 1,
): AutonomousDispatchPolicyBinding['child'] {
    const value = row.metadata;
    exactKeys(value, CHILD_KEYS, 'forge_autonomous_policy_child_metadata_invalid');
    if (value.source !== 'cstar-kernel-mcp' || value.schema !== AUTONOMOUS_DISPATCH_CHILD_SCHEMA
        || value.version !== 1 || value.authority_tier !== 'reference' || value.archived !== false
        || row.status !== 'IN_PROGRESS' || row.created_at !== row.updated_at
        || value.parent_bead_id !== parent.bead_id || value.policy_sha256 !== parent.policy_sha256
        || value.lane !== 'forge' || value.adapter_ref !== 'cstar-forge-hermes-minimax-worker-adapter'
        || value.write_capability !== 'project_files' || value.provider_profile !== 'hermes:minimax'
        || hashValue(value.child_sha256, 'forge_autonomous_policy_child_metadata_invalid')
            !== hashAutonomousDispatchChild(value)) {
        fail('forge_autonomous_policy_child_immutable_invalid');
    }
    const childIdentity = identity(value.mutation_request_identity,
        'forge_autonomous_policy_child_identity_invalid');
    const decisionId = reference(value.decision_id, 'forge_autonomous_policy_child_metadata_invalid');
    const scope = reference(value.scope, 'forge_autonomous_policy_child_metadata_invalid');
    const targets = exactStrings(value.target_paths, 'forge_autonomous_policy_child_metadata_invalid');
    if (row.repo_id !== parent.repo_id || row.target_ref !== decisionId
        || childIdentity.thread_id !== parent.identity.thread_id || parent.issued_at > row.created_at
        || parent.code_root !== path.resolve(parent.code_root)
        || targets.some((target) => !containedRelativeTarget(parent.code_root, target))) {
        fail('forge_autonomous_policy_child_lineage_invalid');
    }
    const binding = bindForgeChildRequestTemplate({
        value: value.forge_child_request_template,
        repository_root: parent.code_root,
        plan_target_paths: targets,
        supplied_sha256: value.forge_child_request_template_sha256,
        supplied_bytes: value.forge_child_request_template_bytes,
    });
    const sourceCallback = reference(value.source_callback_thread_id,
        'forge_autonomous_policy_child_metadata_invalid');
    const stateUpdate = value.state_update_thread_id === null
        ? null : reference(value.state_update_thread_id, 'forge_autonomous_policy_child_metadata_invalid');
    const surface = value.dispatch_surface_ref === null
        ? null : reference(value.dispatch_surface_ref, 'forge_autonomous_policy_child_metadata_invalid');
    const duplicateRow = (db.prepare(`
        SELECT COUNT(*) AS count FROM hall_beads
        WHERE repo_id = ? AND json_valid(metadata_json) = 1
          AND json_extract(metadata_json, '$.schema') = ?
          AND json_extract(metadata_json, '$.parent_bead_id') = ?
          AND json_extract(metadata_json, '$.decision_id') = ?
    `).get(row.repo_id, AUTONOMOUS_DISPATCH_CHILD_SCHEMA, parent.bead_id, decisionId)) as { count?: number };
    const duplicate = Number(duplicateRow.count ?? 0);
    if (duplicate !== expectedCandidates) fail('forge_autonomous_policy_child_candidate_ambiguous');
    return {
        bead_id: row.bead_id, decision_id: decisionId, scope, target_paths: targets,
        adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter', write_capability: 'project_files',
        provider_profile: 'hermes:minimax', source_callback_thread_id: sourceCallback,
        state_update_thread_id: stateUpdate, dispatch_surface_ref: surface, template: binding.template,
    };
}

export function bindAutonomousDispatchPolicyCreationMetadata(input: {
    db: Database.Database;
    bead_id: string;
    repo_id: string;
    target_ref: string;
    target_path: string | null;
    status: string;
    now: number;
    metadata: Record<string, unknown>;
}): Record<string, unknown> {
    if (!isAutonomousDispatchPolicyMetadata(input.metadata)) return input.metadata;
    if (input.metadata.schema === AUTONOMOUS_DISPATCH_POLICY_SCHEMA) {
        exactKeys(input.metadata, PARENT_CREATION_KEYS,
            'forge_autonomous_policy_parent_creation_metadata_invalid');
        const metadata = {
            ...input.metadata, authority_tier: 'reference', archived: false,
            issued_at: input.now, policy_sha256: '',
        };
        metadata.policy_sha256 = hashAutonomousDispatchPolicy(metadata);
        parseParent({
            bead_id: input.bead_id, repo_id: input.repo_id, target_ref: input.target_ref,
            target_path: input.target_path, status: input.status, metadata,
            created_at: input.now, updated_at: input.now,
        }, input.now);
        return metadata;
    }
    exactKeys(input.metadata, CHILD_CREATION_KEYS,
        'forge_autonomous_policy_child_creation_metadata_invalid');
    const parentId = reference(input.metadata.parent_bead_id,
        'forge_autonomous_policy_parent_reference_invalid');
    const parent = parseParent(bead(input.db, parentId,
        'forge_autonomous_policy_parent_not_found'), input.now);
    const derivedMetadata: Record<string, unknown> = {
        ...input.metadata,
        policy_sha256: parent.policy_sha256,
    };
    const targets = exactStrings(derivedMetadata.target_paths,
        'forge_autonomous_policy_child_metadata_invalid');
    const template = canonicalForgeChildRequestTemplate({
        value: derivedMetadata.forge_child_request_template,
        repository_root: parent.code_root,
        plan_target_paths: targets,
    });
    const metadata = {
        ...derivedMetadata,
        forge_child_request_template: template,
        forge_child_request_template_sha256: hashAuguryMissionValue(template),
        forge_child_request_template_bytes: Buffer.byteLength(stableAuguryMissionJson(template), 'utf8'),
        authority_tier: 'reference', archived: false, child_sha256: '',
    };
    metadata.child_sha256 = hashAutonomousDispatchChild(metadata);
    parseChild(input.db, {
        bead_id: input.bead_id, repo_id: input.repo_id, target_ref: input.target_ref,
        target_path: input.target_path, status: input.status, metadata,
        created_at: input.now, updated_at: input.now,
    }, parent, 0);
    return metadata;
}

function parseCanonical(request: HallForgeRequestRecord): CanonicalForgeRequest {
    let canonical: CanonicalForgeRequest;
    try { canonical = JSON.parse(request.request_summary_json) as CanonicalForgeRequest; } catch {
        fail('forge_autonomous_policy_request_summary_invalid');
    }
    if (canonical.schema !== 'cstar.forge_request.v3'
        || hashCanonicalForgeRequest(canonical) !== request.request_sha256
        || hashForgeTargetPaths(canonical) !== request.target_paths_sha256) {
        fail('forge_autonomous_policy_request_summary_invalid');
    }
    return canonical;
}

function absolute(root: string, values: string[]): string[] {
    return values.map((value) => path.resolve(root, value)).sort();
}

function containedRelativeTarget(root: string, value: string): boolean {
    if (path.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes('\\')) return false;
    const segments = value.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return false;
    const relative = path.relative(root, path.resolve(root, value));
    return relative !== '' && !path.isAbsolute(relative)
        && relative !== '..' && !relative.startsWith(`..${path.sep}`);
}

function equal(left: unknown, right: unknown): boolean {
    return stableJson(left) === stableJson(right);
}

export function resolveAutonomousDispatchPolicyBinding(
    db: Database.Database,
    request: HallForgeRequestRecord,
    now = Date.now(),
): AutonomousDispatchPolicyBinding {
    const child = bead(db, request.bead_id, 'forge_autonomous_policy_child_not_found');
    const parentId = isRecord(child.metadata) ? child.metadata.parent_bead_id : undefined;
    const parent = bead(db, reference(parentId, 'forge_autonomous_policy_parent_reference_invalid'),
        'forge_autonomous_policy_parent_not_found');
    const policy = parseParent(parent, now);
    const parsedChild = parseChild(db, child, policy);
    if (request.repo_id !== policy.repo_id || request.bead_id !== parsedChild.bead_id
        || request.decision_id !== parsedChild.decision_id || request.requester_thread_id !== policy.identity.thread_id
        || child.updated_at > request.created_at) {
        fail('forge_autonomous_policy_request_lineage_invalid');
    }
    return { parent: policy, child: parsedChild };
}

export function isAutonomousDispatchPolicyCandidate(
    db: Database.Database,
    request: HallForgeRequestRecord,
): boolean {
    try {
        const row = bead(db, request.bead_id, 'forge_autonomous_policy_child_not_found');
        return row.metadata.schema === AUTONOMOUS_DISPATCH_CHILD_SCHEMA;
    } catch {
        return false;
    }
}

export function assertAutonomousDispatchPolicyRequestScope(
    binding: AutonomousDispatchPolicyBinding,
    request: HallForgeRequestRecord,
): CanonicalForgeRequest {
    const canonical = parseCanonical(request);
    const template = binding.child.template;
    const expectedLocks = template.package_locks.map((lock) => ({
        path: path.resolve(binding.parent.code_root, lock.path), sha256: lock.sha256,
    })).sort((left, right) => left.path.localeCompare(right.path));
    const actualLocks = canonical.package_locks.map((lock) => ({
        path: path.resolve(binding.parent.code_root, lock.path), sha256: lock.sha256,
    })).sort((left, right) => left.path.localeCompare(right.path));
    const expectedMetrics = [...template.required_metrics]
        .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
    const actualMetrics = [...canonical.required_metrics]
        .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
    const actualArtifacts = [...canonical.artifact_expectations].sort();
    const required = new Set(binding.parent.prohibited_actions);
    if (!equal(canonical.target_paths, absolute(binding.parent.code_root, binding.child.target_paths))
        || !equal(canonical.required_output_paths, absolute(binding.parent.code_root, template.required_output_paths))
        || canonical.objective !== template.objective || canonical.prompt !== template.prompt
        || canonical.system_under_test !== template.system_under_test
        || canonical.scope !== binding.child.scope || canonical.authority_lane !== template.authority_lane
        || !equal(actualMetrics, expectedMetrics)
        || !equal(actualArtifacts, [...template.artifact_expectations].sort())
        || !equal(canonical.requested_actions, template.requested_actions)
        || !equal(canonical.prohibited_actions, binding.parent.prohibited_actions)
        || !equal(actualLocks, expectedLocks)
        || canonical.state_update_thread_id !== binding.child.state_update_thread_id
        || canonical.source_callback_thread_id !== binding.child.source_callback_thread_id
        || canonical.callback_contract.expected_packet !== template.callback_expected_packet
        || canonical.callback_contract.callback_required !== true
        || canonical.callback_contract.callback_thread_id !== binding.child.source_callback_thread_id
        || canonical.dispatch_surface_ref !== binding.child.dispatch_surface_ref
        || canonical.adapter_ref !== binding.child.adapter_ref
        || canonical.write_capability !== binding.child.write_capability
        || canonical.max_attempts !== 1 || canonical.retry_budget !== 0
        || canonical.spend_policy.mode !== 'live_authorized'
        || canonical.spend_policy.max_retries !== 0 || canonical.spend_policy.live_source_allowed
        || canonical.fixture_policy !== 'synthetic_only'
        || FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS.some((action) => !required.has(action))) {
        fail('forge_autonomous_policy_request_scope_widened');
    }
    return canonical;
}

export function assertAutonomousDispatchPolicyGrantLineage(
    db: Database.Database,
    grant: HallForgeMissionGrantRecord,
    request: HallForgeRequestRecord,
): AutonomousDispatchPolicyBinding | null {
    const child = bead(db, request.bead_id, 'forge_autonomous_policy_child_not_found');
    if (child.metadata.schema !== AUTONOMOUS_DISPATCH_CHILD_SCHEMA) return null;
    const binding = resolveAutonomousDispatchPolicyBinding(db, request);
    const expected = {
        mission_decision_id: binding.child.decision_id,
        root_bead_id: binding.parent.bead_id,
        allowed_child_lineage_json: stableJson([binding.child.bead_id]),
        root_thread_id: binding.parent.identity.thread_id,
        set_turn_id: binding.parent.identity.turn_id,
        design_sha256: binding.parent.policy_sha256,
        allowed_targets_json: stableJson(absolute(binding.parent.code_root, binding.child.target_paths)),
        allowed_outputs_json: stableJson(absolute(binding.parent.code_root,
            binding.child.template.required_output_paths)),
        allowed_actions_json: stableJson(binding.child.template.requested_actions),
        prohibited_actions_json: stableJson(binding.parent.prohibited_actions),
        adapter_ref: binding.child.adapter_ref,
        write_capability: binding.child.write_capability,
        total_provider_attempt_ceiling: 1,
        retry_derived_iteration_ceiling: 0,
        paid_attempt_ceiling: 1,
        authorized_at: binding.parent.issued_at,
        expires_at: binding.parent.expires_at,
    };
    if (grant.repo_id !== binding.parent.repo_id
        || Object.entries(expected).some(([key, value]) => grant[key as keyof typeof grant] !== value)) {
        fail('forge_autonomous_policy_grant_lineage_invalid');
    }
    assertAutonomousDispatchPolicyRequestScope(binding, request);
    return binding;
}
