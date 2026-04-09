import {
    RuntimeAdapter,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
    WardenWeavePayload,
} from '../contracts.ts';
import * as hostBridge from './host_bridge.js';
import { Warden } from '../../../../tools/pennyone/intel/warden.js';
import { inheritTraceInvocation } from '../trace_inheritance.js';

export const deps = {
    resolveRuntimeHostProvider: hostBridge.resolveRuntimeHostProvider,
    extractJsonObject: hostBridge.extractJsonObject,
    createWarden: (ledgerPath?: string) => new Warden(ledgerPath),
};

interface WardenSupervisorDecision {
    action: 'execute_now' | 'replan' | 'observe_only';
    reason?: string;
}

function buildWardenSupervisorPrompt(input: {
    workspaceRoot: string;
    aggressive: boolean;
    spoke?: string;
    scanId?: string;
}): string {
    return [
        'You are supervising CStar warden routing.',
        'Decide whether this warden request should execute now, replan through chant, or observe only.',
        'Choose execute_now for bounded anomaly and drift evaluation.',
        'Choose replan when the request needs decomposition, a broader mission, or different targeting.',
        'Choose observe_only when the system should report posture without mutating the debt ledger.',
        'Return JSON only.',
        JSON.stringify({
            workspace_root: input.workspaceRoot,
            aggressive: input.aggressive,
            spoke: input.spoke ?? null,
            scan_id: input.scanId ?? null,
            response_schema: {
                action: 'execute_now | replan | observe_only',
                reason: 'string',
            },
        }, null, 2),
    ].join('\n\n');
}

function normalizeWardenDecision(raw: string): WardenSupervisorDecision | null {
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

export class WardenWeave implements RuntimeAdapter<WardenWeavePayload> {
    public readonly id = 'weave:warden';

    public constructor(
        private readonly dispatchPort: RuntimeDispatchPort,
        private readonly hostTextInvoker: hostBridge.HostTextInvoker = hostBridge.defaultHostTextInvoker,
    ) {}

    public async execute(
        invocation: WeaveInvocation<WardenWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const projectRoot = payload.project_root || context.workspace_root;
        const hostProvider = deps.resolveRuntimeHostProvider(context);

        if (hostProvider) {
            try {
                const raw = await this.hostTextInvoker({
                    provider: hostProvider,
                    projectRoot,
                    source: 'runtime:warden',
                    systemPrompt: 'Return JSON only. Decide warden routing.',
                    prompt: buildWardenSupervisorPrompt({
                        workspaceRoot: projectRoot,
                        aggressive: Boolean(payload.aggressive),
                        spoke: payload.spoke,
                        scanId: payload.scan_id,
                    }),
                    env: { ...process.env, ...context.env } as NodeJS.ProcessEnv,
                    metadata: {
                        runtime_weave: 'warden',
                        decision: 'warden-supervisor',
                        trace_critical: true,
                        require_agent_harness: true,
                        transport_mode: 'host_session',
                    },
                });
                const decision = normalizeWardenDecision(raw);
                if (decision?.action === 'observe_only') {
                    return {
                        weave_id: this.id,
                        status: 'TRANSITIONAL',
                        output: `[ALFRED]: Warden observation only. ${decision.reason ?? 'No ledger update requested.'}`.trim(),
                        metadata: {
                            supervisor_decision: decision.action,
                            supervisor_reason: decision.reason,
                            aggressive: Boolean(payload.aggressive),
                            spoke: payload.spoke ?? null,
                            scan_id: payload.scan_id ?? null,
                        },
                    };
                }
                if (decision?.action === 'replan') {
                    const chantResult = await this.dispatchPort.dispatch(inheritTraceInvocation({
                        weave_id: 'weave:chant',
                        payload: {
                            query: `Replan warden evaluation${payload.spoke ? ` for spoke ${payload.spoke}` : ''}${payload.aggressive ? ' with aggressive anomaly focus' : ''}`,
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
                            aggressive: Boolean(payload.aggressive),
                            spoke: payload.spoke ?? null,
                            scan_id: payload.scan_id ?? null,
                        },
                    };
                }
            } catch {
                // Fall through to bounded local execution.
            }
        }

        const warden = deps.createWarden();
        await warden.evaluateProjection(projectRoot, payload.scan_id);

        return {
            weave_id: this.id,
            status: 'SUCCESS',
            output: `[ALFRED]: Warden evaluation complete. Drift and anomaly ledger refreshed${payload.aggressive ? ' under aggressive posture' : ''}.`,
            metadata: {
                aggressive: Boolean(payload.aggressive),
                spoke: payload.spoke ?? null,
                scan_id: payload.scan_id ?? null,
                ledger_refreshed: true,
            },
        };
    }
}
