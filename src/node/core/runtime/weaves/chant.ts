import fs from 'node:fs';
import path from 'node:path';

import {
    getHallBeads,
    getHallFileByPath,
    getHallPlanningSession,
    listHallBeadCritiques,
    listHallEpisodicMemory,
    saveHallPlanningSession,
    saveHallSkillObservation,
} from '../../../../tools/pennyone/intel/database.ts';
import { registry } from '../../../../tools/pennyone/pathRegistry.ts';
import type { HallPlanningSessionRecord } from '../../../../types/hall.ts';
import { buildHallRepositoryId, normalizeHallPath } from '../../../../types/hall.ts';
import type {
    AutobotWeavePayload,
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

const CONTROL_WORDS = new Set(['chant', 'use', 'run', 'invoke']);
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
const AUTOBOT_NOTE_LIMIT = 4_000;
const AUTOBOT_SECTION_LIMIT = 420;
const AUTOBOT_MEMORY_LIMIT = 2;
const AUTOBOT_CRITIQUE_LIMIT = 2;

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

function compactText(value: string | undefined, limit: number = AUTOBOT_SECTION_LIMIT): string | undefined {
    if (!value) {
        return undefined;
    }

    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return undefined;
    }

    if (normalized.length <= limit) {
        return normalized;
    }

    return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function compactJson(value: unknown, limit: number = AUTOBOT_SECTION_LIMIT): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    try {
        return compactText(JSON.stringify(value), limit);
    } catch {
        return undefined;
    }
}

function pushSection(lines: string[], label: string, value: string | undefined): void {
    if (value) {
        lines.push(`${label}: ${value}`);
    }
}

function finalizeAutobotNote(lines: string[]): string {
    const normalized = lines
        .map((line) => line.trimEnd())
        .filter(Boolean)
        .join('\n');
    if (normalized.length <= AUTOBOT_NOTE_LIMIT) {
        return normalized;
    }
    return `${normalized.slice(0, Math.max(0, AUTOBOT_NOTE_LIMIT - 1)).trimEnd()}…`;
}

function resolveAutobotBeadId(workspaceRoot: string, session: HallPlanningSessionRecord | null): string | undefined {
    const currentBeadId = session?.current_bead_id?.trim();
    if (currentBeadId) {
        return currentBeadId;
    }

    return getHallBeads(workspaceRoot, ['IN_PROGRESS', 'OPEN'])
        .find((bead) => Boolean((bead.target_path || bead.target_ref) && bead.acceptance_criteria))
        ?.id;
}

function getSessionStringMetadata(
    session: HallPlanningSessionRecord | null,
    keys: string[],
): string | undefined {
    const metadata = session?.metadata ?? {};
    for (const key of keys) {
        const value = metadata[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return undefined;
}

function getSessionNumberMetadata(
    session: HallPlanningSessionRecord | null,
    keys: string[],
): number | undefined {
    const metadata = session?.metadata ?? {};
    for (const key of keys) {
        const value = metadata[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string' && value.trim()) {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
    }
    return undefined;
}

function buildAutobotWorkerNote(
    workspaceRoot: string,
    beadId: string,
    session: HallPlanningSessionRecord | null,
): string {
    const bead = getHallBeads(workspaceRoot).find((candidate) => candidate.id === beadId);
    const fileIntel = bead?.target_path
        ? getHallFileByPath(bead.target_path, workspaceRoot, bead.scan_id || undefined)
        : null;
    const memories = listHallEpisodicMemory(workspaceRoot, beadId).slice(-AUTOBOT_MEMORY_LIMIT);
    const critiques = listHallBeadCritiques(beadId).slice(-AUTOBOT_CRITIQUE_LIMIT);
    const lines = [
        '32k AutoBot worker window. Use only the immediate context below unless the target file forces adjacent inspection.',
        'Chant assembled this brief from Hall and PennyOne for the active bead only.',
    ];

    pushSection(lines, 'Active bead', beadId);
    pushSection(lines, 'Planning intent', compactText(session?.user_intent));
    pushSection(lines, 'Planning summary', compactText(session?.summary));
    pushSection(lines, 'Latest planning focus', compactText(session?.latest_question));
    pushSection(lines, 'Target path', compactText(bead?.target_path ?? bead?.target_ref));
    pushSection(lines, 'Bead rationale', compactText(bead?.rationale));
    pushSection(lines, 'Acceptance criteria', compactText(bead?.acceptance_criteria, 520));
    pushSection(lines, 'Contract refs', compactText(bead?.contract_refs.join(', ')));
    pushSection(lines, 'Baseline scores', compactJson(bead?.baseline_scores, 240));
    pushSection(lines, 'Architect opinion', compactText(bead?.architect_opinion ?? session?.architect_opinion));
    pushSection(lines, 'PennyOne intent summary', compactText(fileIntel?.intent_summary));
    pushSection(lines, 'PennyOne interaction summary', compactText(fileIntel?.interaction_summary));
    pushSection(lines, 'PennyOne imports', compactText(fileIntel?.imports?.map((entry) => entry.imported || entry.source).join(', ')));
    pushSection(lines, 'PennyOne exports', compactText(fileIntel?.exports?.join(', ')));

    for (const [index, critique] of critiques.entries()) {
        const critiqueSummary = compactText(
            [
                critique.critique,
                critique.proposed_path ? `Path: ${critique.proposed_path}` : undefined,
                critique.architect_feedback ? `Architect: ${critique.architect_feedback}` : undefined,
            ]
                .filter(Boolean)
                .join(' '),
            320,
        );
        pushSection(lines, `Recent critique ${index + 1}`, critiqueSummary);
    }

    for (const [index, memory] of memories.entries()) {
        const memorySummary = compactText(
            [
                memory.tactical_summary,
                memory.successes && memory.successes.length > 0
                    ? `Successes: ${memory.successes.join(', ')}`
                    : undefined,
            ]
                .filter(Boolean)
                .join(' '),
            320,
        );
        pushSection(lines, `Recent episodic memory ${index + 1}`, memorySummary);
    }

    return finalizeAutobotNote(lines);
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
        
        // Fast-Track bypasses planning if it's a direct command or we aren't in a planning loop
        const isPlanningLoop = existingSession !== null && existingSession.status !== 'COMPLETED' && existingSession.status !== 'FAILED';
        const builtIn = isPlanningLoop ? null : resolveBuiltInWeave(lowerTokens, payload, normalizedIntent);
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

        // --- NEW MULTI-PHASE PLANNING ENGINE ---
        const now = Date.now();
        const repoId = buildHallRepositoryId(normalizeHallPath(context.workspace_root));
        const sessionId = existingSession?.session_id ?? `chant-session:${context.trace_id}`;
        
        let sessionStatus = existingSession?.status ?? 'INTENT_RECEIVED';
        let summary = 'Processing intent...';
        let architectOpinion: string | undefined = undefined;
        let activeBeadId = existingSession?.current_bead_id;

        // If we are passing input to an existing state (like "approve")
        if (existingSession && (lowerTokens.includes('approve') || lowerTokens.includes('yes') || lowerTokens.includes('proceed'))) {
             if (sessionStatus === 'PROPOSAL_REVIEW') {
                 sessionStatus = 'BEAD_CRITIQUE_LOOP';
             } else if (sessionStatus === 'BEAD_USER_REVIEW') {
                 sessionStatus = 'BEAD_CRITIQUE_LOOP'; // Move to next bead
             }
        }

        // We use a while loop to allow immediate state transitions without requiring the user to type "chant" again.
        // For example, if we enter INTENT_RECEIVED, it does the work, changes state to RESEARCH_PHASE, and immediately continues.
        let transitionOutput: WeaveResult | null = null;
        let executing = true;

        while (executing) {
            switch (sessionStatus) {
                case 'INTENT_RECEIVED':
                    summary = 'Intent received. Initiating Research Phase (Wild Hunt & Web Fetch).';
                    try {
                        const researchResult = await this.dispatchPort.dispatch({
                            weave_id: 'weave:research',
                            payload: {
                                intent: existingSession ? existingSession.user_intent : normalizedIntent,
                                project_root: payload.project_root,
                                cwd: payload.cwd,
                                dry_run: payload.dry_run
                            },
                            session: invocation.session,
                            target: invocation.target
                        });
                        
                        if (researchResult.status === 'TRANSITIONAL') {
                            // The weave is asking the CLI to do work. We must pause the loop and return this to the user/CLI.
                            transitionOutput = researchResult;
                            sessionStatus = 'RESEARCH_PHASE'; // When CLI replies, it will land here
                            executing = false;
                        } else if (researchResult.status === 'FAILURE') {
                            summary = `Research Phase failed: ${researchResult.error}`;
                            sessionStatus = 'FAILED';
                            executing = false;
                        } else {
                            summary = `Research Phase complete. ${researchResult.output}`;
                            sessionStatus = 'RESEARCH_PHASE';
                        }
                    } catch (err: any) {
                        summary = `Research Phase failed to dispatch: ${err.message}`;
                        sessionStatus = 'FAILED';
                        executing = false;
                    }
                    break;

                case 'RESEARCH_PHASE':
                    // In a full implementation, we would extract the CLI's JSON response from `normalizedIntent` here 
                    // and formulate the initial beads. For this loop, we transition to review.
                    summary = 'Research Phase complete. Building comprehensive proposal.';
                    sessionStatus = 'PROPOSAL_REVIEW';
                    executing = false; // Pause for user review
                    break;

                case 'PROPOSAL_REVIEW':
                    summary = 'Awaiting user approval of the current proposal. Type "approve" to proceed, or provide feedback.';
                    executing = false; // Stay here until they type "approve" (handled at top of loop)
                    break;

                case 'BEAD_CRITIQUE_LOOP':
                    summary = 'Executing Adversarial Co-Work Critique for current bead.';
                    try {
                        const critiqueResult = await this.dispatchPort.dispatch({
                            weave_id: 'weave:critique',
                            payload: {
                                bead: { title: 'Current Bead', rationale: 'To be implemented' }, 
                                research: { summary: 'Research data', research_artifacts: [] }, 
                                project_root: payload.project_root,
                                cwd: payload.cwd,
                            },
                            session: invocation.session,
                            target: invocation.target
                        });

                        if (critiqueResult.status === 'TRANSITIONAL') {
                             transitionOutput = critiqueResult;
                             // We don't change state, we stay in critique loop so the CLI can do the work
                             executing = false;
                        } else if (critiqueResult.status === 'FAILURE') {
                            summary = `Critique Phase failed: ${critiqueResult.error}`;
                            sessionStatus = 'FAILED';
                            executing = false;
                        } else {
                            sessionStatus = 'BEAD_USER_REVIEW';
                        }
                    } catch (err: any) {
                        summary = `Critique loop failed to dispatch: ${err.message}`;
                        sessionStatus = 'FAILED';
                        executing = false;
                    }
                    break;

                case 'BEAD_USER_REVIEW':
                     summary = 'Awaiting human adjudication for bead conflict.';
                     executing = false;
                     break;

                case 'PLAN_CONCRETE':
                    summary = 'Plan is concrete. Initiating Forge Execution sequence.';
                    sessionStatus = 'FORGE_EXECUTION';
                    break;

                case 'FORGE_EXECUTION':
                    summary = 'Executing current bead via AutoBot.';
                    try {
                        const currentBeadId = resolveAutobotBeadId(context.workspace_root, existingSession);
                        if (!currentBeadId) {
                            summary = 'No actionable bead is available for AutoBot handoff.';
                            sessionStatus = 'FAILED';
                            executing = false;
                            break;
                        }

                        activeBeadId = currentBeadId;
                        const autobotPayload: AutobotWeavePayload = {
                            bead_id: currentBeadId,
                            checker_shell: getSessionStringMetadata(existingSession, [
                                'checker_shell',
                                'checkerShell',
                                'autobot_checker_shell',
                            ]),
                            max_attempts: getSessionNumberMetadata(existingSession, [
                                'autobot_max_attempts',
                                'max_attempts',
                            ]),
                            worker_note: buildAutobotWorkerNote(context.workspace_root, currentBeadId, existingSession),
                            project_root: payload.project_root,
                            cwd: payload.cwd,
                            source: 'runtime',
                        };
                        const forgeResult = await this.dispatchPort.dispatch({
                            weave_id: 'weave:autobot',
                            payload: {
                                ...autobotPayload,
                            },
                            session: invocation.session,
                            target: invocation.target
                        });
                        const autobotOutcome = typeof forgeResult.metadata?.outcome === 'string'
                            ? forgeResult.metadata.outcome
                            : undefined;

                        if (forgeResult.status === 'FAILURE') {
                            summary = forgeResult.error ?? `AutoBot failed to complete bead ${currentBeadId}.`;
                            sessionStatus = autobotOutcome === 'BLOCKED' ? 'BEAD_USER_REVIEW' : 'FAILED';
                            executing = false;
                        } else {
                            summary = forgeResult.output || `AutoBot completed bead ${currentBeadId}.`;
                            sessionStatus = autobotOutcome === 'RESOLVED' ? 'COMPLETED' : 'BEAD_USER_REVIEW';
                            executing = false;
                        }
                    } catch (err: any) {
                        summary = `Forge execution failed to dispatch: ${err.message}`;
                        sessionStatus = 'FAILED';
                        executing = false;
                    }
                    break;

                default:
                    summary = `Session ended with state: ${sessionStatus}`;
                    executing = false;
                    break;
            }
        }

        if (!payload.dry_run) {
            saveHallPlanningSession({
                session_id: sessionId,
                repo_id: repoId,
                skill_id: 'chant',
                status: sessionStatus,
                user_intent: existingSession?.user_intent ?? normalizedIntent,
                normalized_intent: existingSession
                    ? `${existingSession.normalized_intent}\nFOLLOW_UP: ${normalizedIntent}`
                    : normalizedIntent,
                summary: summary,
                latest_question: existingSession?.latest_question,
                architect_opinion: architectOpinion ?? existingSession?.architect_opinion,
                current_bead_id: activeBeadId ?? existingSession?.current_bead_id,
                created_at: existingSession?.created_at ?? now,
                updated_at: now,
                metadata: existingSession?.metadata ?? {},
            });
        }

        if (transitionOutput) {
            return transitionOutput;
        }

        return {
            weave_id: this.id,
            status: sessionStatus === 'COMPLETED' ? 'SUCCESS' : 'TRANSITIONAL',
            output: summary,
            metadata: {
                normalized_intent: normalizedIntent,
                planning_session_id: sessionId,
                planning_status: sessionStatus,
            },
        };
    }

    private recordObservation(
        context: RuntimeContext,
        normalizedIntent: string,
        outcome: string,
        resolution: DirectChantResolution,
        emittedBeads: string[],
        childResult?: WeaveResult,
        extraMetadata?: Record<string, unknown>,
    ): void {
        const metadata = {
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
