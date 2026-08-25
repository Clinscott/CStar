import { buildHallRepositoryId } from  '../../../../types/hall.js';
import {
    createRavensHallReferenceSet,
    materializeRavensTargetIdentity,
    type RavensStageName,
    type RavensStageResult,
} from '../../../../types/ravens-stage.ts';
import type {
    RavensCycleWeaveMetadata,
    RavensCycleWeavePayload,
    RavensStageWeaveMetadata,
    RavensStageWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';

export class RavensCycleWeave implements RuntimeAdapter<RavensCycleWeavePayload> {
    public readonly id = 'weave:ravens-cycle';

    public async execute(
        invocation: WeaveInvocation<RavensCycleWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        void invocation;
        void context;
        const metadata: RavensCycleWeaveMetadata = {
            adapter: 'compatibility:ravens-cycle-rejected',
            decommissioned: true,
            read_only: true,
            execution_attempted: false,
        };
        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: 'Ravens cycle execution is decommissioned. This compatibility weave is read-only and cannot spawn Python, mutate repositories, run tests, change branches, or commit. Use CStar lifecycle records and the authorized Forge or CorvusEye lane.',
            metadata,
        };
    }
}

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
            summary: `Ravens ${this.stage} stage contract is frozen. Extraction remains transitional until its Phase 3 ticket lands.`,
            target,
            hall: createRavensHallReferenceSet(context.workspace_root, {
                repo_id: buildHallRepositoryId(context.workspace_root),
                bead_id: target?.bead_id,
            }),
            metadata: {
                contract_only: true,
                requested_metadata: { ...(invocation.payload.metadata ?? {}) },
            },
        };
        const metadata: RavensStageWeaveMetadata = { stage_result: stageResult };

        return {
            weave_id: this.id,
            status: 'TRANSITIONAL',
            output: stageResult.summary,
            metadata,
        };
    }
}
