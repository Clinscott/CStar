import type { HostGovernorPolicy } from './contracts.ts';

export const DEFAULT_HOST_GOVERNOR_POLICY: HostGovernorPolicy = {
    max_total_targets: 2,
    max_implementation_targets: 1,
    max_acceptance_items: 3,
    max_acceptance_item_length: 220,
    max_implementation_lines: 400,
    max_total_target_lines: 700,
};

function normalizePositiveInteger(value: unknown, fallback: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    const normalized = Math.floor(numeric);
    return normalized > 0 ? normalized : fallback;
}

export function resolveHostGovernorPolicy(overrides?: Partial<HostGovernorPolicy>): HostGovernorPolicy {
    return {
        max_total_targets: normalizePositiveInteger(overrides?.max_total_targets, DEFAULT_HOST_GOVERNOR_POLICY.max_total_targets),
        max_implementation_targets: normalizePositiveInteger(overrides?.max_implementation_targets, DEFAULT_HOST_GOVERNOR_POLICY.max_implementation_targets),
        max_acceptance_items: normalizePositiveInteger(overrides?.max_acceptance_items, DEFAULT_HOST_GOVERNOR_POLICY.max_acceptance_items),
        max_acceptance_item_length: normalizePositiveInteger(overrides?.max_acceptance_item_length, DEFAULT_HOST_GOVERNOR_POLICY.max_acceptance_item_length),
        max_implementation_lines: normalizePositiveInteger(overrides?.max_implementation_lines, DEFAULT_HOST_GOVERNOR_POLICY.max_implementation_lines),
        max_total_target_lines: normalizePositiveInteger(overrides?.max_total_target_lines, DEFAULT_HOST_GOVERNOR_POLICY.max_total_target_lines),
    };
}
