import { createHash } from 'node:crypto';
import path from 'node:path';

export const DISPATCH_PRIMARY_ACTIONS = [
    'request_receipt',
    'response_only',
    'project_files',
] as const;
export const DISPATCH_ACTION_MODIFIERS = [
    'validation_artifacts',
    'authorized_source_collection',
] as const;
export const DISPATCH_RED_ACTIONS = [
    'git_branch',
    'git_commit',
    'git_push',
    'git_merge',
    'git_pull_request',
    'install',
    'deploy',
    'restart',
    'activation',
    'secret_config_mutation',
    'credential_mutation',
    'token_mutation',
    'direct_state_write',
    'destructive_cleanup',
    'permission_change',
    'process_control',
    'service_control',
    'steering',
    'locked_holdout',
    'expanded_spend',
    'production_claim',
    'out_of_scope_writes',
] as const;

export type DispatchPrimaryAction = typeof DISPATCH_PRIMARY_ACTIONS[number];
export type DispatchActionModifier = typeof DISPATCH_ACTION_MODIFIERS[number];
export type DispatchRedAction = typeof DISPATCH_RED_ACTIONS[number];
export type DispatchActionId = DispatchPrimaryAction | DispatchActionModifier | DispatchRedAction;

export interface DispatchActionInput {
    objective: string;
    prompt?: string;
    scope: string;
    system_under_test?: string;
    source_callback_thread_id?: string;
    target_paths?: string[];
    required_output_paths?: string[];
    required_metrics?: unknown[];
    artifact_expectations?: string[];
    requested_actions?: string[];
    prohibited_actions?: string[];
    spend_policy?: {
        live_source_allowed?: boolean;
    };
    callback_contract?: {
        expected_packet?: string;
        callback_required?: boolean;
        callback_thread_id?: string;
    };
}

export interface DispatchActionAuthority {
    schema: 'cstar.dispatch_action_authority.v1';
    action_semantics_source: 'requested_actions';
    primary_action: DispatchPrimaryAction;
    requested_actions: Array<DispatchPrimaryAction | DispatchActionModifier>;
    prohibited_actions: DispatchActionId[];
    context_can_expand_actions: false;
    action_set_sha256: string;
    context_sha256: string;
    path_scope_sha256: string;
    authority_sha256: string;
    requested_alias_count: number;
    prohibited_alias_count: number;
}

export type DispatchAdapterWriteCapability = 'response_only' | 'project_files';

const REQUESTED_ALIASES: Readonly<Record<string, DispatchPrimaryAction | DispatchActionModifier>> = {
    'dry-run request receipt': 'request_receipt',
    'no-op execution contract proof': 'request_receipt',
    'report-only analysis': 'response_only',
    'produce bounded response packet': 'response_only',
    'execute through approved forge adapter': 'response_only',
    'build deterministic suite files': 'project_files',
    'refactor the implementation path': 'project_files',
    'build package update': 'project_files',
    'build reusable python module': 'project_files',
    'build reusable researcher skill module': 'project_files',
    'build reusable skill package': 'project_files',
    'build one synthetic file': 'project_files',
    'package validation artifacts': 'validation_artifacts',
};

const PROHIBITED_ALIASES: Readonly<Record<string, DispatchActionId>> = {
    merge: 'git_merge',
    'merge to master': 'git_merge',
    'no merge': 'git_merge',
    push: 'git_push',
    'push to main/master': 'git_push',
    'no push': 'git_push',
    'git actions': 'git_commit',
    'no git actions': 'git_commit',
    'git mutation': 'git_commit',
    'no git mutation': 'git_commit',
    'branch creation': 'git_branch',
    'no branch creation': 'git_branch',
    commit: 'git_commit',
    'no commit': 'git_commit',
    'pull request': 'git_pull_request',
    'no pull request': 'git_pull_request',
    installation: 'install',
    'no installation': 'install',
    deployment: 'deploy',
    'no deployment': 'deploy',
    restart: 'restart',
    'no restart': 'restart',
    activation: 'activation',
    'no activation': 'activation',
    'secret/config mutation': 'secret_config_mutation',
    'no secret/config mutation': 'secret_config_mutation',
    'credential mutation': 'credential_mutation',
    'no credential mutation': 'credential_mutation',
    'token mutation': 'token_mutation',
    'no token mutation': 'token_mutation',
    'direct hall/sqlite write': 'direct_state_write',
    'direct hall/sqlite writes': 'direct_state_write',
    'no direct hall/sqlite write': 'direct_state_write',
    'no direct hall/sqlite writes': 'direct_state_write',
    'destructive cleanup': 'destructive_cleanup',
    'no destructive cleanup': 'destructive_cleanup',
    'permission change': 'permission_change',
    'no permission change': 'permission_change',
    'process control': 'process_control',
    'no process control': 'process_control',
    'service control': 'service_control',
    'no service control': 'service_control',
    steering: 'steering',
    'no steering': 'steering',
    'locked holdout': 'locked_holdout',
    'no locked holdout': 'locked_holdout',
    'expanded spend': 'expanded_spend',
    'no expanded spend': 'expanded_spend',
    'production claim': 'production_claim',
    'no production claim': 'production_claim',
    'live source collection': 'authorized_source_collection',
    'no live source collection': 'authorized_source_collection',
    'writes outside targets': 'out_of_scope_writes',
    'no writes outside targets': 'out_of_scope_writes',
    'live model spend': 'expanded_spend',
    write: 'project_files',
};

const PRIMARY_SET = new Set<string>(DISPATCH_PRIMARY_ACTIONS);
const MODIFIER_SET = new Set<string>(DISPATCH_ACTION_MODIFIERS);
const RED_SET = new Set<string>(DISPATCH_RED_ACTIONS);
const ALL_SET = new Set<string>([
    ...DISPATCH_PRIMARY_ACTIONS,
    ...DISPATCH_ACTION_MODIFIERS,
    ...DISPATCH_RED_ACTIONS,
]);

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, item]) => [key, stable(item)]),
        );
    }
    return value;
}

function stableJson(value: unknown): string {
    return JSON.stringify(stable(value));
}

function normalizedAlias(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function canonicalRequested(value: string): DispatchPrimaryAction | DispatchActionModifier {
    const normalized = normalizedAlias(value);
    if (PRIMARY_SET.has(normalized) || MODIFIER_SET.has(normalized)) {
        return normalized as DispatchPrimaryAction | DispatchActionModifier;
    }
    if (RED_SET.has(normalized)) throw new Error('dispatch_requested_action_red_gated');
    const prohibitedAlias = PROHIBITED_ALIASES[normalized];
    if (prohibitedAlias && RED_SET.has(prohibitedAlias)) {
        throw new Error('dispatch_requested_action_red_gated');
    }
    const alias = REQUESTED_ALIASES[normalized];
    if (alias) return alias;
    throw new Error('dispatch_requested_action_unknown');
}

function canonicalProhibited(value: string): DispatchActionId {
    const normalized = normalizedAlias(value);
    if (ALL_SET.has(normalized)) return normalized as DispatchActionId;
    const alias = PROHIBITED_ALIASES[normalized];
    if (alias) return alias;
    throw new Error('dispatch_prohibited_action_unknown');
}

function canonicalPaths(root: string | undefined, values: string[] | undefined): string[] {
    return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean)
        .map((value) => root ? path.resolve(root, value) : value))].sort();
}

function canonicalMetrics(values: unknown[] | undefined): unknown[] {
    return (values ?? []).map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return stable(item);
        const metric = item as Record<string, unknown>;
        return {
            name: typeof metric.name === 'string' ? metric.name.trim() : null,
            threshold: typeof metric.threshold === 'string' ? metric.threshold.trim() : null,
            acceptance_rule: typeof metric.acceptance_rule === 'string'
                ? metric.acceptance_rule.trim() || null
                : null,
            unit: typeof metric.unit === 'string' ? metric.unit.trim() || null : null,
        };
    }).sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
}

export function resolveDispatchActionAuthority(
    args: DispatchActionInput,
    root?: string,
): DispatchActionAuthority {
    const requestedInput = (args.requested_actions ?? []).filter(
        (value): value is string => typeof value === 'string' && Boolean(value.trim()),
    );
    const prohibitedInput = (args.prohibited_actions ?? []).filter(
        (value): value is string => typeof value === 'string' && Boolean(value.trim()),
    );
    if (requestedInput.length === 0) throw new Error('dispatch_requested_actions_required');
    if (prohibitedInput.length === 0) throw new Error('dispatch_prohibited_actions_required');
    const requested = [...new Set(requestedInput.map(canonicalRequested))].sort();
    const prohibited = [...new Set(prohibitedInput.map(canonicalProhibited))].sort();
    const primary = requested.filter((action) => PRIMARY_SET.has(action));
    if (primary.length !== 1) throw new Error('dispatch_requested_action_primary_count_invalid');
    if (requested.some((action) => prohibited.includes(action as DispatchActionId))) {
        throw new Error('dispatch_requested_action_prohibited');
    }
    const requiredOutputs = canonicalPaths(root, args.required_output_paths);
    const projectFiles = primary[0] === 'project_files';
    if (projectFiles !== (requiredOutputs.length > 0)) {
        throw new Error('dispatch_project_files_required_output_contract_invalid');
    }
    const sourceModifier = requested.includes('authorized_source_collection');
    if (sourceModifier !== (args.spend_policy?.live_source_allowed === true)) {
        throw new Error('dispatch_source_collection_authority_mismatch');
    }
    const context = {
        objective: args.objective.trim(),
        prompt: args.prompt?.trim() || null,
        scope: args.scope.trim(),
        system_under_test: args.system_under_test?.trim() || null,
        required_metrics: canonicalMetrics(args.required_metrics),
        artifact_expectations: [...new Set((args.artifact_expectations ?? [])
            .map((value) => value.trim()).filter(Boolean))].sort(),
        callback_contract: args.callback_contract
            ? {
                expected_packet: args.callback_contract.expected_packet?.trim() || null,
                callback_required: args.callback_contract.callback_required !== false,
                callback_thread_id: args.callback_contract.callback_thread_id?.trim()
                    || args.source_callback_thread_id?.trim()
                    || null,
            }
            : null,
    };
    const pathScope = {
        target_paths: canonicalPaths(root, args.target_paths),
        required_output_paths: requiredOutputs,
    };
    const actionSet = {
        primary_action: primary[0] as DispatchPrimaryAction,
        requested_actions: requested as Array<DispatchPrimaryAction | DispatchActionModifier>,
        prohibited_actions: prohibited,
    };
    const actionSetSha256 = sha256(stableJson(actionSet));
    const contextSha256 = sha256(stableJson(context));
    const pathScopeSha256 = sha256(stableJson(pathScope));
    const authoritySha256 = sha256(stableJson({
        schema: 'cstar.dispatch_action_authority.v1',
        action_semantics_source: 'requested_actions',
        ...actionSet,
        context_can_expand_actions: false,
        action_set_sha256: actionSetSha256,
        context_sha256: contextSha256,
        path_scope_sha256: pathScopeSha256,
    }));
    return {
        schema: 'cstar.dispatch_action_authority.v1',
        action_semantics_source: 'requested_actions',
        ...actionSet,
        context_can_expand_actions: false,
        action_set_sha256: actionSetSha256,
        context_sha256: contextSha256,
        path_scope_sha256: pathScopeSha256,
        authority_sha256: authoritySha256,
        requested_alias_count: requestedInput
            .filter((value) => normalizedAlias(value) !== canonicalRequested(value)).length,
        prohibited_alias_count: prohibitedInput
            .filter((value) => normalizedAlias(value) !== canonicalProhibited(value)).length,
    };
}

export function dispatchActionRequiresProjectFiles(authority: DispatchActionAuthority): boolean {
    return authority.primary_action === 'project_files';
}

export function expectedAdapterCapabilityForAction(
    authority: DispatchActionAuthority,
): DispatchAdapterWriteCapability | null {
    if (authority.primary_action === 'request_receipt') return null;
    return authority.primary_action;
}

export function assertDispatchAdapterCapability(
    authority: DispatchActionAuthority,
    capability: string | null | undefined,
    options: { require_adapter?: boolean } = {},
): void {
    const expected = expectedAdapterCapabilityForAction(authority);
    if (!capability) {
        if (options.require_adapter === true) throw new Error('dispatch_action_adapter_capability_missing');
        return;
    }
    if (expected === null || capability !== expected) {
        throw new Error('dispatch_action_adapter_capability_mismatch');
    }
}

export function findDispatchAdapterCapabilityError(
    authority: DispatchActionAuthority,
    capability: string | null | undefined,
    options: { require_adapter?: boolean } = {},
): string | null {
    try {
        assertDispatchAdapterCapability(authority, capability, options);
        return null;
    } catch (error) {
        return error instanceof Error
            ? error.message
            : 'dispatch_action_adapter_capability_mismatch';
    }
}
