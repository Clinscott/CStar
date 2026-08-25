import fs from 'node:fs';
import { join } from 'node:path';

import { ANS } from  '../ans.js';
import { RestorationHostWorkflow } from  './host_workflows/restoration.js';
import { EstateExpansionHostWorkflow } from  './host_workflows/expansion.js';
import { VigilanceHostWorkflow } from  './host_workflows/vigilance.js';
import {
    loadRavensSweepTargets,
    RavensSweepTarget,
} from './adapters/ravens_utils.ts';
import {
    DynamicCommandPayload,
    RavensWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    StartWeavePayload,
    WeaveInvocation,
    WeaveResult,
} from './contracts.ts';

export { PennyOneAdapter } from  './weaves/pennyone.js';
export { RestorationHostWorkflow, RestorationHostWorkflow as RestorationWeave } from  './host_workflows/restoration.js';
export { EstateExpansionHostWorkflow, EstateExpansionHostWorkflow as EstateExpansionWeave } from  './host_workflows/expansion.js';
export { VigilanceHostWorkflow, VigilanceHostWorkflow as VigilanceWeave } from  './host_workflows/vigilance.js';

export class StartAdapter implements RuntimeAdapter<StartWeavePayload> {
    public readonly id = 'weave:start';

    public async execute(
        invocation: WeaveInvocation<StartWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;

        if (payload.target) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: `Target-driven start is no longer canonical for '${payload.target}'. Create or select a bead and use the authorized execution lane.`,
                metadata: {
                    adapter: 'compatibility:start-target-rejected',
                    rejected_target: payload.target,
                },
            };
        }

        if (payload.loki) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: 'Loki autonomous start is permanently decommissioned; start cannot bypass operator and CStar execution gates.',
                metadata: {
                    adapter: 'compatibility:start-loki-rejected',
                    resume_requested: false,
                },
            };
        }

        if (payload.verbose) {
            process.env.CSTAR_VERBOSE = 'true';
        }

        if (payload.debug) {
            process.env.CSTAR_DEBUG = 'true';
        }

        await ANS.wake();
        return {
            weave_id: this.id,
            status: 'TRANSITIONAL',
            output: '[RITUAL] Kernel Awakening Complete.',
            metadata: {
                adapter: 'runtime:ans-kernel',
                supervisor_decision_source: 'deterministic-wake-only',
                resume_requested: false,
            },
        };
    }
}

export class RavensAdapter implements RuntimeAdapter<RavensWeavePayload> {
    public readonly id = 'weave:ravens';

    public constructor(
        private readonly repoLoader: (projectRoot: string, requestedSpoke?: string) => RavensSweepTarget[] = loadRavensSweepTargets,
    ) {}

    public async execute(
        invocation: WeaveInvocation<RavensWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const projectRoot = context.workspace_root;
        const payload = { ...invocation.payload };

        if (payload.action !== 'status' && payload.action !== 'stop') {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: `Ravens ${payload.action} execution is decommissioned. This compatibility path is read-only and cannot spawn Python, mutate repositories, run tests, change branches, or commit. Use CStar lifecycle records and the authorized Forge or CorvusEye lane.`,
                metadata: {
                    adapter: 'compatibility:ravens-execution-rejected',
                    requested_action: payload.action,
                    requested_spoke: payload.spoke ?? null,
                    decommissioned: true,
                    read_only: true,
                    execution_attempted: false,
                },
            };
        }

        if (payload.action === 'stop') {
            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: 'No resident Ravens daemon is running. The execution path is decommissioned; status remains available as a read-only compatibility surface.',
                metadata: {
                    adapter: 'compatibility:ravens-read-only-status',
                    decommissioned: true,
                    read_only: true,
                    execution_attempted: false,
                },
            };
        }

        const wardenDir = join(projectRoot, 'src', 'sentinel', 'wardens');
        const sweepTargets = this.repoLoader(projectRoot, payload.spoke);

        if (payload.spoke && sweepTargets.length === 0) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: `Ravens cannot resolve mounted target '${payload.spoke}' for read-only status reporting.`,
                metadata: {
                    adapter: 'compatibility:ravens-read-only-status',
                    decommissioned: true,
                    read_only: true,
                    execution_attempted: false,
                },
            };
        }

        const activeWardens = fs.existsSync(wardenDir)
            ? fs.readdirSync(wardenDir)
                .filter((file) => file.endsWith('.py') && !file.startsWith('__'))
                .map((file) => file.replace('.py', ''))
            : [];

        const activeMountedSpokes = sweepTargets.filter((target) => target.domain === 'spoke').length;

        return {
            weave_id: this.id,
            status: 'TRANSITIONAL',
            output: `Ravens compatibility status: DECOMMISSIONED (READ-ONLY). ${sweepTargets.length} target(s) are visible, including ${activeMountedSpokes} mounted spoke(s); ${activeWardens.length} legacy warden module(s) are present.`,
            metadata: {
                adapter: 'compatibility:ravens-read-only-status',
                active_wardens: activeWardens,
                estate_targets: sweepTargets,
                target_repos: sweepTargets.map((target) => target.repo_root),
                decommissioned: true,
                read_only: true,
                execution_attempted: false,
            },
        };
    }
}

export class DynamicCommandAdapter implements RuntimeAdapter<DynamicCommandPayload> {
    public readonly id = 'weave:dynamic-command';

    public async execute(
        invocation: WeaveInvocation<DynamicCommandPayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        void context;
        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: `Legacy dynamic command '${invocation.payload.command}' is permanently decommissioned. Use a registered host skill or bounded kernel tool.`,
            metadata: {
                adapter: 'compatibility:dynamic-command-rejected',
                decommissioned: true,
                execution_attempted: false,
            },
        };
    }
}
