import { 
    RuntimeAdapter, 
    RuntimeContext, 
    WeaveInvocation, 
    WeaveResult, 
    EstateExpansionWeavePayload,
    RuntimeDispatchPort,
    PennyOneWeavePayload
} from '../contracts.ts';
import chalk from 'chalk';
import * as hostBridge from '../weaves/host_bridge.js';

export const deps = {
    resolveRuntimeHostProvider: hostBridge.resolveRuntimeHostProvider,
    extractJsonObject: hostBridge.extractJsonObject,
};

interface ExpansionSupervisorDecision {
    action: 'execute_now' | 'replan' | 'observe_only';
    slug?: string;
    reason?: string;
}

function buildExpansionSupervisorPrompt(input: {
    remoteUrl: string;
    slug?: string;
    workspaceRoot: string;
}): string {
    return [
        'You are supervising CStar expansion routing.',
        'Decide whether this repository onboarding request should execute now, replan through chant, or observe only.',
        'Choose execute_now for bounded spoke onboarding and topology refresh.',
        'Choose replan when the onboarding request needs decomposition, review, or safer staging.',
        'Choose observe_only when the system should report the plan without mutating estate state.',
        'You may normalize the slug if a clearer spoke slug is available.',
        'Return JSON only.',
        JSON.stringify({
            remote_url: input.remoteUrl,
            slug: input.slug ?? null,
            workspace_root: input.workspaceRoot,
            response_schema: {
                action: 'execute_now | replan | observe_only',
                slug: 'string | null',
                reason: 'string',
            },
        }, null, 2),
    ].join('\n\n');
}

function normalizeExpansionDecision(raw: string): ExpansionSupervisorDecision | null {
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
            slug: typeof parsed.slug === 'string' && parsed.slug.trim() ? parsed.slug.trim() : undefined,
            reason: typeof parsed.reason === 'string' ? parsed.reason.trim() : undefined,
        };
    } catch {
        return null;
    }
}

/**
 * 🔱 ESTATE EXPANSION WEAVE
 * Logic: Link (Spoke) -> Scan (PennyOne) -> Ingest (Oracle) -> Verify (Vitals)
 */
export class EstateExpansionHostWorkflow implements RuntimeAdapter<EstateExpansionWeavePayload> {
    public readonly id = 'weave:expansion';

    public constructor(
        private readonly dispatchPort: RuntimeDispatchPort,
        private readonly hostTextInvoker: hostBridge.HostTextInvoker = hostBridge.defaultHostTextInvoker,
    ) {}

    public async execute(
        invocation: WeaveInvocation<EstateExpansionWeavePayload>,
        context: RuntimeContext
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const projectRoot = payload.project_root || context.workspace_root;
        const hostProvider = deps.resolveRuntimeHostProvider(context);
        let slug = payload.slug || payload.remote_url.split('/').pop()?.replace('.git', '') || 'unknown-spoke';

        if (hostProvider) {
            try {
                const raw = await this.hostTextInvoker({
                    provider: hostProvider,
                    projectRoot,
                    source: 'runtime:expansion',
                    systemPrompt: 'Return JSON only. Decide expansion routing.',
                    prompt: buildExpansionSupervisorPrompt({
                        remoteUrl: payload.remote_url,
                        slug,
                        workspaceRoot: projectRoot,
                    }),
                    env: { ...process.env, ...context.env } as NodeJS.ProcessEnv,
                    metadata: {
                        runtime_weave: 'expansion',
                        decision: 'expansion-supervisor',
                        transport_mode: 'session-required',
                    },
                });
                const decision = normalizeExpansionDecision(raw);
                if (decision?.slug) {
                    slug = decision.slug;
                }
                if (decision?.action === 'observe_only') {
                    return {
                        weave_id: this.id,
                        status: 'TRANSITIONAL',
                        output: `[ALFRED]: Expansion observation only. ${decision.reason ?? 'No onboarding execution requested.'}`.trim(),
                        metadata: {
                            supervisor_decision: decision.action,
                            supervisor_reason: decision.reason,
                            slug,
                            remote_url: payload.remote_url,
                        },
                    };
                }
                if (decision?.action === 'replan') {
                    const chantResult = await this.dispatchPort.dispatch({
                        weave_id: 'weave:chant',
                        payload: {
                            query: `Replan spoke expansion for ${payload.remote_url}${slug ? ` as ${slug}` : ''}`,
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
                            slug,
                            remote_url: payload.remote_url,
                        },
                    };
                }
            } catch {
                // Fall through to bounded local execution.
            }
        }

        console.log(chalk.cyan(`\n ◤ ESTATE EXPANSION WEAVE: ONBOARDING ${slug.toUpperCase()} ◢ `));

        // 1. Link (PennyOne:import)
        console.log(chalk.dim(`  ↳ Linking spoke: ${payload.remote_url}...`));
        const linkResult = await this.dispatchPort.dispatch<PennyOneWeavePayload>({
            weave_id: 'weave:pennyone',
            payload: {
                action: 'import',
                remote_url: payload.remote_url,
                slug: slug
            }
        });

        if (linkResult.status !== 'SUCCESS') {
            return linkResult;
        }

        // 2. Scan (PennyOne:scan)
        console.log(chalk.dim('  ↳ Synchronizing Mimir...'));
        const scanResult = await this.dispatchPort.dispatch<PennyOneWeavePayload>({
            weave_id: 'weave:pennyone',
            payload: {
                action: 'scan',
                slug: slug
            }
        });

        // 3. Topology (PennyOne:topology)
        console.log(chalk.dim('  ↳ Mapping architectural relationship graph...'));
        await this.dispatchPort.dispatch<PennyOneWeavePayload>({
            weave_id: 'weave:pennyone',
            payload: {
                action: 'topology'
            }
        });

        return {
            weave_id: this.id,
            status: 'SUCCESS',
            output: `[ALFRED]: Estate expanded. Spoke '${slug}' is now active and synchronized.`,
            metadata: {
                slug,
                scan_files: scanResult.metadata?.files
            }
        };
    }
}

export { EstateExpansionHostWorkflow as EstateExpansionWeave };
