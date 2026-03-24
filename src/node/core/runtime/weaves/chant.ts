import * as database from  '../../../../tools/pennyone/intel/database.js';
import { registry } from  '../../../../tools/pennyone/pathRegistry.js';
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
};

export class ChantWeave implements RuntimeAdapter<ChantWeavePayload> {
    public readonly id = 'weave:chant';

    public constructor(private readonly dispatchPort: RuntimeDispatchPort) {}

    public async execute(
        invocation: WeaveInvocation<ChantWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const normalizedIntent = deps.parser.normalizeIntent(payload.query);
        const tokens = deps.parser.tokenize(normalizedIntent);
        const lowerTokens = tokens.map((token) => token.toLowerCase());
        const skills = deps.parser.loadSkillTriggers(payload.project_root);
        const existingSession = context.session_id ? deps.database.getHallPlanningSession(context.session_id) : null;
        
        // Fast-Track bypasses planning if it's a direct command or we aren't in a planning loop
        const isPlanningLoop = existingSession !== null && existingSession.status !== 'COMPLETED' && existingSession.status !== 'FAILED';
        const builtIn = isPlanningLoop ? null : deps.parser.resolveBuiltInWeave(lowerTokens, payload, normalizedIntent);
        const skillResolution = builtIn ? null : deps.parser.resolveSkillInvocation(tokens, payload, skills);
        // Intent Category resolution: the closed grammar routes when exact matching fails
        const intentResolution = (builtIn || skillResolution) ? null : deps.parser.resolveByIntentCategory(lowerTokens, payload);
        const resolution = builtIn ?? skillResolution ?? intentResolution;

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
            const childResult = await this.dispatchPort.dispatch(resolution.invocation);
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
