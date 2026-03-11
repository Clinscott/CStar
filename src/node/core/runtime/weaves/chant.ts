import fs from 'node:fs';
import path from 'node:path';

import {
    getHallPlanningSession,
    saveHallPlanningSession,
    saveHallSkillObservation,
    upsertHallBead,
} from '../../../../tools/pennyone/intel/database.ts';
import { registry } from '../../../../tools/pennyone/pathRegistry.ts';
import type {
    HallBeadRecord,
    HallBeadTargetKind,
    HallPlanningSessionRecord,
    HallPlanningSessionStatus,
} from '../../../../types/hall.ts';
import { buildHallRepositoryId, normalizeHallPath } from '../../../../types/hall.ts';
import type {
    RuntimeAdapter,
    RuntimeDispatchPort,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
    ChantWeavePayload,
} from '../contracts.ts';

type DirectChantResolution =
    | {
          kind: 'weave';
          trigger: string;
          invocation: WeaveInvocation<unknown>;
          summary: string;
      }
    | {
          kind: 'skill';
          trigger: string;
          invocation: WeaveInvocation<unknown>;
          summary: string;
      }
    | {
          kind: 'missing_capability';
          trigger: string;
          summary: string;
      };

interface PlanningTargetIdentity {
    target_kind: HallBeadTargetKind;
    target_ref?: string;
    target_path?: string;
}

interface PlanningResolution {
    kind: 'planning';
    session_id: string;
    status: Extract<HallPlanningSessionStatus, 'NEEDS_INPUT' | 'PLAN_READY'>;
    summary: string;
    follow_up_questions: string[];
    latest_question?: string;
    emitted_beads: string[];
    target: PlanningTargetIdentity;
}

interface PlanningTurn {
    role: 'user' | 'system';
    content: string;
    at: number;
}

const CONTROL_WORDS = new Set(['chant', 'use', 'run', 'invoke']);
const PLANNING_TERMS = [
    'actualize',
    'analyze',
    'audit',
    'build',
    'create',
    'design',
    'enable',
    'evolve',
    'expand',
    'fix',
    'implement',
    'improve',
    'investigate',
    'make',
    'mount',
    'optimize',
    'orchestrate',
    'plan',
    'refine',
    'refactor',
    'rethink',
    'review',
    'support',
];
const TARGET_TERMS = [
    'bead',
    'brain',
    'chant',
    'corvus',
    'estate',
    'evolve',
    'forge',
    'hall',
    'kernel',
    'matrix',
    'pennyone',
    'plan',
    'repo',
    'repository',
    'ravens',
    'search',
    'skill',
    'spoke',
    'system',
    'topology',
    'tui',
    'validation',
];
const VAGUE_TOKENS = new Set(['this', 'that', 'it', 'something', 'stuff', 'things']);

function tokenize(query: string): string[] {
    return query
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

function normalizeIntent(query: string): string {
    return query.trim().replace(/\s+/g, ' ');
}

function hasAnyToken(tokens: string[], values: string[]): boolean {
    return values.some((value) => tokens.includes(value));
}

function loadSkillTriggers(projectRoot: string): Set<string> {
    const manifestPath = path.join(projectRoot, '.agents', 'skill_registry.json');
    if (!fs.existsSync(manifestPath)) {
        return new Set();
    }

    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
            skills?: Record<string, unknown>;
        };
        return new Set(Object.keys(manifest.skills ?? {}).map((entry) => entry.toLowerCase()));
    } catch {
        return new Set();
    }
}

function buildDynamicSkillInvocation(
    command: string,
    args: string[],
    projectRoot: string,
    cwd: string,
): WeaveInvocation<{ command: string; args: string[]; project_root: string; cwd: string }> {
    return {
        weave_id: 'weave:dynamic-command',
        payload: {
            command,
            args,
            project_root: projectRoot,
            cwd,
        },
    };
}

function resolveBuiltInWeave(
    lowerTokens: string[],
    payload: ChantWeavePayload,
    normalizedIntent: string,
): DirectChantResolution | null {
    const [head, second, ...rest] = lowerTokens;

    if (head === 'ravens') {
        const action = second === 'start' || second === 'stop' || second === 'status' || second === 'cycle' || second === 'sweep'
            ? second
            : 'status';
        return {
            kind: 'weave',
            trigger: 'ravens',
            invocation: {
                weave_id: 'weave:ravens',
                payload: {
                    action,
                    shadow_forge: rest.includes('--shadow-forge'),
                },
            },
            summary: `Resolved chant to ravens lifecycle action '${action}'.`,
        };
    }

    if (
        lowerTokens.includes('ravens') &&
        (hasAnyToken(lowerTokens, ['release', 'fly', 'sweep', 'status', 'cycle', 'start', 'stop']) ||
            /\brelease the ravens\b/i.test(normalizedIntent))
    ) {
        let action: 'start' | 'stop' | 'status' | 'cycle' | 'sweep' = 'cycle';
        if (lowerTokens.includes('status')) {
            action = 'status';
        } else if (lowerTokens.includes('stop')) {
            action = 'stop';
        } else if (lowerTokens.includes('start')) {
            action = 'start';
        } else if (hasAnyToken(lowerTokens, ['sweep', 'estate', 'spokes', 'repos', 'repositories', 'all'])) {
            action = 'sweep';
        }

        return {
            kind: 'weave',
            trigger: 'ravens',
            invocation: {
                weave_id: 'weave:ravens',
                payload: {
                    action,
                    shadow_forge: lowerTokens.includes('shadow-forge'),
                },
            },
            summary: `Resolved chant to natural-language ravens action '${action}'.`,
        };
    }

    if (head === 'scan' || (head === 'pennyone' && (second === undefined || second === 'scan'))) {
        return {
            kind: 'weave',
            trigger: 'pennyone',
            invocation: {
                weave_id: 'weave:pennyone',
                payload: {
                    action: 'scan',
                    path: '.',
                },
            },
            summary: 'Resolved chant to PennyOne repository scan.',
        };
    }

    if (
        (lowerTokens.includes('pennyone') || lowerTokens.includes('matrix')) &&
        hasAnyToken(lowerTokens, ['scan', 'search', 'view'])
    ) {
        const action = lowerTokens.includes('search') ? 'search' : lowerTokens.includes('view') ? 'view' : 'scan';
        const queryIndex = lowerTokens.indexOf('search');
        return {
            kind: 'weave',
            trigger: 'pennyone',
            invocation: {
                weave_id: 'weave:pennyone',
                payload: {
                    action,
                    path: '.',
                    query: queryIndex >= 0 ? tokenize(normalizedIntent).slice(queryIndex + 1).join(' ') : undefined,
                },
            },
            summary: `Resolved chant to PennyOne ${action}.`,
        };
    }

    if (head === 'start' || (lowerTokens.includes('corvus') && lowerTokens.includes('start'))) {
        return {
            kind: 'weave',
            trigger: 'start',
            invocation: {
                weave_id: 'weave:start',
                payload: {
                    target: undefined,
                    task: payload.query,
                    ledger: path.join(payload.project_root, '.agents', 'ledger'),
                },
            },
            summary: 'Resolved chant to runtime start weave.',
        };
    }

    return null;
}

function resolveSkillInvocation(tokens: string[], payload: ChantWeavePayload, skills: Set<string>): DirectChantResolution | null {
    const lowerTokens = tokens.map((token) => token.toLowerCase());
    const lead = lowerTokens[0] ?? '';
    const candidate = CONTROL_WORDS.has(lead) ? lowerTokens[1] ?? '' : lead;
    const originalArgs = CONTROL_WORDS.has(lead) ? tokens.slice(2) : tokens.slice(1);

    if (candidate && skills.has(candidate) && candidate !== 'chant') {
        return {
            kind: 'skill',
            trigger: candidate,
            invocation: buildDynamicSkillInvocation(candidate, originalArgs, payload.project_root, payload.cwd),
            summary: `Resolved chant to skill '${candidate}'.`,
        };
    }

    if (CONTROL_WORDS.has(lead) && candidate) {
        return {
            kind: 'missing_capability',
            trigger: candidate,
            summary: `The requested capability '${candidate}' is not installed in the authoritative skill registry.`,
        };
    }

    for (const token of lowerTokens) {
        if (skills.has(token) && token !== 'chant') {
            return {
                kind: 'skill',
                trigger: token,
                invocation: buildDynamicSkillInvocation(token, [], payload.project_root, payload.cwd),
                summary: `Resolved chant to inline skill '${token}'.`,
            };
        }
    }

    return null;
}

function extractFileTarget(normalizedIntent: string): string | undefined {
    const match = normalizedIntent.match(
        /(?:[A-Za-z]:)?(?:[\\/][\w.\- ]+)+|(?:\.{1,2}[\\/][\w.\- ]+)+|[\w.\-]+(?:[\\/][\w.\- ]+)+|(?:\.[A-Za-z0-9._-]+)/,
    );
    if (!match) {
        return undefined;
    }
    const candidate = match[0].trim();
    if (!candidate.includes('/') && !candidate.includes('\\') && !candidate.startsWith('.')) {
        return undefined;
    }
    return normalizeHallPath(candidate);
}

function inferPlanningTarget(normalizedIntent: string, repoId: string): PlanningTargetIdentity {
    const fileTarget = extractFileTarget(normalizedIntent);
    if (fileTarget) {
        return {
            target_kind: 'FILE',
            target_ref: fileTarget,
            target_path: fileTarget,
        };
    }

    if (/\b(spoke|keepos|astrologer|securesphere|corvuseye|xo)\b/i.test(normalizedIntent)) {
        return {
            target_kind: 'SPOKE',
            target_ref: normalizedIntent.match(/\b(keepos|astrologer|securesphere|corvuseye|xo)\b/i)?.[1]?.toLowerCase(),
        };
    }

    if (/\b(contract|skill)\b/i.test(normalizedIntent)) {
        return {
            target_kind: 'CONTRACT',
            target_ref: 'skill-contract',
        };
    }

    if (/\b(validation|crucible|sprt|gungnir)\b/i.test(normalizedIntent)) {
        return {
            target_kind: 'VALIDATION',
            target_ref: 'validation',
        };
    }

    if (/\b(repo|repository|estate|brain|corvus star|kernel|system)\b/i.test(normalizedIntent)) {
        return {
            target_kind: 'REPOSITORY',
            target_ref: repoId,
        };
    }

    return {
        target_kind: 'OTHER',
    };
}

function hasPlanningVerb(normalizedIntent: string): boolean {
    return PLANNING_TERMS.some((term) => normalizedIntent.toLowerCase().includes(term));
}

function hasConcreteTarget(normalizedIntent: string, lowerTokens: string[]): boolean {
    if (extractFileTarget(normalizedIntent)) {
        return true;
    }
    return hasAnyToken(lowerTokens, TARGET_TERMS);
}

function buildClarifyingQuestions(normalizedIntent: string, lowerTokens: string[], hasExistingSession: boolean): string[] {
    const questions: string[] = [];
    if (!hasConcreteTarget(normalizedIntent, lowerTokens)) {
        questions.push('Which repo, spoke, bead, or file should this plan target?');
    }
    if (!hasPlanningVerb(normalizedIntent)) {
        questions.push('What outcome do you want Corvus Star to produce or improve?');
    }
    if (!hasAnyToken(lowerTokens, ['validate', 'validation', 'test', 'review', 'forge', 'orchestrate', 'swarm'])) {
        questions.push(
            hasExistingSession
                ? 'What validation or execution constraints should the plan respect?'
                : 'Should this stay collaborative, or should I prepare an execution bead for orchestration?',
        );
    }

    return questions.slice(0, 3);
}

function buildPlanningSummary(normalizedIntent: string, target: PlanningTargetIdentity, followUp: boolean): string {
    const targetLabel = target.target_path ?? target.target_ref ?? target.target_kind.toLowerCase();
    const prefix = followUp ? 'Collaborative chant plan refined' : 'Collaborative chant plan ready';
    return `${prefix} for ${targetLabel}: ${normalizedIntent}`;
}

function buildPlanningTurns(
    existingSession: HallPlanningSessionRecord | null,
    userIntent: string,
    systemMessage: string,
    now: number,
): PlanningTurn[] {
    const existingTurns = Array.isArray(existingSession?.metadata?.turns)
        ? (existingSession?.metadata?.turns as PlanningTurn[])
        : [];
    const nextTurns: PlanningTurn[] = [
        ...existingTurns,
        { role: 'user', content: userIntent, at: now },
        { role: 'system', content: systemMessage, at: now },
    ];
    return nextTurns.slice(-12);
}

function buildPlanningResolution(
    normalizedIntent: string,
    context: RuntimeContext,
    existingSession: HallPlanningSessionRecord | null,
): PlanningResolution {
    const repoId = buildHallRepositoryId(normalizeHallPath(context.workspace_root));
    const lowerTokens = tokenize(normalizedIntent).map((token) => token.toLowerCase());
    const followUpQuestions = buildClarifyingQuestions(normalizedIntent, lowerTokens, existingSession !== null);
    const target = inferPlanningTarget(normalizedIntent, repoId);
    const shouldAskForInput =
        followUpQuestions.length > 0 &&
        (!hasConcreteTarget(normalizedIntent, lowerTokens) ||
            tokenize(normalizedIntent).length <= 4 ||
            lowerTokens.some((token) => VAGUE_TOKENS.has(token)));

    return {
        kind: 'planning',
        session_id: context.session_id ?? `chant-session:${context.trace_id}`,
        status: shouldAskForInput ? 'NEEDS_INPUT' : 'PLAN_READY',
        summary: shouldAskForInput
            ? 'Collaborative chant requires one more refinement pass before emitting a sovereign plan.'
            : buildPlanningSummary(normalizedIntent, target, existingSession !== null),
        follow_up_questions: shouldAskForInput ? followUpQuestions : [],
        latest_question: shouldAskForInput ? followUpQuestions[0] : undefined,
        emitted_beads: [],
        target,
    };
}

function buildPlanningMetadata(
    existingSession: HallPlanningSessionRecord | null,
    resolution: PlanningResolution,
    normalizedIntent: string,
    now: number,
): Record<string, unknown> {
    return {
        turns: buildPlanningTurns(
            existingSession,
            normalizedIntent,
            resolution.latest_question ?? resolution.summary,
            now,
        ),
        follow_up_questions: resolution.follow_up_questions,
        emitted_beads: resolution.emitted_beads,
        target: resolution.target,
    };
}

function buildPlanningBead(
    context: RuntimeContext,
    resolution: PlanningResolution,
    normalizedIntent: string,
    existingSession: HallPlanningSessionRecord | null,
    now: number,
): HallBeadRecord {
    const repoId = buildHallRepositoryId(normalizeHallPath(context.workspace_root));
    const beadId = `chant-plan:${resolution.session_id}`;
    const targetLabel = resolution.target.target_path ?? resolution.target.target_ref ?? 'estate-work';
    const acceptanceCriteria = [
        `Scope is confirmed for ${targetLabel}.`,
        'The resulting work is decomposed into executable sovereign beads or an approved orchestration request.',
        'Validation expectations are explicit before promotion or forge execution.',
    ].join(' ');

    return {
        bead_id: beadId,
        repo_id: repoId,
        target_kind: resolution.target.target_kind,
        target_ref: resolution.target.target_ref,
        target_path: resolution.target.target_path,
        rationale: normalizedIntent,
        contract_refs: [],
        baseline_scores: {},
        acceptance_criteria: acceptanceCriteria,
        status: 'NEEDS_TRIAGE',
        source_kind: 'CHANT_PLAN',
        triage_reason: resolution.summary,
        created_at: existingSession?.created_at ?? now,
        updated_at: now,
    };
}

export class ChantWeave implements RuntimeAdapter<ChantWeavePayload> {
    public readonly id = 'weave:chant';

    public constructor(private readonly dispatchPort: RuntimeDispatchPort) {}

    public async execute(
        invocation: WeaveInvocation<ChantWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const normalizedIntent = normalizeIntent(payload.query);
        const tokens = tokenize(normalizedIntent);
        const lowerTokens = tokens.map((token) => token.toLowerCase());
        const skills = loadSkillTriggers(payload.project_root);
        const existingSession = context.session_id ? getHallPlanningSession(context.session_id) : null;
        const sessionNeedsPlanning = existingSession?.status === 'NEEDS_INPUT'
            && !CONTROL_WORDS.has(lowerTokens[0] ?? '')
            && (lowerTokens[0] ?? '') !== 'ravens'
            && (lowerTokens[0] ?? '') !== 'pennyone'
            && (lowerTokens[0] ?? '') !== 'start';
        const builtIn = sessionNeedsPlanning ? null : resolveBuiltInWeave(lowerTokens, payload, normalizedIntent);
        const skillResolution = builtIn ? null : resolveSkillInvocation(tokens, payload, skills);
        const resolution = builtIn ?? skillResolution;

        registry.setRoot(context.workspace_root);

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

        const planningResolution = buildPlanningResolution(normalizedIntent, context, existingSession);
        const now = Date.now();
        const repoId = buildHallRepositoryId(normalizeHallPath(context.workspace_root));

        if (planningResolution.status === 'PLAN_READY') {
            const bead = buildPlanningBead(context, planningResolution, normalizedIntent, existingSession, now);
            upsertHallBead(bead);
            planningResolution.emitted_beads.push(bead.bead_id);
        }

        if (!payload.dry_run) {
            saveHallPlanningSession({
                session_id: planningResolution.session_id,
                repo_id: repoId,
                skill_id: 'chant',
                status: planningResolution.status,
                user_intent: existingSession?.user_intent ?? normalizedIntent,
                normalized_intent: existingSession
                    ? `${existingSession.normalized_intent}\nFOLLOW_UP: ${normalizedIntent}`
                    : normalizedIntent,
                summary: planningResolution.summary,
                latest_question: planningResolution.latest_question,
                created_at: existingSession?.created_at ?? now,
                updated_at: now,
                metadata: buildPlanningMetadata(existingSession, planningResolution, normalizedIntent, now),
            });
        }

        this.recordObservation(
            context,
            normalizedIntent,
            planningResolution.status,
            planningResolution,
            planningResolution.emitted_beads,
            undefined,
            {
                planning_session_id: planningResolution.session_id,
                follow_up_questions: planningResolution.follow_up_questions,
            },
        );

        return {
            weave_id: this.id,
            status: 'TRANSITIONAL',
            output:
                planningResolution.status === 'PLAN_READY'
                    ? `${planningResolution.summary} Bead ${planningResolution.emitted_beads[0]} is ready for triage.`
                    : `${planningResolution.summary} ${planningResolution.follow_up_questions.join(' ')}`.trim(),
            metadata: {
                normalized_intent: normalizedIntent,
                selected_path: planningResolution.target.target_ref ?? null,
                emitted_beads: planningResolution.emitted_beads,
                resolution: planningResolution.kind,
                planning_session_id: planningResolution.session_id,
                planning_status: planningResolution.status,
                follow_up_questions: planningResolution.follow_up_questions,
            },
        };
    }

    private recordObservation(
        context: RuntimeContext,
        normalizedIntent: string,
        outcome: string,
        resolution: DirectChantResolution | PlanningResolution,
        emittedBeads: string[],
        childResult?: WeaveResult,
        extraMetadata?: Record<string, unknown>,
    ): void {
        const metadata =
            resolution.kind === 'planning'
                ? {
                      selected_path: resolution.target.target_ref ?? resolution.target.target_path ?? null,
                      resolution: resolution.kind,
                      planning_status: resolution.status,
                      follow_up_questions: resolution.follow_up_questions,
                      emitted_beads: emittedBeads,
                  }
                : {
                      selected_path: resolution.trigger,
                      resolution: resolution.kind,
                      emitted_beads: emittedBeads,
                  };

        saveHallSkillObservation({
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
