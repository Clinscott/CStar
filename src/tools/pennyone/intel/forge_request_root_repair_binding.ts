import { createHash } from 'node:crypto';

import type Database from 'better-sqlite3';

import type {
    AuthorizeForgeRequestInput,
    HallForgeAuthorizationRecord,
    HallForgeRequestRecord,
    SaveForgeRequestInput,
} from '../../../types/forge.js';
import type { VerifiedCodexRequestIdentity } from '../../cstar-kernel-mcp/tools/operator_authorization.js';
import { classifyCodexSessionRecord } from '../../cstar-kernel-mcp/tools/codex_request_identity.js';
import { createCodexPlatformContextProjection, scanFixedCodexSession } from '../../cstar-kernel-mcp/tools/codex_session_authority_projection.js';
import { findCodexSessionFile, MAX_CODEX_SESSION_FILE_BYTES, resolveCodexSessionsRoot } from '../../cstar-kernel-mcp/tools/codex_session_locator.js';
import { isForgeAuthorityRevocation } from '../../cstar-kernel-mcp/tools/forge_revocation.js';
import { stableJson } from '../../cstar-kernel-mcp/tools/forge_request_contract.js';
import { ROOT_USER_FORGE_INTENT_PROFILE, type ForgeOperatorIntentAction } from './forge_authorization_policy.js';
import type { VerifiedForgeOperatorIntent } from '../../cstar-kernel-mcp/tools/forge_operator_intent_attestation.js';
import {
    FORGE_ROOT_REPAIR_BINDING_SCHEMA,
    FORGE_ROOT_REPAIR_BINDING_TABLE as TABLE,
    ensureForgeRootRepairBindingSchema,
} from './forge_request_root_repair_binding_schema.js';

export { FORGE_ROOT_REPAIR_BINDING_SCHEMA, ensureForgeRootRepairBindingSchema };
export const FORGE_ROOT_REPAIR_CONTINUATION_REF_PREFIX = 'cstar-forge-root-repair-continuation:';
const HASH = /^[a-f0-9]{64}$/;
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/u;
const NON_CONTINUATION_SIGNAL = /\b(?:instead|rather\s+than|switch(?:ing)?|different\s+(?:task|goal)|fork|branch\s+off)\b|^\s*(?:no|nope|nah|never\s+mind|not\s+(?:now|yet)|don't|do\s+not|never)\b/i;
const AFFIRMATIVE_REPAIR_CONTINUATION = /^\s*(?:(?:continue|resume)(?:\s+with)?\s+the\s+unchanged\s+repair|proceed\s+with\s+the\s+unchanged\s+repair)[.!]?\s*$/i;
const PROTECTED_CONTINUATION_TERM = /\b(?:authorized[_\s-]+source[_\s-]+collection|live[_\s-]+source|source[_\s-]+collection|git[_\s-]+(?:branch|commit|push|merge|pull[_\s-]+request)|\b(?:branch|commit|push|merge|install(?:ation)?|deploy(?:ment)?|restart|activat(?:e|ion)|secret(?:s)?|credential(?:s)?|token(?:s)?|direct[_\s-]+state|destructive|permission|process|service|steer(?:ing)?|locked[_\s-]+holdout|holdout|spend|production|network)\b|out[_\s-]+of[_\s-]+scope|scope[_\s-]+expansion|(?:expand|broaden|widen|add|include|extend|outside|extra|another)[^.!?]{0,32}\bscope\b)/i;
const PROTECTED_REQUESTED_ACTIONS = new Set([
    'authorized_source_collection',
    'git_branch', 'git_commit', 'git_push', 'git_merge', 'git_pull_request',
    'install', 'deploy', 'restart', 'activation', 'secret_config_mutation',
    'credential_mutation', 'token_mutation', 'direct_state_write',
    'destructive_cleanup', 'permission_change', 'process_control', 'service_control',
    'steering', 'locked_holdout', 'expanded_spend', 'production_claim',
    'out_of_scope_writes',
]);
interface BindingSource {
    request_id: string;
    repo_id: string;
    bead_id: string;
    decision_id: string;
    request_sha256: string;
    request_summary_json: string;
    target_paths_sha256: string;
    live_source_allowed: boolean | 0 | 1;
    max_attempts: number;
    requester_thread_id?: string;
    requester_turn_id?: string;
    requester_record_set_sha256?: string;
    authorization_profile?: string;
    adapter_ref?: string;
    write_capability?: string;
}
export interface ForgeRootRepairBinding {
    schema: typeof FORGE_ROOT_REPAIR_BINDING_SCHEMA;
    request_id: string;
    repo_id: string;
    bead_id: string;
    decision_id: string;
    request_sha256: string;
    target_paths_sha256: string;
    required_output_paths_sha256: string;
    requested_actions_sha256: string;
    prohibited_actions_sha256: string;
    package_locks_sha256: string;
    callback_contract_sha256: string;
    spend_policy_sha256: string;
    retry_budget: 0;
    max_attempts: 1;
    live_source_allowed: 0;
    adapter_ref: string | null;
    write_capability: 'project_files';
    action: ForgeOperatorIntentAction;
    repair_instruction_sha256: string;
    root_thread_id: string;
    root_turn_id: string;
    root_record_set_sha256: string;
    binding_sha256: string;
    created_at: number;
}
function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}
function digest(value: unknown): string {
    return sha256(stableJson(value));
}
function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function parseSummary(source: BindingSource): Record<string, unknown> {
    let parsed: unknown;
    try { parsed = JSON.parse(source.request_summary_json); } catch {
        throw new Error('forge_root_repair_request_summary_invalid');
    }
    if (!isRecord(parsed) || parsed.schema !== 'cstar.forge_request.v3') {
        throw new Error('forge_root_repair_request_schema_invalid');
    }
    return parsed;
}
function textField(summary: Record<string, unknown>, name: string): string {
    const value = summary[name];
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`forge_root_repair_${name}_invalid`);
    }
    return value;
}
function arrayField(summary: Record<string, unknown>, name: string): unknown[] {
    if (!Array.isArray(summary[name])) throw new Error(`forge_root_repair_${name}_invalid`);
    return summary[name] as unknown[];
}
function repairAction(summary: Record<string, unknown>): ForgeOperatorIntentAction | null {
    const text = `${String(summary.objective ?? '')}\n${String(summary.prompt ?? '')}`;
    const match = /^\s*(?:i\s+authorize\s+(?:you\s+)?(?:to\s+)?)?(build|implement|repair|fix)\b/i.exec(text);
    if (!match) return null;
    return match[1]!.toLowerCase() as ForgeOperatorIntentAction;
}
function bindingCore(source: BindingSource): Omit<ForgeRootRepairBinding, 'binding_sha256' | 'created_at'> | null {
    if (source.authorization_profile !== ROOT_USER_FORGE_INTENT_PROFILE) return null;
    if (!source.requester_thread_id || !source.requester_turn_id || !source.requester_record_set_sha256) {
        throw new Error('forge_root_repair_requester_lineage_invalid');
    }
    if (!HASH.test(source.request_sha256) || !HASH.test(source.target_paths_sha256)
        || !HASH.test(source.requester_record_set_sha256)) {
        throw new Error('forge_root_repair_request_hash_invalid');
    }
    const summary = parseSummary(source);
    const action = repairAction(summary);
    if (!action) return null;
    const spend = summary.spend_policy;
    const authority = summary.action_authority;
    const requested = arrayField(summary, 'requested_actions').map(String);
    const prohibited = arrayField(summary, 'prohibited_actions').map(String);
    const locks = arrayField(summary, 'package_locks');
    const outputs = arrayField(summary, 'required_output_paths');
    const callback = summary.callback_contract;
    if (!requested.includes('project_files') || source.write_capability !== 'project_files') return null;
    if (!isRecord(spend) || spend.mode !== 'live_authorized'
        || spend.max_retries !== 0 || spend.live_source_allowed !== false
        || summary.retry_budget !== 0 || summary.fixture_policy !== 'synthetic_only'
        || summary.max_attempts !== 1 || source.max_attempts !== 1
        || source.live_source_allowed !== false && source.live_source_allowed !== 0
        || !isRecord(authority) || authority.context_can_expand_actions !== false
        || requested.some((value) => PROTECTED_REQUESTED_ACTIONS.has(value))
        || requested.includes('authorized_source_collection')
        || !isRecord(callback) || callback.callback_required !== true
        || source.adapter_ref !== undefined && source.adapter_ref !== null) {
        throw new Error('forge_root_repair_request_policy_invalid');
    }
    const objective = textField(summary, 'objective');
    const scope = textField(summary, 'scope');
    const targetPaths = arrayField(summary, 'target_paths');
    const core = {
        schema: FORGE_ROOT_REPAIR_BINDING_SCHEMA,
        request_id: source.request_id,
        repo_id: source.repo_id,
        bead_id: source.bead_id,
        decision_id: source.decision_id,
        request_sha256: source.request_sha256,
        target_paths_sha256: source.target_paths_sha256,
        required_output_paths_sha256: digest(outputs),
        requested_actions_sha256: digest(requested),
        prohibited_actions_sha256: digest(prohibited),
        package_locks_sha256: digest(locks),
        callback_contract_sha256: digest(callback),
        spend_policy_sha256: digest(spend),
        retry_budget: 0 as const,
        max_attempts: 1 as const,
        live_source_allowed: 0 as const,
        adapter_ref: source.adapter_ref ?? null,
        write_capability: 'project_files' as const,
        action,
        repair_instruction_sha256: digest({ objective, prompt: summary.prompt ?? null, scope, target_paths: targetPaths }),
        root_thread_id: source.requester_thread_id,
        root_turn_id: source.requester_turn_id,
        root_record_set_sha256: source.requester_record_set_sha256,
    };
    if (sha256(source.request_summary_json) !== source.request_sha256) {
        throw new Error('forge_root_repair_request_summary_hash_mismatch');
    }
    return core;
}
function buildBinding(source: BindingSource, createdAt: number): ForgeRootRepairBinding | null {
    const core = bindingCore(source);
    if (!core) return null;
    return {
        ...core,
        binding_sha256: sha256(stableJson({
            domain: 'cstar.forge_request_root_repair_binding',
            ...core,
        })),
        created_at: createdAt,
    };
}
function sourceFromRequest(request: HallForgeRequestRecord): BindingSource {
    return {
        request_id: request.request_id,
        repo_id: request.repo_id,
        bead_id: request.bead_id,
        decision_id: request.decision_id,
        request_sha256: request.request_sha256,
        request_summary_json: request.request_summary_json,
        target_paths_sha256: request.target_paths_sha256,
        live_source_allowed: request.live_source_allowed,
        max_attempts: request.max_attempts,
        requester_thread_id: request.requester_thread_id,
        requester_turn_id: request.requester_turn_id,
        requester_record_set_sha256: request.requester_record_set_sha256,
        authorization_profile: request.authorization_profile,
        adapter_ref: request.adapter_ref,
        write_capability: request.write_capability,
    };
}
function sourceFromInput(input: SaveForgeRequestInput): BindingSource {
    return {
        request_id: input.request_id,
        repo_id: input.repo_id,
        bead_id: input.bead_id,
        decision_id: input.decision_id,
        request_sha256: input.request_sha256,
        request_summary_json: input.request_summary_json,
        target_paths_sha256: input.target_paths_sha256,
        live_source_allowed: input.live_source_allowed,
        max_attempts: input.max_attempts,
        requester_thread_id: input.requester_thread_id,
        requester_turn_id: input.requester_turn_id,
        requester_record_set_sha256: input.requester_record_set_sha256,
        authorization_profile: input.authorization_profile,
        adapter_ref: input.adapter_ref,
        write_capability: input.write_capability,
    };
}
export function getForgeRootRepairBinding(
    db: Database.Database,
    requestId: string,
): ForgeRootRepairBinding | null {
    if (!db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(TABLE)) return null;
    const row = db.prepare(`SELECT * FROM ${TABLE} WHERE request_id = ?`).get(requestId) as
        | Record<string, unknown> | undefined;
    return row ? row as unknown as ForgeRootRepairBinding : null;
}
/** Re-derive the sidecar with the same canonical source used at request persistence. */
export function rederiveForgeRootRepairBinding(
    request: HallForgeRequestRecord,
    createdAt: number,
): ForgeRootRepairBinding {
    const binding = buildBinding(sourceFromRequest(request), createdAt);
    if (!binding) throw new Error('forge_root_repair_binding_not_applicable');
    return binding;
}
export function persistForgeRootRepairBinding(
    db: Database.Database,
    input: SaveForgeRequestInput | HallForgeRequestRecord,
    now = Date.now(),
): void {
    ensureForgeRootRepairBindingSchema(db);
    const source = 'request_summary_json' in input
        ? sourceFromRequest(input as HallForgeRequestRecord)
        : sourceFromInput(input as SaveForgeRequestInput);
    const existing = getForgeRootRepairBinding(db, source.request_id);
    const binding = buildBinding(source, existing?.created_at ?? now);
    if (!binding) return;
    if (existing) {
        if (stableJson(existing) !== stableJson(binding)) {
            throw new Error('forge_root_repair_binding_conflict');
        }
        return;
    }
    if ('status' in input) {
        const request = input as HallForgeRequestRecord;
        const attempts = Number((db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_attempts WHERE request_id = ?',
        ).get(request.request_id) as { count?: number }).count ?? 0);
        const authorizations = Number((db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_authorizations WHERE request_id = ?',
        ).get(request.request_id) as { count?: number }).count ?? 0);
        if (request.status !== 'PENDING_AUTH' || attempts !== 0 || authorizations !== 0) return;
    }
    db.prepare(`
        INSERT INTO ${TABLE} (
            schema, request_id, repo_id, bead_id, decision_id, request_sha256,
            target_paths_sha256, required_output_paths_sha256, requested_actions_sha256,
            prohibited_actions_sha256, package_locks_sha256, callback_contract_sha256,
            spend_policy_sha256, retry_budget, max_attempts, live_source_allowed,
            adapter_ref, write_capability, action, repair_instruction_sha256,
            root_thread_id, root_turn_id, root_record_set_sha256, binding_sha256, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        binding.schema, binding.request_id, binding.repo_id, binding.bead_id, binding.decision_id,
        binding.request_sha256, binding.target_paths_sha256, binding.required_output_paths_sha256,
        binding.requested_actions_sha256, binding.prohibited_actions_sha256, binding.package_locks_sha256,
        binding.callback_contract_sha256, binding.spend_policy_sha256, binding.retry_budget,
        binding.max_attempts, binding.live_source_allowed, binding.adapter_ref, binding.write_capability,
        binding.action, binding.repair_instruction_sha256, binding.root_thread_id, binding.root_turn_id,
        binding.root_record_set_sha256, binding.binding_sha256, binding.created_at,
    );
}
function assertContinuationBinding(
    db: Database.Database,
    request: HallForgeRequestRecord,
    input: AuthorizeForgeRequestInput,
    existingAuthorization: HallForgeAuthorizationRecord | null = null,
): ForgeRootRepairBinding {
    const binding = getForgeRootRepairBinding(db, request.request_id);
    if (!binding) throw new Error('forge_root_repair_continuation_missing');
    let expected: ForgeRootRepairBinding | null;
    try {
        expected = buildBinding(sourceFromRequest(request), binding.created_at);
    } catch {
        throw new Error('forge_root_repair_continuation_drift');
    }
    if (!expected || stableJson(expected) !== stableJson(binding)) {
        throw new Error('forge_root_repair_continuation_drift');
    }
    if (!HASH.test(input.request_sha256)) throw new Error('forge_root_repair_continuation_request_hash_invalid');
    const exactReplay = existingAuthorization !== null
        && request.status === 'AUTHORIZED'
        && existingAuthorization.request_id === request.request_id
        && existingAuthorization.request_sha256 === binding.request_sha256
        && existingAuthorization.operator_authorization_ref === input.operator_authorization_ref
        && existingAuthorization.operator_thread_id === input.operator_thread_id
        && existingAuthorization.operator_turn_id === input.operator_turn_id
        && existingAuthorization.operator_record_set_sha256 === input.operator_record_set_sha256
        && existingAuthorization.authorization_binding_sha256 === input.authorization_binding_sha256
        && existingAuthorization.operator_intent_json === input.operator_intent_json;
    if ((!exactReplay && request.status !== 'PENDING_AUTH')
        || request.authorization_profile !== ROOT_USER_FORGE_INTENT_PROFILE
        || (!exactReplay && request.authorization_binding_sha256 !== undefined)
        || request.request_sha256 !== binding.request_sha256
        || input.request_id !== binding.request_id
        || input.request_sha256 !== binding.request_sha256
        || input.operator_thread_id !== binding.root_thread_id
        || input.operator_turn_id === binding.root_turn_id
        || input.operator_record_set_sha256 === binding.root_record_set_sha256) {
        throw new Error('forge_root_repair_continuation_lineage_invalid');
    }
    const attempts = Number((db.prepare(
        'SELECT COUNT(*) AS count FROM hall_forge_attempts WHERE request_id = ?',
    ).get(request.request_id) as { count?: number }).count ?? 0);
    const authorizations = Number((db.prepare(
        'SELECT COUNT(*) AS count FROM hall_forge_authorizations WHERE request_id = ?',
    ).get(request.request_id) as { count?: number }).count ?? 0);
    if (attempts !== 0 || authorizations !== (exactReplay ? 1 : 0)) {
        throw new Error('forge_root_repair_continuation_requires_unspent_request');
    }
    return binding;
}

export function isForgeRootRepairContinuationReference(value: string): boolean {
    return value.startsWith(FORGE_ROOT_REPAIR_CONTINUATION_REF_PREFIX);
}

export function assertForgeRootRepairContinuationAuthorization(args: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    input: AuthorizeForgeRequestInput;
    existingAuthorization?: HallForgeAuthorizationRecord | null;
}): void {
    if (!isForgeRootRepairContinuationReference(args.input.operator_authorization_ref)) return;
    assertContinuationBinding(args.db, args.request, args.input, args.existingAuthorization);
}

function assertCurrentContinuationSignalIsSafe(identity: VerifiedCodexRequestIdentity): void {
    const sessionFile = findCodexSessionFile(resolveCodexSessionsRoot(), identity.thread_id);
    let sawCurrentTurn = false;
    const projection = createCodexPlatformContextProjection((record) => {
        const classification = classifyCodexSessionRecord(record.row);
        if (classification.kind !== 'canonical-root-user' || classification.turnId !== identity.turn_id) return;
        const payload = record.row.payload;
        if (!isRecord(payload) || !Array.isArray(payload.content) || payload.content.length === 0
            || payload.content.some((item) => !isRecord(item)
                || item.type !== 'input_text' || typeof item.text !== 'string')) {
            throw new Error('forge_root_repair_continuation_signal_uninspectable');
        }
        const text = payload.content.map((item) => (item as Record<string, unknown>).text as string).join('');
        if (!text.trim() || UNSAFE_TEXT.test(text)) {
            throw new Error('forge_root_repair_continuation_signal_uninspectable');
        }
        if (sawCurrentTurn) throw new Error('forge_root_repair_continuation_signal_ambiguous');
        sawCurrentTurn = true;
        if (isForgeAuthorityRevocation(text) || NON_CONTINUATION_SIGNAL.test(text)) {
            throw new Error('forge_root_repair_continuation_revoked');
        }
        if (text.includes('?')) throw new Error('forge_root_repair_continuation_question');
        if (PROTECTED_CONTINUATION_TERM.test(text)) {
            throw new Error('forge_root_repair_continuation_protected_action');
        }
        if (!AFFIRMATIVE_REPAIR_CONTINUATION.test(text)) {
            throw new Error('forge_root_repair_continuation_signal_invalid');
        }
    });
    scanFixedCodexSession(sessionFile, MAX_CODEX_SESSION_FILE_BYTES, (record) => projection.consume(record));
    projection.finish();
    if (!sawCurrentTurn) throw new Error('forge_root_repair_continuation_signal_missing');
}

export function buildForgeRootRepairContinuationIntent(args: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    identity: VerifiedCodexRequestIdentity;
    existingAuthorization?: HallForgeAuthorizationRecord | null;
    now?: number;
}): VerifiedForgeOperatorIntent | null {
    const binding = getForgeRootRepairBinding(args.db, args.request.request_id);
    if (!binding) return null;
    if (args.identity.thread_id !== binding.root_thread_id) {
        throw new Error('forge_root_repair_continuation_thread_mismatch');
    }
    const replay = args.existingAuthorization
        && isForgeRootRepairContinuationReference(args.existingAuthorization.operator_authorization_ref)
        ? args.existingAuthorization : null;
    if (!replay && args.identity.turn_id === binding.root_turn_id) return null;
    if (replay && (args.request.status !== 'AUTHORIZED'
        || replay.request_id !== args.request.request_id
        || replay.operator_thread_id !== args.identity.thread_id
        || replay.operator_turn_id !== args.identity.turn_id
        || replay.operator_record_set_sha256 !== args.identity.turn_record_set_sha256)) {
        throw new Error('forge_root_repair_continuation_replay_lineage_invalid');
    }
    assertCurrentContinuationSignalIsSafe(args.identity);
    const ref = replay?.operator_authorization_ref
        ?? `${FORGE_ROOT_REPAIR_CONTINUATION_REF_PREFIX}${binding.binding_sha256}:thread:${args.identity.thread_id}:turn:${args.identity.turn_id}:record-set:${args.identity.turn_record_set_sha256}`;
    const input = {
        request_id: args.request.request_id,
        request_sha256: args.request.request_sha256,
        operator_authorization_ref: ref,
        operator_thread_id: args.identity.thread_id,
        operator_turn_id: args.identity.turn_id,
        operator_record_set_sha256: args.identity.turn_record_set_sha256,
        authorization_binding_sha256: replay?.authorization_binding_sha256,
        operator_intent_json: replay?.operator_intent_json,
    } as AuthorizeForgeRequestInput;
    assertContinuationBinding(args.db, args.request, input, replay);
    const authorizedAt = replay?.authorized_at ?? Date.parse(args.identity.turn_timestamp);
    if (!Number.isSafeInteger(authorizedAt)) {
        throw new Error('forge_root_repair_continuation_timestamp_invalid');
    }
    return {
        intent: 'forge_execute',
        action: binding.action,
        normalized_text: 'durable root repair continuation',
        work_reference_text: args.request.bead_id,
        operator_authorization_ref: ref,
        thread_id: args.identity.thread_id,
        turn_id: args.identity.turn_id,
        message_sha256: replay?.operator_message_sha256 ?? args.identity.turn_record_sha256,
        session_record_sha256: replay?.operator_record_sha256 ?? args.identity.turn_record_sha256,
        session_record_set_sha256: replay?.operator_record_set_sha256 ?? args.identity.turn_record_set_sha256,
        session_record_count: replay?.operator_record_count ?? args.identity.turn_record_count,
        binding_mode: 'exact_request_receipt',
        bound_request_id: args.request.request_id,
        bound_request_sha256: args.request.request_sha256,
        bound_decision_id: args.request.decision_id,
        authorized_at: authorizedAt,
        expires_at: replay?.expires_at ?? authorizedAt + 24 * 60 * 60 * 1_000,
    };
}
