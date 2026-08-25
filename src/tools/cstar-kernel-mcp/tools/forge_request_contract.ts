import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { HallForgeWriteCapability } from '../../../types/forge.js';
import { resolveStateUpdateThreadId, type DispatchRequestArgs } from './dispatch_request.js';
import type { ForgeAdapterRuntimeProof } from './forge_adapters.js';
import type { ForgeHermesRuntimeExpectation } from './forge_hermes_runtime_contract.js';

export interface ForgeRequestContractArgs extends DispatchRequestArgs {
    execution_adapter_ref?: string;
}

export interface CanonicalForgeRequest {
    schema: 'cstar.forge_request.v2';
    bead_id: string;
    decision_id: string;
    state_update_thread_id: string | null;
    source_callback_thread_id: string;
    objective: string;
    prompt: string | null;
    target_paths: string[];
    required_output_paths: string[];
    system_under_test: string | null;
    scope: string;
    authority_lane: 'green' | 'yellow' | 'red';
    required_metrics: Array<{
        name: string;
        threshold: string;
        acceptance_rule: string | null;
        unit: string | null;
    }>;
    artifact_expectations: string[];
    prohibited_actions: string[];
    requested_actions: string[];
    spend_policy: {
        mode: 'no_spend' | 'dry_run' | 'live_authorized';
        max_retries: number;
        live_source_allowed: boolean;
    };
    live_source_policy: string;
    retry_budget: number;
    callback_contract: {
        expected_packet: string;
        callback_required: boolean;
        callback_thread_id: string;
    };
    package_locks: Array<{ path: string; sha256: string }>;
    dispatch_surface_ref: string | null;
    adapter_ref: string | null;
    adapter_runtime: ForgeAdapterRuntimeProof | null;
    hermes_runtime: ForgeHermesRuntimeExpectation | null;
    write_capability: HallForgeWriteCapability | null;
    max_attempts: number;
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function stableValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(stableValue);
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, item]) => [key, stableValue(item)]),
        );
    }
    return value;
}

export function stableJson(value: unknown): string {
    return JSON.stringify(stableValue(value));
}

function normalizedSet(values: string[] | undefined): string[] {
    return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

function normalizedTargets(root: string, values: string[] | undefined): string[] {
    return [...new Set(
        (values ?? [])
            .map((value) => value.trim())
            .filter(Boolean)
            .map((value) => path.resolve(root, value)),
    )].sort();
}

const UNSAFE_REQUIRED_OUTPUT_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/u;

/**
 * Preserve exact path authority for Forge worker outputs. These paths become
 * model-visible data, so do not trim, normalize aliases, or silently coalesce
 * them. Canonical absolute paths are returned only after the lexical contract
 * has passed.
 */
export function canonicalizeForgeRequiredOutputPaths(
    root: string,
    values: string[] | undefined,
): string[] {
    const canonical: string[] = [];
    const seen = new Set<string>();
    for (const value of values ?? []) {
        if (typeof value !== 'string') throw new Error('forge_required_output_path_invalid_type');
        if (!value) throw new Error('forge_required_output_path_empty');
        if (value !== value.trim()) throw new Error('forge_required_output_path_surrounding_whitespace');
        if (UNSAFE_REQUIRED_OUTPUT_TEXT.test(value)) {
            throw new Error('forge_required_output_path_unsafe_text');
        }
        const segments = value.split(path.sep);
        if (
            value.endsWith(path.sep)
            || segments.some((segment) => segment === '.' || segment === '..')
            || path.normalize(value) !== value
        ) {
            throw new Error('forge_required_output_path_alias_forbidden');
        }
        const resolved = path.resolve(root, value);
        if (seen.has(resolved)) throw new Error('forge_required_output_duplicate_canonical_path');
        seen.add(resolved);
        canonical.push(resolved);
    }
    return canonical.sort();
}

function isInside(candidate: string, parent: string): boolean {
    const relative = path.relative(parent, candidate);
    return relative === '' || (
        relative !== '..'
        && !relative.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relative)
    );
}

/**
 * Prove that every declared worker output is covered by an explicit target.
 * Existing directories authorize descendants. Existing files and prospective
 * paths authorize only the exact path, avoiding suffix-based guesses about
 * whether a missing target was intended to be a directory.
 */
export function assertForgeRequiredOutputsContained(
    root: string,
    targetPaths: string[] | undefined,
    requiredOutputPaths: string[] | undefined,
): void {
    const targets = normalizedTargets(root, targetPaths);
    const outputs = canonicalizeForgeRequiredOutputPaths(root, requiredOutputPaths);
    if (outputs.length === 0) throw new Error('forge_required_output_paths_empty');

    const targetScopes = targets.map((target) => {
        let stat: import('node:fs').Stats | null = null;
        try {
            const lexical = fs.lstatSync(target);
            if (lexical.isSymbolicLink()) throw new Error('forge_target_path_symlink_forbidden');
            stat = lexical;
            return {
                path: fs.realpathSync(target),
                permitsDescendants: lexical.isDirectory(),
            };
        } catch (error) {
            if (stat !== null || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            return { path: target, permitsDescendants: false };
        }
    });

    for (const output of outputs) {
        let current = output;
        const missingSegments: string[] = [];
        while (true) {
            try {
                const lexical = fs.lstatSync(current);
                if (lexical.isSymbolicLink()) {
                    throw new Error('forge_required_output_symlink_forbidden');
                }
                const canonicalAncestor = fs.realpathSync(current);
                current = path.join(canonicalAncestor, ...missingSegments.reverse());
                break;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
                const parent = path.dirname(current);
                if (parent === current) throw new Error('forge_required_output_has_no_existing_ancestor');
                missingSegments.push(path.basename(current));
                current = parent;
            }
        }
        const covered = targetScopes.some((target) => target.permitsDescendants
            ? isInside(current, target.path)
            : current === target.path);
        if (!covered) throw new Error('forge_required_output_outside_targets');
    }
}

export function canonicalizeForgeRequest(
    args: ForgeRequestContractArgs,
    root: string,
    decisionId: string,
    adapterRef: string | null,
    writeCapability: HallForgeWriteCapability | null,
    maxAttempts: number,
    adapterRuntime: ForgeAdapterRuntimeProof | null = null,
    hermesRuntime: ForgeHermesRuntimeExpectation | null = null,
): CanonicalForgeRequest {
    const retryBudget = args.retry_policy?.budget ?? args.spend_policy.max_retries ?? 0;
    return {
        schema: 'cstar.forge_request.v2',
        bead_id: args.bead_id?.trim() ?? '',
        decision_id: decisionId.trim(),
        state_update_thread_id: resolveStateUpdateThreadId(args) || null,
        source_callback_thread_id: args.source_callback_thread_id.trim(),
        objective: args.objective.trim(),
        prompt: args.prompt?.trim() || null,
        target_paths: normalizedTargets(root, args.target_paths),
        required_output_paths: canonicalizeForgeRequiredOutputPaths(root, args.required_output_paths),
        system_under_test: args.system_under_test?.trim() || null,
        scope: args.scope.trim(),
        authority_lane: args.authority_lane,
        required_metrics: args.required_metrics
            .map((metric) => ({
                name: metric.name.trim(),
                threshold: metric.threshold.trim(),
                acceptance_rule: metric.acceptance_rule?.trim() || null,
                unit: metric.unit?.trim() || null,
            }))
            .sort((left, right) => stableJson(left).localeCompare(stableJson(right))),
        artifact_expectations: normalizedSet(args.artifact_expectations),
        prohibited_actions: normalizedSet(args.prohibited_actions),
        requested_actions: normalizedSet(args.requested_actions),
        spend_policy: {
            mode: args.spend_policy.mode,
            max_retries: args.spend_policy.max_retries ?? 0,
            live_source_allowed: args.spend_policy.live_source_allowed === true,
        },
        live_source_policy: args.live_source_policy?.trim()
            || 'no live source collection unless separately authorized',
        retry_budget: retryBudget,
        callback_contract: {
            expected_packet: args.callback_contract.expected_packet.trim(),
            callback_required: args.callback_contract.callback_required !== false,
            callback_thread_id: args.callback_contract.callback_thread_id?.trim()
                || args.source_callback_thread_id.trim(),
        },
        package_locks: (args.package_locks ?? [])
            .map((lock) => ({ path: lock.path.trim(), sha256: lock.sha256.trim().toLowerCase() }))
            .sort((left, right) => stableJson(left).localeCompare(stableJson(right))),
        dispatch_surface_ref: args.dispatch_surface_ref?.trim() || null,
        adapter_ref: adapterRef,
        adapter_runtime: adapterRuntime,
        hermes_runtime: hermesRuntime,
        write_capability: writeCapability,
        max_attempts: maxAttempts,
    };
}

export function hashCanonicalForgeRequest(request: CanonicalForgeRequest): string {
    return sha256(stableJson(request));
}

export function hashForgeTargetPaths(request: CanonicalForgeRequest): string {
    return sha256(stableJson(request.target_paths));
}

export function buildForgeRequestId(requestSha256: string): string {
    return `dispatch-forge-${requestSha256.slice(0, 32)}`;
}

export function buildForgeExecutionReceiptId(requestId: string, idempotencyKey: string): string {
    return `forge-execute-${sha256(`${requestId}\n${idempotencyKey}`).slice(0, 32)}`;
}
