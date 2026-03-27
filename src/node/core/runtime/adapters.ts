import fs from 'node:fs';
import { join } from 'node:path';
import { execa } from 'execa';

import { executeHostGovernorResume } from '../operator_resume.js';
import { ANS } from  '../ans.js';
import { resolveHostProvider } from  '../../../core/host_session.js';
import { RavensCycleWeave } from  './weaves/ravens_cycle.js';
import { RestorationWeave } from  './weaves/restoration.js';
import { EstateExpansionWeave } from  './weaves/expansion.js';
import { VigilanceWeave } from  './weaves/vigilance.js';
import { discoverLegacyCommands, resolvePythonPath } from  './adapters/legacy_commands.js';
import {
    loadRavensSweepTargets,
    RavensSweepTarget,
} from './adapters/ravens_utils.ts';
import {
    DynamicCommandPayload,
    RavensWeavePayload,
    RuntimeAdapter,
    RuntimeDispatchPort,
    RuntimeContext,
    StartWeavePayload,
    WeaveInvocation,
    WeaveResult,
} from './contracts.ts';

export { PennyOneAdapter } from  './weaves/pennyone.js';
export { RestorationWeave } from  './weaves/restoration.js';
export { EstateExpansionWeave } from  './weaves/expansion.js';
export { VigilanceWeave } from  './weaves/vigilance.js';

export class StartAdapter implements RuntimeAdapter<StartWeavePayload> {
    public readonly id = 'weave:start';

    public constructor(private readonly dispatchPort?: RuntimeDispatchPort) {}

    public async execute(
        invocation: WeaveInvocation<StartWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const hostProvider = resolveHostProvider({ ...process.env, ...context.env } as NodeJS.ProcessEnv);

        if (payload.verbose) {
            process.env.CSTAR_VERBOSE = 'true';
        }

        if (payload.debug) {
            process.env.CSTAR_DEBUG = 'true';
        }

        if (!payload.target) {
            if (payload.loki || hostProvider) {
                if (!this.dispatchPort) {
                    return {
                        weave_id: this.id,
                        status: 'FAILURE',
                        output: '',
                        error: 'Host-governor routing is unavailable because the runtime dispatch port is not attached.',
                    };
                }

                const resumeResult = await executeHostGovernorResume(
                    this.dispatchPort,
                    {
                        workspaceRoot: context.workspace_root,
                        cwd: context.workspace_root,
                        task: payload.task,
                        ledger: payload.ledger,
                        autoExecute: true,
                        autoReplanBlocked: true,
                        maxParallel: 1,
                        source: 'runtime',
                        session: invocation.session,
                        target: invocation.target,
                    },
                    hostProvider,
                    {
                        wakeKernel: async () => ANS.wake(),
                    },
                );
                const governorResult = resumeResult.governorResult ?? {
                    weave_id: 'weave:host-governor',
                    status: 'FAILURE' as const,
                    output: '',
                    error: 'Host-governor resume did not produce a result.',
                };

                return {
                    ...governorResult,
                    weave_id: this.id,
                    output: governorResult.output
                        ? `The system is awake and synchronized. ${governorResult.output}`.trim()
                        : 'The system is awake and synchronized.',
                    metadata: {
                        ...(governorResult.metadata ?? {}),
                        adapter: 'runtime:start-resume',
                        delegated_weave_id: 'weave:host-governor',
                        resume_provider: resumeResult.provider,
                        resume_mode: payload.loki ? 'explicit-loki' : 'host-session',
                        resume_requested: true,
                    },
                };
            }

            await ANS.wake();
            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: 'The system is awake and synchronized. The Corvus kernel is active.',
                metadata: { adapter: 'runtime:ans-kernel' },
            };
        }

        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: `Target-driven start is no longer canonical for '${payload.target}'. Create or select a bead and dispatch TALIESIN with --bead-id.`,
            metadata: {
                adapter: 'compatibility:start-target-rejected',
                rejected_target: payload.target,
            },
        };
    }
}

export class RavensAdapter implements RuntimeAdapter<RavensWeavePayload> {
    public readonly id = 'weave:ravens';

    public constructor(
        private readonly cycleWeave: RuntimeAdapter<{ project_root: string; cwd: string }> = new RavensCycleWeave(),
        private readonly repoLoader: (projectRoot: string, requestedSpoke?: string) => RavensSweepTarget[] = loadRavensSweepTargets,
    ) {}

    private async executeCycleForTarget(
        kernelRoot: string,
        target: RavensSweepTarget,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        return this.cycleWeave.execute(
            {
                weave_id: 'weave:ravens-cycle',
                payload: {
                    project_root: target.repo_root,
                    cwd: target.repo_root,
                },
            },
            {
                ...context,
                workspace_root: kernelRoot,
                target_domain: target.domain === 'spoke' ? 'spoke' : 'brain',
                spoke_name: target.domain === 'spoke' ? target.slug : undefined,
                spoke_root: target.domain === 'spoke' ? target.repo_root : undefined,
                requested_root: target.requested_path,
            },
        );
    }

    public async execute(
        invocation: WeaveInvocation<RavensWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const projectRoot = context.workspace_root;
        const wardenDir = join(projectRoot, 'src', 'sentinel', 'wardens');
        const payload = invocation.payload;
        const sweepTargets = this.repoLoader(projectRoot, payload.spoke);

        if (payload.spoke && sweepTargets.length === 0) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: `Ravens cannot resolve mounted target '${payload.spoke}'. Link the spoke first or target the brain explicitly.`,
            };
        }

        if (payload.action === 'cycle') {
            const cycleTarget = sweepTargets[0] ?? {
                slug: 'brain',
                domain: 'brain' as const,
                repo_root: projectRoot,
                requested_path: projectRoot,
            };
            const cycleResult = await this.executeCycleForTarget(projectRoot, cycleTarget, context);

            return {
                ...cycleResult,
                weave_id: this.id,
                metadata: {
                    ...(cycleResult.metadata ?? {}),
                    adapter: 'runtime:ravens-cycle-wrapper',
                    delegated_weave_id: 'weave:ravens-cycle',
                    target_slug: cycleTarget.slug,
                    target_domain: cycleTarget.domain,
                    target_repo_root: cycleTarget.repo_root,
                },
            };
        }

        const activeWardens = fs.existsSync(wardenDir)
            ? fs.readdirSync(wardenDir)
                .filter((file) => file.endsWith('.py') && !file.startsWith('__'))
                .map((file) => file.replace('.py', ''))
            : [];

        if (payload.action === 'status') {
            const activeMountedSpokes = sweepTargets.filter((target) => target.domain === 'spoke').length;
            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: `Raven runtime status: STANDBY. Estate sweep configured for ${sweepTargets.length} target(s), including ${activeMountedSpokes} mounted spoke(s). Active wardens available: ${activeWardens.length}.`,
                metadata: {
                    adapter: 'runtime:ravens-kernel-status',
                    active_wardens: activeWardens,
                    estate_targets: sweepTargets,
                    target_repos: sweepTargets.map((target) => target.repo_root),
                },
            };
        }

        if (payload.action === 'stop') {
            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: 'No resident Muninn daemon is running. Ravens now execute as one-shot kernel sweeps.',
                metadata: {
                    adapter: 'runtime:ravens-kernel-status',
                    active_wardens: activeWardens,
                },
            };
        }

        const sweepResults = [];

        for (const target of sweepTargets) {
            const cycleResult = await this.executeCycleForTarget(projectRoot, target, context);
            sweepResults.push({
                target_slug: target.slug,
                target_domain: target.domain,
                repo_root: target.repo_root,
                requested_path: target.requested_path,
                status: cycleResult.status,
                output: cycleResult.output,
                error: cycleResult.error,
                cycle_result: cycleResult.metadata?.cycle_result,
            });
        }

        const successes = sweepResults.filter((result) => result.status === 'SUCCESS').length;
        const failures = sweepResults.filter((result) => result.status === 'FAILURE').length;
        const transitional = sweepResults.length - successes - failures;
        const status = failures === sweepResults.length
            ? 'FAILURE'
            : failures > 0 || transitional > 0
                ? 'TRANSITIONAL'
                : 'SUCCESS';

        return {
            weave_id: this.id,
            status,
            output: `Ravens sweep completed across ${sweepTargets.length} target(s): ${successes} success, ${transitional} transitional, ${failures} failure.`,
            metadata: {
                adapter: 'runtime:ravens-sweep',
                active_wardens: activeWardens,
                sweep_results: sweepResults,
                estate_targets: sweepTargets,
                target_repos: sweepTargets.map((target) => target.repo_root),
                shadow_forge: payload.shadow_forge ?? false,
                isolated_failures: sweepResults.filter((result) => result.status === 'FAILURE'),
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
        const payload = invocation.payload;
        const commands = discoverLegacyCommands(payload.project_root);
        const resolvedPath = commands.get(payload.command);

        if (!resolvedPath) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: `Unknown command '${payload.command}'`,
            };
        }

        const pythonPath = resolvePythonPath(payload.project_root);
        const dispatcherPath = join(payload.project_root, 'src', 'core', 'cstar_dispatcher.py');

        await execa(pythonPath, [dispatcherPath, payload.command, ...payload.args], {
            stdio: 'inherit',
            cwd: payload.cwd,
            env: { ...context.env, PYTHONPATH: payload.project_root },
        });

        return {
            weave_id: this.id,
            status: 'TRANSITIONAL',
            output: `Legacy command '${payload.command}' dispatched through the runtime adapter.`,
            metadata: { adapter: 'legacy:python-dispatcher', resolved_path: resolvedPath },
        };
    }
}
