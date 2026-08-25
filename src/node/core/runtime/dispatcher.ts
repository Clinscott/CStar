import type { SkillBead } from '../skills/types.js';
import type {
    RuntimeAdapter,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from './contracts.ts';
import {
    loadRegistryEntries,
    resolveEntrySurface,
    resolveRegistryEntryForCommand,
} from './entry_surface.js';
import { registry } from '../../../tools/pennyone/pathRegistry.js';

const RETIRED_RUNTIME_CAPABILITIES = new Set([
    'artifact-forge',
    'evolve',
    'host-governor',
    'orchestrate',
    'taliesin-forge',
    'temporal-learning',
    'weave:artifact-forge',
    'weave:evolve',
    'weave:host-governor',
    'weave:orchestrate',
    'weave:taliesin-forge',
    'weave:temporal-learning',
]);

function failureMetadata(
    failureCode: string,
    executionBoundary: string,
): Record<string, unknown> {
    return {
        failure_code: failureCode,
        execution_boundary: executionBoundary,
        execution_dispatched: false,
        hall_mutation_started: false,
        provider_attempted: false,
        process_started: false,
        source_access_started: false,
    };
}

function fail(
    capabilityId: string,
    error: string,
    failureCode: string,
    executionBoundary: string,
): WeaveResult {
    return {
        weave_id: capabilityId,
        status: 'FAILURE',
        output: '',
        error,
        metadata: failureMetadata(failureCode, executionBoundary),
    };
}

function normalizeCapabilityId<T>(invocation: WeaveInvocation<T> | SkillBead<T>): string {
    return ('skill_id' in invocation ? invocation.skill_id : invocation.weave_id).trim().toLowerCase();
}

/**
 * Retired Node adapter dispatcher.
 *
 * Typed lifecycle mutations remain available through cstar-kernel MCP. This
 * compatibility object deliberately has an empty adapter allowlist and never
 * reaches Hall, a provider, a process, a source collector, or a generic host
 * callback.
 */
export class RuntimeDispatcher implements RuntimeDispatchPort {
    private static instance: RuntimeDispatcher;
    private readonly adapters = new Map<string, RuntimeAdapter>();

    private constructor(_deps?: unknown) {}

    public static getInstance(): RuntimeDispatcher {
        if (!this.instance) {
            this.instance = new RuntimeDispatcher();
        }
        return this.instance;
    }

    public static createIsolated(_deps?: unknown): RuntimeDispatcher {
        return new RuntimeDispatcher();
    }

    public registerAdapter(adapter: RuntimeAdapter): void {
        throw new Error(
            `legacy_runtime_adapter_registration_retired:${adapter.id}`,
        );
    }

    public async dispatch<T>(invocation: WeaveInvocation<T> | SkillBead<T>): Promise<WeaveResult> {
        const capabilityId = normalizeCapabilityId(invocation);
        if (RETIRED_RUNTIME_CAPABILITIES.has(capabilityId)) {
            return fail(
                capabilityId,
                `Legacy runtime capability '${capabilityId}' is retired; use cstar-kernel MCP.`,
                'legacy_runtime_capability_retired_use_cstar_kernel',
                'retired-runtime',
            );
        }

        const projectRoot = process.env.CSTAR_PROJECT_ROOT || registry.getRoot();
        const resolved = resolveRegistryEntryForCommand(loadRegistryEntries(projectRoot), capabilityId);

        if (!resolved) {
            return fail(
                capabilityId,
                `Capability '${capabilityId}' is absent from the authoritative registry; Node runtime dispatch is forbidden.`,
                'runtime_registry_entry_missing',
                'registry-required',
            );
        }

        const adapterId = String(resolved.entry.execution?.adapter_id ?? capabilityId)
            .trim()
            .toLowerCase();
        const surface = resolveEntrySurface(resolved.entry, resolved.skillId);

        if (surface === 'host-only') {
            return fail(
                capabilityId,
                `Capability '${resolved.skillId}' is host-only and requires an active host conversation.`,
                'runtime_host_only_requires_active_host',
                'host-native-required',
            );
        }

        if (
            surface === 'compatibility'
            || RETIRED_RUNTIME_CAPABILITIES.has(capabilityId)
            || RETIRED_RUNTIME_CAPABILITIES.has(adapterId)
        ) {
            return fail(
                capabilityId,
                `Legacy runtime capability '${capabilityId}' is retired; use cstar-kernel MCP.`,
                'legacy_runtime_capability_retired_use_cstar_kernel',
                'retired-runtime',
            );
        }

        return fail(
            capabilityId,
            `No authorized Node runtime adapter is registered for capability '${capabilityId}'.`,
            'runtime_adapter_not_registered',
            'empty-adapter-allowlist',
        );
    }

    public hasAdapter(id: string): boolean {
        return this.adapters.has(id);
    }

    public listAdapterIds(): string[] {
        return [];
    }

    public async shutdown(): Promise<void> {}

    public clearAdapters(): void {
        this.adapters.clear();
    }
}
