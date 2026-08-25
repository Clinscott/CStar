import { buildHallRepositoryId } from '../../../../types/hall.js';
import {
    createRavensHallReferenceSet,
    materializeRavensTargetIdentity,
    type RavensStageName,
    type RavensStageResult,
} from '../../../../types/ravens-stage.js';
import type {
    RavensCycleWeavePayload,
    RavensStageWeaveMetadata,
    RavensStageWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { buildRetiredRuntimeResult } from '../retired_adapter.js';

/** Retired Python Ravens-cycle process adapter. */
export class RavensCycleWeave implements RuntimeAdapter<RavensCycleWeavePayload> {
    public readonly id = 'weave:ravens-cycle';

    public constructor(..._retiredDependencies: unknown[]) {
        void _retiredDependencies;
    }

    public async execute(
        _invocation: WeaveInvocation<RavensCycleWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-ravens-cycle-weave',
            recommendedTool: 'cstar_warden',
        });
    }
}

/**
 * Deterministic schema-only Ravens stage materializer.
 *
 * This helper normalizes caller-supplied values and constructs an in-memory
 * result. It never invokes a provider, process, source, callback, timer, Hall
 * mutation, filesystem operation, or Git operation.
 */
export class RavensStageContractAdapter implements RuntimeAdapter<RavensStageWeavePayload> {
    public readonly id: string;

    public constructor(private readonly stage: RavensStageName) {
        this.id = `weave:ravens-${stage}`;
    }

    public async execute(
        invocation: WeaveInvocation<RavensStageWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const target = invocation.payload.target
            ? materializeRavensTargetIdentity(invocation.payload.target)
            : undefined;
        const stageResult: RavensStageResult = {
            stage: this.stage,
            status: 'TRANSITIONAL',
            summary: `Ravens ${this.stage} stage contract is frozen and schema-only.`,
            target,
            hall: createRavensHallReferenceSet(context.workspace_root, {
                repo_id: buildHallRepositoryId(context.workspace_root),
                bead_id: target?.bead_id,
            }),
            metadata: {
                contract_only: true,
                execution_dispatched: false,
                hall_mutation_started: false,
                provider_attempted: false,
                process_started: false,
                source_access_started: false,
                requested_metadata: { ...(invocation.payload.metadata ?? {}) },
            },
        };
        const metadata: RavensStageWeaveMetadata = {
            stage_result: stageResult,
            contract_only: true,
            execution_dispatched: false,
            hall_mutation_started: false,
            provider_attempted: false,
            process_started: false,
            source_access_started: false,
        };

        return {
            weave_id: this.id,
            status: 'TRANSITIONAL',
            output: stageResult.summary,
            metadata,
        };
    }
}
