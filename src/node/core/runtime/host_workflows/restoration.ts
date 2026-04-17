import { 
    RuntimeAdapter, 
    RuntimeContext, 
    WeaveInvocation, 
    WeaveResult, 
    RestorationWeavePayload,
    RuntimeDispatchPort,
    EvolveWeavePayload,
    CompressWeavePayload
} from '../contracts.ts';
import { getHallBeadsByStatus, getHallBeadsByEpic } from  '../../../../tools/pennyone/intel/database.js';
import chalk from 'chalk';
import * as hostBridge from '../weaves/host_bridge.js';
import { inheritTraceInvocation } from '../trace_inheritance.js';

export const deps = {
    getHallBeadsByStatus,
    getHallBeadsByEpic,
    resolveRuntimeHostProvider: hostBridge.resolveRuntimeHostProvider,
    extractJsonObject: hostBridge.extractJsonObject,
};

interface RestorationSupervisorDecision {
    action: 'execute_now' | 'replan' | 'observe_only';
    reason?: string;
}

function buildRestorationSupervisorPrompt(input: {
    beadIds: string[];
    epic?: string;
    maxBeads: number;
}): string {
    return [
        'You are supervising CStar restoration routing.',
        'Decide whether this restoration request should execute now, replan through chant, or observe only.',
        'Choose execute_now for bounded, ready repair work.',
        'Choose replan when the current restoration request is ambiguous, under-scoped, or should be decomposed differently.',
        'Choose observe_only when the system should report readiness without mutating anything.',
        'Return JSON only.',
        JSON.stringify({
            bead_ids: input.beadIds,
            epic: input.epic ?? null,
            max_beads: input.maxBeads,
            response_schema: {
                action: 'execute_now | replan | observe_only',
                reason: 'string',
            },
        }, null, 2),
    ].join('\n\n');
}

function normalizeRestorationDecision(raw: string): RestorationSupervisorDecision | null {
    try {
        const parsed = deps.extractJsonObject(raw);
        const action = parsed.action === 'execute_now' || parsed.action === 'replan' || parsed.action === 'observe_only'
            ? parsed.action
            : null;
        if (!action) {
            return null;
        }
        return {
            action,
            reason: typeof parsed.reason === 'string' ? parsed.reason.trim() : undefined,
        };
    } catch {
        return null;
    }
}

/**
 * 🔱 RESTORATION WEAVE
 * Logic: Identify (Hall) -> Implement (Evolve) -> Verify (Trace) -> Remember (Compress)
 */
export class RestorationHostWorkflow implements RuntimeAdapter<RestorationWeavePayload> {
    public readonly id = 'weave:restoration';

    public constructor(
        private readonly dispatchPort: RuntimeDispatchPort,
        private readonly hostTextInvoker: hostBridge.HostTextInvoker = hostBridge.defaultHostTextInvoker,
    ) {}

    public async execute(
        invocation: WeaveInvocation<RestorationWeavePayload>,
        context: RuntimeContext
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const projectRoot = payload.project_root || context.workspace_root;
        const repoId = `repo:${projectRoot}`;

        // 1. Identify Beads
        let beads = [];
        if (payload.bead_ids && payload.bead_ids.length > 0) {
            beads = payload.bead_ids.map(id => ({ id }));
        } else if (payload.epic) {
            beads = deps.getHallBeadsByEpic(repoId, payload.epic);
        } else {
            beads = deps.getHallBeadsByStatus(repoId, 'SET');
        }

        if (beads.length === 0) {
            return {
                weave_id: this.id,
                status: 'SUCCESS',
                output: '[ALFRED]: No sectors requiring restoration identified in the Hall.',
            };
        }

        const limit = payload.max_beads || 1;
        const targetBeads = beads.slice(0, limit);
        const hostProvider = deps.resolveRuntimeHostProvider(context);

        if (hostProvider) {
            try {
                const raw = await this.hostTextInvoker({
                    provider: hostProvider,
                    projectRoot: projectRoot,
                    source: 'runtime:restoration',
                    systemPrompt: 'Return JSON only. Decide restoration routing.',
                    prompt: buildRestorationSupervisorPrompt({
                        beadIds: targetBeads.map((bead: any) => bead.id),
                        epic: payload.epic,
                        maxBeads: limit,
                    }),
                    env: { ...process.env, ...context.env } as NodeJS.ProcessEnv,
                    metadata: hostBridge.withRuntimeAuguryMetadata({
                        runtime_weave: 'restoration',
                        decision: 'restoration-supervisor',
                        trace_critical: true,
                        require_agent_harness: true,
                        transport_mode: 'host_session',
                    }, context),
                });
                const decision = normalizeRestorationDecision(raw);
                if (decision?.action === 'observe_only') {
                    return {
                        weave_id: this.id,
                        status: 'TRANSITIONAL',
                        output: `[ALFRED]: Restoration observation only. ${decision.reason ?? 'No repair execution requested.'}`.trim(),
                        metadata: {
                            supervisor_decision: decision.action,
                            supervisor_reason: decision.reason,
                            bead_ids: targetBeads.map((bead: any) => bead.id),
                        },
                    };
                }
                if (decision?.action === 'replan') {
                    const chantResult = await this.dispatchPort.dispatch(inheritTraceInvocation({
                        weave_id: 'weave:chant',
                        payload: {
                            query: `Replan restoration for bead(s): ${targetBeads.map((bead: any) => bead.id).join(', ')}`,
                            project_root: projectRoot,
                            cwd: context.workspace_root,
                            source: 'runtime',
                        },
                    }, context));
                    return {
                        weave_id: this.id,
                        status: chantResult.status,
                        output: chantResult.output,
                        error: chantResult.error,
                        metadata: {
                            ...(chantResult.metadata ?? {}),
                            delegated_weave_id: 'weave:chant',
                            supervisor_decision: decision.action,
                            supervisor_reason: decision.reason,
                            bead_ids: targetBeads.map((bead: any) => bead.id),
                        },
                    };
                }
            } catch {
                // Fall through to bounded local execution.
            }
        }

        const outcomes: any[] = [];

        console.log(chalk.cyan(`\n ◤ RESTORATION WEAVE: ADVANCING ${targetBeads.length} SECTOR(S) ◢ `));

        for (const bead of targetBeads) {
            console.log(chalk.dim(`\n◈ Sector: ${bead.id}`));

            // 2. Implement (Evolve)
            console.log(chalk.dim('  ↳ Implementing evolution...'));
            const evolveResult = await this.dispatchPort.dispatch<EvolveWeavePayload>({
                weave_id: 'weave:evolve',
                payload: {
                    action: 'promote',
                    bead_id: bead.id,
                    project_root: projectRoot,
                    cwd: context.workspace_root,
                    simulate: false
                }
            });

            if (evolveResult.status !== 'SUCCESS') {
                console.error(chalk.red(`  [!] Evolution failed: ${evolveResult.error}`));
                outcomes.push({ bead_id: bead.id, status: 'FAILED', stage: 'EVOLVE' });
                continue;
            }

            // 3. Remember (Compress)
            console.log(chalk.dim('  ↳ Compressing episodic memory...'));
            const compressResult = await this.dispatchPort.dispatch<CompressWeavePayload>({
                weave_id: 'weave:distill',
                payload: {
                    bead_id: bead.id,
                    bead_intent: evolveResult.output,
                    project_root: projectRoot,
                    cwd: context.workspace_root,
                    metadata: evolveResult.metadata
                }
            });

            outcomes.push({ 
                bead_id: bead.id, 
                status: 'SUCCESS', 
                memory_id: compressResult.metadata?.memory_id 
            });
        }

        const successCount = outcomes.filter(o => o.status === 'SUCCESS').length;

        return {
            weave_id: this.id,
            status: successCount === targetBeads.length ? 'SUCCESS' : 'TRANSITIONAL',
            output: `[ALFRED]: Restoration complete. Successfully advanced ${successCount}/${targetBeads.length} sectors.`,
            metadata: { outcomes }
        };
    }
}

export { RestorationHostWorkflow as RestorationWeave };
