import * as path from 'node:path';
import * as fs from 'node:fs';

import * as database from '../../../../tools/pennyone/intel/database.ts';
import * as hallTypes from '../../../../types/hall.ts';
import type { HallPlanningSessionRecord, HallPlanningSessionStatus } from '../../../../types/hall.ts';
import { buildHallRepositoryId, normalizeHallPath } from '../../../../types/hall.ts';
import type {
    AutobotWeavePayload,
    RuntimeDispatchPort,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
    ChantWeavePayload,
} from '../contracts.ts';

const AUTOBOT_NOTE_LIMIT = 4_000;
const AUTOBOT_SECTION_LIMIT = 420;
const AUTOBOT_MEMORY_LIMIT = 2;
const AUTOBOT_CRITIQUE_LIMIT = 2;

export const deps = {
    path: Object.assign({}, path),
    database: Object.assign({}, database),
    hallTypes: Object.assign({}, hallTypes),
    fs: Object.assign({}, fs),
};

export function compactText(value: string | undefined, limit: number = AUTOBOT_SECTION_LIMIT): string | undefined {
    if (!value) return undefined;
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) return undefined;
    if (normalized.length <= limit) return normalized;
    return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export function compactJson(value: unknown, limit: number = AUTOBOT_SECTION_LIMIT): string | undefined {
    if (value === undefined) return undefined;
    try {
        return compactText(JSON.stringify(value), limit);
    } catch {
        return undefined;
    }
}

export function pushSection(lines: string[], label: string, value: string | undefined): void {
    if (value) lines.push(`${label}: ${value}`);
}

export function finalizeAutobotNote(lines: string[]): string {
    const normalized = lines.map((line) => line.trimEnd()).filter(Boolean).join('\n');
    if (normalized.length <= AUTOBOT_NOTE_LIMIT) return normalized;
    return `${normalized.slice(0, Math.max(0, AUTOBOT_NOTE_LIMIT - 1)).trimEnd()}…`;
}

export function resolveAutobotBeadId(workspaceRoot: string, session: HallPlanningSessionRecord | null): string | undefined {
    return session?.current_bead_id?.trim();
}

export function getSessionStringMetadata(session: HallPlanningSessionRecord | null, keys: string[]): string | undefined {
    const metadata = session?.metadata ?? {};
    for (const key of keys) {
        const value = metadata[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
}

export function getSessionNumberMetadata(session: HallPlanningSessionRecord | null, keys: string[]): number | undefined {
    const metadata = session?.metadata ?? {};
    for (const key of keys) {
        const value = metadata[key];
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim()) {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) return parsed;
        }
    }
    return undefined;
}

export function asStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map(item => String(item).trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? [trimmed] : [];
    }
    return [];
}

export function isTerminalPlanningStatus(status: HallPlanningSessionStatus): boolean {
    return ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status);
}

export function normalizeIdFragment(text: string, fallback: string = 'bead'): string {
    const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return normalized || fallback;
}

export function isVerificationLikeTarget(path: string): boolean {
    return path.includes('test') || path.includes('spec') || path.endsWith('.feature');
}

export function extractArtifactPathCandidates(text: string): string[] {
    const matches = text.match(/[a-zA-Z0-9_\-\.\/]+\.[a-z0-9]+/g);
    return matches ? Array.from(new Set(matches.map(m => m.replace(/\\/g, '/')))) : [];
}

export function augmentResearchPayloadForArchitect(payload: any, research: any): any {
    const artifacts = Array.isArray(research?.research_artifacts) ? research.research_artifacts : [];
    return { ...payload, research: { ...research, research_artifacts: artifacts } };
}

export function buildAutobotWorkerNote(
    workspaceRoot: string,
    beadId: string,
    session: HallPlanningSessionRecord | null,
): string {
    const bead = deps.database.getHallBeads(workspaceRoot).find((candidate) => candidate.id === beadId);
    const lines = [
        'Local SovereignWorker micro-bead execution.',
        'Do not invent imports or dependencies.'
    ];
    pushSection(lines, 'Active bead', beadId);
    pushSection(lines, 'Target path', bead?.target_path);
    pushSection(lines, 'Bead rationale', bead?.rationale);
    return finalizeAutobotNote(lines);
}

export async function runPlanningLoop(
    dispatchPort: RuntimeDispatchPort,
    invocation: WeaveInvocation<ChantWeavePayload>,
    context: RuntimeContext,
    existingSession: HallPlanningSessionRecord | null,
    normalizedIntent: string,
    lowerTokens: string[]
): Promise<WeaveResult> {
    const payload = invocation.payload;
    const now = Date.now();
    const repoId = buildHallRepositoryId(normalizeHallPath(context.workspace_root));
    const sessionId = existingSession?.session_id ?? `chant-session:${repoId}:${now}`;
    
    let sessionStatus: HallPlanningSessionStatus = existingSession?.status ?? 'INTENT_RECEIVED';
    let summary = 'Initiating planning cycle.';
    let architectOpinion = existingSession?.architect_opinion;
    let activeBeadId = existingSession?.current_bead_id;

    // Simple state machine logic
    if (sessionStatus === 'INTENT_RECEIVED') {
        sessionStatus = 'RESEARCH_PHASE';
        summary = 'Moving to Research Phase.';
    }

    if (!payload.dry_run) {
        deps.database.saveHallPlanningSession({
            session_id: sessionId,
            repo_id: repoId,
            skill_id: 'chant',
            status: sessionStatus,
            user_intent: existingSession?.user_intent ?? normalizedIntent,
            normalized_intent: existingSession
                ? `${existingSession.normalized_intent}\nFOLLOW_UP: ${normalizedIntent}`
                : normalizedIntent,
            summary: summary,
            created_at: existingSession?.created_at ?? now,
            updated_at: now,
            metadata: existingSession?.metadata ?? {},
        });
    }

    return {
        weave_id: 'weave:chant',
        status: sessionStatus === 'COMPLETED' ? 'SUCCESS' : 'TRANSITIONAL',
        output: summary,
        metadata: {
            normalized_intent: normalizedIntent,
            planning_session_id: sessionId,
            planning_status: sessionStatus,
        },
    };
}

export function persistPlanningSessionSnapshot(data: any): void {
    deps.database.saveHallPlanningSession({
        session_id: data.sessionId,
        repo_id: data.repoId,
        skill_id: 'chant',
        status: data.sessionStatus,
        user_intent: data.normalizedIntent,
        normalized_intent: data.normalizedIntent,
        summary: data.summary,
        created_at: data.now,
        updated_at: data.now,
        metadata: data.sessionMetadata,
    });
}

export function persistArchitectProposal(session: any, repoId: string, proposal: any): void {
    const now = Date.now();
    const beads = Array.isArray(proposal?.beads) ? proposal.beads : [];
    beads.forEach((bead: any) => {
        deps.database.upsertHallBead({
            bead_id: bead.id,
            repo_id: repoId,
            rationale: bead.rationale,
            target_path: bead.targets?.[0],
            status: 'OPEN',
            created_at: now,
            updated_at: now,
            contract_refs: bead.depends_on ?? [],
            baseline_scores: {},
        });
    });
}

export function resolveAutobotCheckerShell(
    workspaceRoot: string,
    beadId: string,
    session: HallPlanningSessionRecord | null,
): string | undefined {
    return getSessionStringMetadata(session, ['checker_shell']);
}

export function buildAutobotInvocation(
    payload: ChantWeavePayload,
    session: HallPlanningSessionRecord | null,
    beadId: string,
): WeaveInvocation<AutobotWeavePayload> {
    const autobotPayload: AutobotWeavePayload = {
        bead_id: beadId,
        project_root: payload.project_root,
        cwd: payload.cwd,
        source: payload.source === 'python_adapter' ? 'python_adapter' : 'runtime',
        worker_note: buildAutobotWorkerNote(payload.project_root, beadId, session),
    };

    const checkerShell = resolveAutobotCheckerShell(payload.project_root, beadId, session);
    if (checkerShell) {
        autobotPayload.checker_shell = checkerShell;
    }

    const maxAttempts = getSessionNumberMetadata(session, ['autobot_max_attempts', 'max_attempts']);
    if (maxAttempts !== undefined) {
        autobotPayload.max_attempts = maxAttempts;
    }

    const timeout = getSessionNumberMetadata(session, ['autobot_timeout', 'timeout']);
    if (timeout !== undefined) {
        autobotPayload.timeout = timeout;
    }

    return {
        weave_id: 'weave:autobot',
        payload: autobotPayload,
    };
}
