import * as database from  '../../../../tools/pennyone/intel/database.js';
import { registry } from  '../../../../tools/pennyone/pathRegistry.js';
import {
    explainCapabilityHostSupport,
    getCapabilityHostSupport,
    resolveHostProvider,
} from '../../../../core/host_session.js';
import * as hostBridge from '../weaves/host_bridge.js';
import type {
    RuntimeAdapter,
    RuntimeDispatchPort,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
    ChantWeavePayload,
} from '../contracts.ts';
import * as parser from  './chant_parser.js';
import * as planner from  './chant_planner.js';

export const deps = {
    database: Object.assign({}, database),
    registry: registry,
    parser: Object.assign({}, parser),
    planner: Object.assign({}, planner),
    hostTextInvoker: hostBridge.defaultHostTextInvoker,
};

function shouldPreferPlanningLoop(lowerTokens: string[], existingSession: unknown): boolean {
    if (existingSession) return true;
    if (lowerTokens.length >= 4) return true;
    const planningHints = new Set([
        'plan',
        'planning',
        'help',
        'how',
        'improve',
        'shape',
        'prepare',
        'design',
        'roadmap',
    ]);
    return lowerTokens.some((token) => planningHints.has(token));
}

function parsePlanningPreference(raw: string): boolean | null {
    try {
        const parsed = hostBridge.extractJsonObject(raw);
        return parsed.prefer_planning === true;
    } catch {
        return null;
    }
}

function buildPlanningPreferencePrompt(input: {
    normalizedIntent: string;
    lowerTokens: string[];
    heuristicPreferPlanning: boolean;
    activeHostProvider: string;
}): string {
    return [
        'You are supervising CStar chant routing.',
        'Decide only whether this request should enter the collaborative planning loop before any generic intent-category fallback runs.',
        'Prefer planning for architecture, ambiguity, decomposition, or multi-step work.',
        'Prefer direct routing only when the request is plainly actionable without decomposition.',
        'Return JSON only.',
        JSON.stringify({
            provider: input.activeHostProvider,
            normalized_intent: input.normalizedIntent,
            tokens: input.lowerTokens,
            heuristic_prefer_planning: input.heuristicPreferPlanning,
            response_schema: {
                prefer_planning: 'boolean',
                reason: 'string',
            },
        }, null, 2),
    ].join('\n\n');
}

async function resolvePlanningPreference(input: {
    payload: ChantWeavePayload;
    context: RuntimeContext;
    normalizedIntent: string;
    lowerTokens: string[];
    existingSession: unknown;
    activeHostProvider: ReturnType<typeof resolveHostProvider>;
}): Promise<boolean> {
    if (input.existingSession) {
        return true;
    }

    const heuristicPreferPlanning = shouldPreferPlanningLoop(input.lowerTokens, input.existingSession);
    if (!input.activeHostProvider) {
        return heuristicPreferPlanning;
    }

    try {
        const defaultTimeoutMs = input.activeHostProvider === 'codex' && process.env.CODEX_SHELL !== '1'
            ? 300000
            : 12000;
        const timeoutMsRaw = Number(
            process.env.CSTAR_CHANT_HOST_TIMEOUT_MS
            ?? process.env.CSTAR_HOST_SESSION_TIMEOUT_MS
            ?? process.env.CORVUS_HOST_SESSION_TIMEOUT_MS
            ?? defaultTimeoutMs,
        );
        const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : defaultTimeoutMs;
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        const raw = await (async () => {
            try {
                return await Promise.race([
                    deps.hostTextInvoker({
                        prompt: buildPlanningPreferencePrompt({
                            normalizedIntent: input.normalizedIntent,
                            lowerTokens: input.lowerTokens,
                            heuristicPreferPlanning,
                            activeHostProvider: input.activeHostProvider,
                        }),
                        systemPrompt: 'Return JSON only. Decide whether chant should enter the planning loop.',
                        provider: input.activeHostProvider,
                        projectRoot: input.payload.project_root,
                        source: 'chant:planning-preference',
                        env: { ...process.env, ...input.context.env } as NodeJS.ProcessEnv,
                        metadata: {
                            runtime_weave: 'chant',
                            decision: 'planning-preference',
                            heuristic_prefer_planning: heuristicPreferPlanning,
                            transport_mode: 'host_session',
                        },
                    }),
                    new Promise<string>((_, reject) => {
                        timeoutHandle = setTimeout(() => reject(new Error(`chant planning-preference timeout after ${timeoutMs}ms`)), timeoutMs);
                    }),
                ]);
            } finally {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }
            }
        })();
        return parsePlanningPreference(raw) ?? heuristicPreferPlanning;
    } catch {
        return heuristicPreferPlanning;
    }
}

export class ChantHostWorkflow implements RuntimeAdapter<ChantWeavePayload> {
    public readonly id = 'weave:chant';

    public constructor(private readonly dispatchPort: RuntimeDispatchPort) {}

    public async execute(
        invocation: WeaveInvocation<ChantWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = {
            ...invocation.payload,
            project_root: invocation.payload.project_root || context.workspace_root || invocation.payload.cwd,
        };
        const normalizedIntent = deps.parser.normalizeIntent(payload.query);
        const tokens = deps.parser.tokenize(normalizedIntent);
        const lowerTokens = tokens.map((token) => token.toLowerCase());
        const skills = deps.parser.loadSkillTriggers(payload.project_root);
        const registryManifest = deps.parser.loadRegistryManifest(payload.project_root);
        const activeHostProvider = resolveHostProvider(context.env);
        const existingSession = context.session_id ? deps.database.getHallPlanningSession(context.session_id) : null;
        const planningPreferred = await resolvePlanningPreference({
            payload,
            context,
            normalizedIntent,
            lowerTokens,
            existingSession,
            activeHostProvider,
        });
        
        // Fast-Track bypasses planning if it's a direct command or we aren't in a planning loop
        const isPlanningLoop = existingSession !== null && existingSession.status !== 'COMPLETED' && existingSession.status !== 'FAILED';
        const builtIn = isPlanningLoop ? null : deps.parser.resolveBuiltInWeave(lowerTokens, payload, normalizedIntent);
        const registryResolution = builtIn ? null : deps.parser.resolveRegistryInvocation(tokens, payload, registryManifest, activeHostProvider);
        const skillResolution = (builtIn || registryResolution) ? null : deps.parser.resolveSkillInvocation(tokens, payload, skills);
        // Intent Category resolution is now a fallback after registry-backed direct resolution.
        const intentResolution = (builtIn || registryResolution || skillResolution || planningPreferred)
            ? null
            : deps.parser.resolveByIntentCategory(lowerTokens, payload);
        const resolution = builtIn ?? registryResolution ?? skillResolution ?? intentResolution;

        deps.registry.setRoot(context.workspace_root);

        if (resolution?.kind === 'missing_capability') {
            this.recordObservation(context, normalizedIntent, 'MISSING_CAPABILITY', resolution, [], undefined, {
                planning_session_id: context.session_id,
            });
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: resolution.summary,
                metadata: {
                    normalized_intent: normalizedIntent,
                    selected_path: null,
                    emitted_beads: [],
                    resolution: resolution.kind,
                    missing_capability: resolution.trigger,
                    planning_session_id: context.session_id ?? null,
                },
            };
        }

        if (resolution?.kind === 'policy_only') {
            this.recordObservation(context, normalizedIntent, 'POLICY_ONLY', resolution, [], undefined, {
                spell_classification: resolution.spell_classification,
                planning_session_id: context.session_id,
            });
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: resolution.summary,
                metadata: {
                    normalized_intent: normalizedIntent,
                    selected_path: resolution.trigger,
                    emitted_beads: [],
                    resolution: 'policy_only',
                    spell_classification: resolution.spell_classification,
                    planning_session_id: context.session_id ?? null,
                },
            };
        }

        if (resolution?.kind === 'unsupported_host') {
            this.recordObservation(context, normalizedIntent, 'UNSUPPORTED_HOST', resolution, [], undefined, {
                host_provider: activeHostProvider,
                host_support_status: resolution.host_support_status,
                planning_session_id: context.session_id,
            });
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: resolution.summary,
                metadata: {
                    normalized_intent: normalizedIntent,
                    selected_path: resolution.trigger,
                    emitted_beads: [],
                    resolution: 'unsupported_host',
                    host_provider: activeHostProvider,
                    host_support_status: resolution.host_support_status,
                    planning_session_id: context.session_id ?? null,
                },
            };
        }

        if (resolution && payload.dry_run) {
            this.recordObservation(context, normalizedIntent, 'DRY_RUN', resolution, [], undefined, {
                planning_session_id: context.session_id,
            });
            return {
                weave_id: this.id,
                status: 'SUCCESS',
                output: `${resolution.summary} Dry run only.`,
                metadata: {
                    normalized_intent: normalizedIntent,
                    selected_path: resolution.trigger,
                    emitted_beads: [],
                    resolution: resolution.kind,
                    planning_session_id: context.session_id ?? null,
                },
            };
        }

        if (resolution) {
            const hostSupportStatus = activeHostProvider
                ? getCapabilityHostSupport(payload.project_root, resolution.trigger, activeHostProvider)
                : null;
            const hostSupportError = activeHostProvider
                ? explainCapabilityHostSupport(payload.project_root, resolution.trigger, activeHostProvider)
                : null;
            if (hostSupportError) {
                this.recordObservation(context, normalizedIntent, 'UNSUPPORTED_HOST', resolution, [], undefined, {
                    host_provider: activeHostProvider,
                    host_support_status: hostSupportStatus,
                    planning_session_id: context.session_id,
                });
                return {
                    weave_id: this.id,
                    status: 'FAILURE',
                    output: '',
                    error: hostSupportError,
                    metadata: {
                        normalized_intent: normalizedIntent,
                        selected_path: resolution.trigger,
                        emitted_beads: [],
                        resolution: 'unsupported_host',
                        host_provider: activeHostProvider,
                        host_support_status: hostSupportStatus,
                        planning_session_id: context.session_id ?? null,
                    },
                };
            }

            const childResult = await this.dispatchPort.dispatch({
                ...resolution.invocation,
                session: {
                    mode: 'subkernel',
                    interactive: false,
                    session_id: context.session_id,
                },
            });
            const emittedBeads = Array.isArray(childResult.metadata?.emitted_beads)
                ? (childResult.metadata?.emitted_beads as string[])
                : [];
            const outcome = childResult.status === 'FAILURE' ? 'FAILURE' : 'SUCCESS';
            this.recordObservation(context, normalizedIntent, outcome, resolution, emittedBeads, childResult, {
                planning_session_id: context.session_id,
            });

            if (childResult.status === 'FAILURE') {
                return {
                    weave_id: this.id,
                    status: 'FAILURE',
                    output: '',
                    error: childResult.error ?? `Chant resolved to '${resolution.trigger}' but execution failed.`,
                    metadata: {
                        normalized_intent: normalizedIntent,
                        selected_path: resolution.trigger,
                        emitted_beads: emittedBeads,
                        resolution: resolution.kind,
                        child_weave_id: resolution.invocation.weave_id,
                        planning_session_id: context.session_id ?? null,
                    },
                };
            }

            return {
                weave_id: this.id,
                status: 'SUCCESS',
                output: `${resolution.summary} ${childResult.output}`.trim(),
                metadata: {
                    normalized_intent: normalizedIntent,
                    selected_path: resolution.trigger,
                    emitted_beads: emittedBeads,
                    resolution: resolution.kind,
                    child_weave_id: resolution.invocation.weave_id,
                    child_status: childResult.status,
                    planning_session_id: context.session_id ?? null,
                },
            };
        }

        return deps.planner.runPlanningLoop(
            this.dispatchPort,
            invocation,
            context,
            existingSession,
            normalizedIntent,
            lowerTokens
        );
    }

    private recordObservation(
        context: RuntimeContext,
        normalizedIntent: string,
        outcome: string,
        resolution: parser.DirectChantResolution,
        emittedBeads: string[],
        childResult?: WeaveResult,
        extraMetadata?: Record<string, unknown>,
    ): void {
        const metadata = {
            selected_path: resolution.trigger,
            resolution: resolution.kind,
            emitted_beads: emittedBeads,
        };

        deps.database.saveHallSkillObservation({
            observation_id: `chant:${context.trace_id}:${Date.now()}`,
            repo_id: `repo:${context.workspace_root.replace(/\\/g, '/')}`,
            skill_id: 'chant',
            outcome,
            observation: normalizedIntent,
            created_at: Date.now(),
            metadata: {
                ...metadata,
                child_weave_id: childResult?.weave_id,
                child_status: childResult?.status,
                child_output: childResult?.output,
                ...extraMetadata,
            },
        });
    }
}

export { ChantHostWorkflow as ChantWeave };
