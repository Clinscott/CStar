import { 
    RuntimeAdapter, 
    RuntimeContext, 
    WeaveInvocation, 
    WeaveResult, 
    VigilanceWeavePayload,
    RuntimeDispatchPort,
    RavensCycleWeavePayload,
    WardenWeavePayload,
} from '../contracts.ts';
import chalk from 'chalk';
import * as hostBridge from '../weaves/host_bridge.js';

export const deps = {
    resolveRuntimeHostProvider: hostBridge.resolveRuntimeHostProvider,
    extractJsonObject: hostBridge.extractJsonObject,
};

interface VigilanceSupervisorDecision {
    action: 'execute_now' | 'replan' | 'observe_only';
    reason?: string;
}

function buildVigilanceSupervisorPrompt(input: {
    aggressive: boolean;
    spoke?: string;
    workspaceRoot: string;
}): string {
    return [
        'You are supervising CStar vigilance routing.',
        'Decide whether this vigilance request should execute now, replan through chant, or observe only.',
        'Choose execute_now for bounded audit work.',
        'Choose replan when the audit request needs decomposition or a better mission shape.',
        'Choose observe_only when the system should report posture without running the sweep.',
        'Return JSON only.',
        JSON.stringify({
            aggressive: input.aggressive,
            spoke: input.spoke ?? null,
            workspace_root: input.workspaceRoot,
            response_schema: {
                action: 'execute_now | replan | observe_only',
                reason: 'string',
            },
        }, null, 2),
    ].join('\n\n');
}

function normalizeVigilanceDecision(raw: string): VigilanceSupervisorDecision | null {
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
 * 🔱 VIGILANCE WEAVE
 * Logic: Audit (Ravens) -> Evaluate (Warden) -> Map (Chronicle)
 */
export class VigilanceHostWorkflow implements RuntimeAdapter<VigilanceWeavePayload> {
    public readonly id = 'weave:vigilance';

    public constructor(
        private readonly dispatchPort: RuntimeDispatchPort,
        private readonly hostTextInvoker: hostBridge.HostTextInvoker = hostBridge.defaultHostTextInvoker,
    ) {}

    public async execute(
        invocation: WeaveInvocation<VigilanceWeavePayload>,
        context: RuntimeContext
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const projectRoot = payload.project_root || context.workspace_root;
        const hostProvider = deps.resolveRuntimeHostProvider(context);

        if (hostProvider) {
            try {
                const raw = await this.hostTextInvoker({
                    provider: hostProvider,
                    projectRoot: projectRoot,
                    source: 'runtime:vigilance',
                    systemPrompt: 'Return JSON only. Decide vigilance routing.',
                    prompt: buildVigilanceSupervisorPrompt({
                        aggressive: Boolean(payload.aggressive),
                        spoke: payload.spoke,
                        workspaceRoot: projectRoot,
                    }),
                    env: { ...process.env, ...context.env } as NodeJS.ProcessEnv,
                    metadata: {
                        runtime_weave: 'vigilance',
                        decision: 'vigilance-supervisor',
                        transport_mode: 'session-required',
                    },
                });
                const decision = normalizeVigilanceDecision(raw);
                if (decision?.action === 'observe_only') {
                    return {
                        weave_id: this.id,
                        status: 'TRANSITIONAL',
                        output: `[ALFRED]: Vigilance observation only. ${decision.reason ?? 'No audit execution requested.'}`.trim(),
                        metadata: {
                            supervisor_decision: decision.action,
                            supervisor_reason: decision.reason,
                            aggressive: Boolean(payload.aggressive),
                            spoke: payload.spoke ?? null,
                        },
                    };
                }
                if (decision?.action === 'replan') {
                    const chantResult = await this.dispatchPort.dispatch({
                        weave_id: 'weave:chant',
                        payload: {
                            query: `Replan vigilance sweep${payload.spoke ? ` for spoke ${payload.spoke}` : ''}${payload.aggressive ? ' with aggressive audit' : ''}`,
                            project_root: projectRoot,
                            cwd: context.workspace_root,
                            source: 'runtime',
                        },
                    });
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
                            aggressive: Boolean(payload.aggressive),
                            spoke: payload.spoke ?? null,
                        },
                    };
                }
            } catch {
                // Fall through to bounded local execution.
            }
        }

        console.log(chalk.cyan(`\n ◤ VIGILANCE WEAVE: DEEP SYSTEM AUDIT ◢ `));

        // 1. Release the Ravens (Ravens:cycle)
        console.log(chalk.dim('  ↳ Releasing Raven Wardens...'));
        const ravenResult = await this.dispatchPort.dispatch<RavensCycleWeavePayload>({
            weave_id: 'weave:ravens-cycle',
            payload: {
                project_root: projectRoot,
                cwd: context.workspace_root,
                dry_run: false
            }
        });

        if (ravenResult.status !== 'SUCCESS') {
            return ravenResult;
        }

        // 2. Evaluate anomalies and drift through the bounded Warden primitive
        console.log(chalk.dim(`  ↳ Running Warden evaluation${payload.aggressive ? ' under aggressive posture' : ''}...`));
        const wardenResult = await this.dispatchPort.dispatch<WardenWeavePayload>({
            weave_id: 'weave:warden',
            payload: {
                project_root: projectRoot,
                cwd: context.workspace_root,
                aggressive: Boolean(payload.aggressive),
                spoke: payload.spoke,
                source: 'runtime',
            }
        });

        if (wardenResult.status === 'FAILURE') {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: wardenResult.error ?? 'Warden evaluation failed.',
                metadata: {
                    delegated_weave_id: 'weave:warden',
                    ravens: ravenResult.metadata,
                    warden: wardenResult.metadata,
                },
            };
        }

        return {
            weave_id: this.id,
            status: 'SUCCESS',
            output: `[ALFRED]: Vigilance sweep complete. System integrity verified. ${ravenResult.output} ${wardenResult.output}`.trim(),
            metadata: {
                delegated_weave_id: 'weave:warden',
                ravens: ravenResult.metadata,
                warden: wardenResult.metadata,
            }
        };
    }
}

export { VigilanceHostWorkflow as VigilanceWeave };
