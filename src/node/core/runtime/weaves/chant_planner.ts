import * as path from 'node:path';
import * as fs from 'node:fs';

import * as database from '../../../../tools/pennyone/intel/database.js';
import * as hallTypes from '../../../../types/hall.js';
import type {
    HallPlanningSessionRecord,
    HallPlanningSessionStatus,
    HallBeadTargetKind,
    HallOneMindBranchDigest,
} from '../../../../types/hall.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../../types/hall.js';
import type {
    AutobotWeavePayload,
    RuntimeDispatchPort,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
    ChantWeavePayload,
    ResearchWeavePayload,
    ArchitectWeavePayload,
} from '../contracts.ts';

const AUTOBOT_NOTE_LIMIT = 4_000;
const AUTOBOT_SECTION_LIMIT = 420;
const AUTOBOT_MEMORY_LIMIT = 2;
const AUTOBOT_CRITIQUE_LIMIT = 2;
const LOCAL_WORKER_LINE_LIMIT = 1_200;

export const deps = {
    path: Object.assign({}, path),
    database: Object.assign({}, database),
    hallTypes: Object.assign({}, hallTypes),
    fs: Object.assign({}, fs),
};

type ArchitectProposal = {
    proposal_summary?: unknown;
    beads?: unknown;
};

type ArchitectProposalBead = {
    id?: unknown;
    title?: unknown;
    rationale?: unknown;
    targets?: unknown;
    target_symbol?: unknown;
    depends_on?: unknown;
    focus_hint?: unknown;
    acceptance_criteria?: unknown;
    checker_shell?: unknown;
    test_file_path?: unknown;
    test_file_content?: unknown;
    target_file_skeleton?: unknown;
};

export function compactText(value: string | undefined, limit: number = AUTOBOT_SECTION_LIMIT): string | undefined {
    if (!value) return undefined;
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) return undefined;
    if (normalized.length <= limit) return normalized;
    return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}...`;
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
    return `${normalized.slice(0, Math.max(0, AUTOBOT_NOTE_LIMIT - 1)).trimEnd()}...`;
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
        return value
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean);
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

export function isVerificationLikeTarget(targetPath: string): boolean {
    return targetPath.includes('test') || targetPath.includes('spec') || targetPath.endsWith('.feature');
}

export function extractArtifactPathCandidates(rootPathOrText: string, maybeText?: string): string[] {
    const text = maybeText ?? rootPathOrText;
    const matches = text.match(/[a-zA-Z0-9_\-./]+\.[a-z0-9]+/g);
    return matches ? Array.from(new Set(matches.map((match) => match.replace(/\\/g, '/')))) : [];
}

function countFileLines(filePath: string): number | null {
    try {
        if (!deps.fs.existsSync(filePath)) return null;
        const stat = deps.fs.statSync(filePath);
        if (!stat.isFile()) return null;
        const content = deps.fs.readFileSync(filePath, 'utf-8');
        if (!content.length) return 0;
        return content.split(/\r?\n/).length;
    } catch {
        return null;
    }
}

function buildLocalWorkerFileBudgets(projectRoot: string, candidates: string[]): Array<Record<string, unknown>> {
    return candidates.map((candidate) => {
        const resolved = deps.path.isAbsolute(candidate) ? candidate : deps.path.join(projectRoot, candidate);
        const lineCount = countFileLines(resolved);
        return {
            path: candidate,
            line_count: lineCount,
            verification_like: isVerificationLikeTarget(candidate),
            local_worker_fit: lineCount === null ? null : lineCount <= LOCAL_WORKER_LINE_LIMIT,
        };
    });
}

export function augmentResearchPayloadForArchitect(
    projectRootOrPayload: string | Record<string, unknown>,
    maybeResearch?: Record<string, unknown>,
): Record<string, unknown> {
    const projectRoot = typeof projectRootOrPayload === 'string'
        ? projectRootOrPayload
        : String(projectRootOrPayload?.project_root ?? '');
    const research = typeof projectRootOrPayload === 'string'
        ? (maybeResearch ?? {})
        : projectRootOrPayload;

    const artifactSources = [
        ...asStringArray(research?.research_artifacts),
        ...extractArtifactPathCandidates(projectRoot, String(research?.summary ?? '')),
    ];
    const candidates = Array.from(new Set(artifactSources)).filter(Boolean);
    return {
        ...research,
        research_artifacts: asStringArray(research?.research_artifacts),
        local_worker_file_budgets: buildLocalWorkerFileBudgets(projectRoot, candidates),
    };
}

function inferTargetKind(targets: string[]): HallBeadTargetKind {
    if (targets.length === 0) return 'OTHER';
    const primary = targets[0];
    if (primary.includes('/')) return 'FILE';
    return 'OTHER';
}

function normalizeCheckerShell(projectRoot: string, checkerShell: string | undefined, targets: string[]): string | undefined {
    if (!checkerShell) return undefined;
    const trimmed = checkerShell.trim();
    if (!trimmed) return undefined;
    const hasTsTarget = targets.some((target) => target.endsWith('.ts') || target.endsWith('.tsx'));
    const runTsxPath = deps.path.join(projectRoot, 'scripts', 'run-tsx.mjs');
    if (hasTsTarget && trimmed.startsWith('node --test ') && deps.fs.existsSync(runTsxPath)) {
        return trimmed.replace(/^node --test\b/, 'node scripts/run-tsx.mjs --test');
    }
    return trimmed;
}

function coerceAcceptanceCriteria(value: unknown): string {
    const items = asStringArray(value);
    return items.join('\n');
}

function normalizeProposalBeadId(rawId: unknown, index: number): string {
    if (typeof rawId === 'string' && rawId.trim()) return rawId.trim();
    return `bead-${index + 1}`;
}

function deriveFallbackProposal(intent: string, projectRoot: string): { proposalSummary: string; beads: Array<Record<string, unknown>> } {
    const inferredArtifacts = extractArtifactPathCandidates(projectRoot, intent);
    const defaultTarget = inferredArtifacts[0] ?? 'README.md';
    const beadId = normalizeIdFragment(intent, 'planning-bead');
    return {
        proposalSummary: 'Fallback proposal generated from intent because the architect did not emit a structured bead graph.',
        beads: [
            {
                id: beadId,
                title: compactText(intent, 80) ?? 'Planning bead',
                rationale: compactText(intent, 240) ?? 'Carry the planning request forward as one bounded review bead.',
                targets: [defaultTarget],
                depends_on: [],
                acceptance_criteria: ['Review the scoped target and confirm the next bounded execution path.'],
            },
        ],
    };
}

function normalizeArchitectProposal(
    intent: string,
    projectRoot: string,
    rawProposal: unknown,
): { proposalSummary: string; beads: Array<Record<string, unknown>> } {
    const proposal = (typeof rawProposal === 'object' && rawProposal !== null ? rawProposal : {}) as ArchitectProposal;
    const proposalSummary = typeof proposal.proposal_summary === 'string' && proposal.proposal_summary.trim()
        ? proposal.proposal_summary.trim()
        : '';
    const beads = Array.isArray(proposal.beads)
        ? proposal.beads.filter((bead): bead is Record<string, unknown> => typeof bead === 'object' && bead !== null && !Array.isArray(bead))
        : [];

    if (proposalSummary && beads.length > 0) {
        return { proposalSummary, beads };
    }

    return deriveFallbackProposal(intent, projectRoot);
}

export function buildAutobotWorkerNote(
    workspaceRoot: string,
    beadId: string,
    session: HallPlanningSessionRecord | null,
): string {
    const repoId = buildHallRepositoryId(normalizeHallPath(workspaceRoot));
    const bead = deps.database.getHallBeads(repoId).find((candidate: any) => candidate.id === beadId);
    const lines = [
        'Local Hermes micro-bead. Use only the context below unless the target file forces direct adjacent inspection.',
        'Do not invent imports, dependencies, commands, or files. If something is not already present or directly verified in the repo, do not rely on it.',
    ];
    const focusHint = typeof bead?.critique_payload?.focus_hint === 'string' && bead.critique_payload.focus_hint.trim()
        ? bead.critique_payload.focus_hint.trim()
        : undefined;
    const checkerShell = resolveAutobotCheckerShell(workspaceRoot, beadId, session);
    const fileIntel = bead?.target_path
        ? deps.database.getHallFile(bead.target_path, workspaceRoot, bead.scan_id || undefined)
        : null;
    pushSection(lines, 'Active bead', beadId);
    pushSection(lines, 'Target path', bead?.target_path);
    pushSection(lines, 'Focus hint', focusHint);
    pushSection(lines, 'Checker shell', checkerShell);
    pushSection(lines, 'Target file role', fileIntel?.intent_summary);
    pushSection(lines, 'Bead rationale', bead?.rationale);
    return finalizeAutobotNote(lines);
}

function buildSessionId(context: RuntimeContext, repoId: string): string {
    if (context.session_id?.trim()) return context.session_id.trim();
    if (context.trace_id?.trim()) return `chant-session:${context.trace_id.trim()}`;
    return `chant-session:${repoId}:${Date.now()}`;
}

function mergeNormalizedIntent(existingSession: HallPlanningSessionRecord | null, normalizedIntent: string): string {
    if (!existingSession) return normalizedIntent;
    if (existingSession.normalized_intent.includes(normalizedIntent)) return existingSession.normalized_intent;
    return `${existingSession.normalized_intent}\nFOLLOW_UP: ${normalizedIntent}`;
}

function writePlanningSession(record: HallPlanningSessionRecord): void {
    deps.database.saveHallPlanningSession(record);
}

export function buildResearchPayload(payload: ChantWeavePayload, normalizedIntent: string): ResearchWeavePayload {
    return {
        intent: normalizedIntent,
        rationale: payload.query,
        project_root: payload.project_root,
        cwd: payload.cwd,
        dry_run: payload.dry_run,
    };
}

function normalizeResearchPayload(result: WeaveResult): Record<string, unknown> {
    const metadataPayload = typeof result.metadata?.research_payload === 'object' && result.metadata?.research_payload !== null
        ? result.metadata.research_payload as Record<string, unknown>
        : {};
    const summary = typeof metadataPayload.summary === 'string' && metadataPayload.summary.trim()
        ? metadataPayload.summary.trim()
        : (result.output.trim() || 'Research completed without a structured summary.');
    const researchArtifacts = Array.from(new Set([
        ...asStringArray(metadataPayload.research_artifacts),
        ...asStringArray(result.metadata?.research_artifacts),
    ]));
    return {
        ...metadataPayload,
        summary,
        research_artifacts: researchArtifacts,
    };
}

export function buildArchitectPayload(
    payload: ChantWeavePayload,
    normalizedIntent: string,
    researchPayload: Record<string, unknown>,
): ArchitectWeavePayload {
    return {
        action: 'build_proposal',
        intent: normalizedIntent,
        rationale: payload.query,
        research: augmentResearchPayloadForArchitect(payload.project_root, researchPayload),
        project_root: payload.project_root,
        cwd: payload.cwd,
    };
}

function proposalStorageDir(projectRoot: string, sessionId: string): string {
    return deps.path.join(projectRoot, '.agents', 'proposals', normalizeIdFragment(sessionId, 'chant-session'));
}

export function persistArchitectProposal(
    projectRoot: string,
    repoId: string,
    sessionId: string,
    proposal: Record<string, unknown>,
): { beadIds: string[]; proposalIds: string[] } {
    const normalized = normalizeArchitectProposal(String(proposal.proposal_summary ?? ''), projectRoot, proposal);
    const now = Date.now();
    const beadIds: string[] = [];
    const proposalIds: string[] = [];
    const storageDir = proposalStorageDir(projectRoot, sessionId);

    try {
        deps.fs.mkdirSync(storageDir, { recursive: true });
    } catch {
        // Continue even if proposal file persistence fails.
    }

    normalized.beads.forEach((rawBead, index) => {
        const bead = rawBead as ArchitectProposalBead;
        const beadId = normalizeProposalBeadId(bead.id, index);
        const targets = asStringArray(bead.targets);
        const acceptanceCriteria = coerceAcceptanceCriteria(bead.acceptance_criteria);
        const checkerShell = normalizeCheckerShell(
            projectRoot,
            typeof bead.checker_shell === 'string' && bead.checker_shell.trim() ? bead.checker_shell.trim() : undefined,
            targets,
        );
        const rationale = typeof bead.rationale === 'string' && bead.rationale.trim()
            ? bead.rationale.trim()
            : (typeof bead.title === 'string' && bead.title.trim() ? bead.title.trim() : `Proposed bead ${index + 1}`);
        const proposalId = `proposal:${sessionId}:${beadId}`;
        const targetPath = targets[0];
        const proposalPath = deps.path.join(storageDir, `${normalizeIdFragment(beadId)}.json`);
        const contractRefs = Array.from(new Set([
            ...asStringArray(bead.depends_on),
            ...targets.filter((target) => isVerificationLikeTarget(target)),
        ]));
        const critiquePayload = {
            focus_hint: typeof bead.focus_hint === 'string' ? bead.focus_hint.trim() : undefined,
            target_symbol: typeof bead.target_symbol === 'string' ? bead.target_symbol.trim() : undefined,
        };

        deps.database.upsertHallBead({
            bead_id: beadId,
            repo_id: repoId,
            target_kind: inferTargetKind(targets),
            target_ref: sessionId,
            target_path: targetPath,
            rationale,
            contract_refs: contractRefs,
            baseline_scores: {},
            acceptance_criteria: acceptanceCriteria || undefined,
            checker_shell: checkerShell,
            status: 'OPEN',
            source_kind: 'CHANT',
            architect_opinion: normalized.proposalSummary,
            critique_payload: critiquePayload,
            created_at: now + index,
            updated_at: now + index,
        });

        deps.database.saveHallSkillProposal({
            proposal_id: proposalId,
            repo_id: repoId,
            skill_id: 'chant',
            bead_id: beadId,
            target_path: targetPath,
            proposal_path: proposalPath,
            status: 'PROPOSED',
            summary: typeof bead.title === 'string' && bead.title.trim() ? bead.title.trim() : rationale,
            created_at: now + index,
            updated_at: now + index,
            metadata: {
                checker_shell: checkerShell ?? null,
                targets,
                depends_on: asStringArray(bead.depends_on),
                focus_hint: critiquePayload.focus_hint,
                test_file_path: typeof bead.test_file_path === 'string' ? bead.test_file_path.trim() : undefined,
                target_symbol: critiquePayload.target_symbol,
            },
        });

        try {
            deps.fs.writeFileSync(proposalPath, JSON.stringify(rawBead, null, 2), 'utf-8');
        } catch {
            // Proposal persistence to disk is best-effort.
        }

        beadIds.push(beadId);
        proposalIds.push(proposalId);
    });

    return { beadIds, proposalIds };
}

function buildProposalReviewOutput(proposalSummary: string, beadIds: string[]): string {
    const next = beadIds[0] ?? 'the proposed bead';
    return `${proposalSummary} Review the proposal in Hall and mark it SET when ready to execute. Current lead bead: ${next}.`;
}

function persistPlanningSessionSnapshot(data: {
    sessionId: string;
    repoId: string;
    sessionStatus: HallPlanningSessionStatus;
    normalizedIntent: string;
    summary: string;
    now: number;
    userIntent: string;
    currentBeadId?: string;
    architectOpinion?: string;
    latestQuestion?: string;
    metadata: Record<string, unknown>;
    createdAt?: number;
}): void {
    writePlanningSession({
        session_id: data.sessionId,
        repo_id: data.repoId,
        skill_id: 'chant',
        status: data.sessionStatus,
        user_intent: data.userIntent,
        normalized_intent: data.normalizedIntent,
        summary: data.summary,
        latest_question: data.latestQuestion,
        architect_opinion: data.architectOpinion,
        current_bead_id: data.currentBeadId,
        created_at: data.createdAt ?? data.now,
        updated_at: data.now,
        metadata: data.metadata,
    });
}

function getResumableResearchPayload(session: HallPlanningSessionRecord | null): Record<string, unknown> | null {
    const payload = session?.metadata?.research_payload;
    return typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : null;
}

function getBranchLedgerDigest(value: unknown): HallOneMindBranchDigest | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }

    const digest = value as HallOneMindBranchDigest;
    if (!Array.isArray(digest.groups) || typeof digest.total_branches !== 'number') {
        return undefined;
    }

    return digest;
}

export async function runPlanningLoop(
    dispatchPort: RuntimeDispatchPort,
    invocation: WeaveInvocation<ChantWeavePayload>,
    context: RuntimeContext,
    existingSession: HallPlanningSessionRecord | null,
    normalizedIntent: string,
    lowerTokens: string[],
): Promise<WeaveResult> {
    const payload = invocation.payload;
    const now = Date.now();
    const repoId = buildHallRepositoryId(normalizeHallPath(context.workspace_root));
    const sessionId = existingSession?.session_id ?? buildSessionId(context, repoId);
    const createdAt = existingSession?.created_at ?? now;
    const mergedIntent = mergeNormalizedIntent(existingSession, normalizedIntent);
    const userIntent = existingSession?.user_intent ?? normalizedIntent;
    const baseMetadata = {
        ...(existingSession?.metadata ?? {}),
        trace_id: typeof existingSession?.metadata?.trace_id === 'string' && existingSession.metadata.trace_id.trim()
            ? existingSession.metadata.trace_id.trim()
            : context.trace_id,
    };

    if (existingSession && existingSession.status === 'PLAN_CONCRETE') {
        const beadId = resolveAutobotBeadId(payload.project_root, existingSession);
        if (!beadId) {
            return {
                weave_id: 'weave:chant',
                status: 'FAILURE',
                output: '',
                error: 'Planning session is concrete but no executable bead could be resolved.',
                metadata: {
                    context_policy: 'project',
                    normalized_intent: normalizedIntent,
                    planning_session_id: sessionId,
                    planning_status: 'FAILED',
                },
            };
        }

        const autobotResult = await dispatchPort.dispatch(buildAutobotInvocation(payload, existingSession, beadId));
        const summary = `AutoBot received bead ${beadId}. Review the worker result before promoting the bead.`;
        persistPlanningSessionSnapshot({
            sessionId,
            repoId,
            sessionStatus: 'BEAD_USER_REVIEW',
            normalizedIntent: mergedIntent,
            summary,
            now,
            userIntent,
            currentBeadId: beadId,
            architectOpinion: existingSession.architect_opinion,
            metadata: {
                ...baseMetadata,
                autobot_last_result: autobotResult.output,
            },
            createdAt,
        });

        return {
            weave_id: 'weave:chant',
            status: 'TRANSITIONAL',
            output: summary,
            metadata: {
                context_policy: 'project',
                normalized_intent: normalizedIntent,
                planning_session_id: sessionId,
                planning_status: 'BEAD_USER_REVIEW',
                bead_ids: baseMetadata.bead_ids ?? [beadId],
            },
        };
    }

    if (existingSession && (existingSession.status === 'PROPOSAL_REVIEW' || existingSession.status === 'PLAN_READY')) {
        persistPlanningSessionSnapshot({
            sessionId,
            repoId,
            sessionStatus: existingSession.status,
            normalizedIntent: mergedIntent,
            summary: existingSession.summary ?? 'Proposal ready for review.',
            now,
            userIntent,
            currentBeadId: existingSession.current_bead_id,
            architectOpinion: existingSession.architect_opinion,
            latestQuestion: existingSession.latest_question,
            metadata: baseMetadata,
            createdAt,
        });

        return {
            weave_id: 'weave:chant',
            status: 'TRANSITIONAL',
            output: existingSession.summary ?? 'Proposal ready for review.',
            metadata: {
                context_policy: 'project',
                normalized_intent: normalizedIntent,
                planning_session_id: sessionId,
                planning_status: existingSession.status,
                bead_ids: baseMetadata.bead_ids ?? [],
                proposal_ids: baseMetadata.proposal_ids ?? [],
            },
        };
    }

    let researchPayload = getResumableResearchPayload(existingSession);
    let branchLedgerDigest = getBranchLedgerDigest(baseMetadata.branch_ledger_digest)
        ?? getBranchLedgerDigest(researchPayload?.branch_ledger_digest);

    if (!researchPayload) {
        const researchSummary = 'Initiating Research Phase.';
        persistPlanningSessionSnapshot({
            sessionId,
            repoId,
            sessionStatus: 'INTENT_RECEIVED',
            normalizedIntent: mergedIntent,
            summary: researchSummary,
            now,
            userIntent,
            metadata: {
                ...baseMetadata,
                phase_in_flight: 'weave:research',
            },
            createdAt,
        });

        const researchResult = await dispatchPort.dispatch<ResearchWeavePayload>({
            weave_id: 'weave:research',
            payload: buildResearchPayload(payload, normalizedIntent),
            session: invocation.session,
            target: invocation.target,
        });

        if (researchResult.status === 'FAILURE') {
            persistPlanningSessionSnapshot({
                sessionId,
                repoId,
                sessionStatus: 'FAILED',
                normalizedIntent: mergedIntent,
                summary: 'Research Phase failed.',
                now: Date.now(),
                userIntent,
                metadata: {
                    ...baseMetadata,
                    phase_in_flight: 'weave:research',
                },
                createdAt,
            });
            return {
                weave_id: 'weave:chant',
                status: 'FAILURE',
                output: '',
                error: researchResult.error ?? 'Research phase failed.',
                metadata: {
                    context_policy: 'project',
                    normalized_intent: normalizedIntent,
                    planning_session_id: sessionId,
                    planning_status: 'FAILED',
                },
            };
        }

        researchPayload = normalizeResearchPayload(researchResult);
        branchLedgerDigest = getBranchLedgerDigest(researchResult.metadata?.branch_ledger_digest)
            ?? deps.database.summarizeHallOneMindBranches(payload.project_root, {
                traceId: context.trace_id,
                sessionId: context.session_id,
            })
            ?? undefined;
        if (branchLedgerDigest) {
            researchPayload = {
                ...researchPayload,
                branch_ledger_digest: branchLedgerDigest,
            };
        }
    }

    const architectSummary = 'Research Phase complete. Synthesizing proposal via Architect...';
    persistPlanningSessionSnapshot({
        sessionId,
        repoId,
        sessionStatus: 'RESEARCH_PHASE',
        normalizedIntent: mergedIntent,
        summary: architectSummary,
        now: Date.now(),
        userIntent,
        metadata: {
            ...baseMetadata,
            phase_in_flight: 'weave:architect',
            research_payload: researchPayload,
            branch_ledger_digest: branchLedgerDigest ?? getBranchLedgerDigest(researchPayload?.branch_ledger_digest),
        },
        createdAt,
    });

    const architectResult = await dispatchPort.dispatch<ArchitectWeavePayload>({
        weave_id: 'weave:architect',
        payload: buildArchitectPayload(payload, normalizedIntent, researchPayload),
        session: invocation.session,
        target: invocation.target,
    });

    if (architectResult.status === 'FAILURE') {
        persistPlanningSessionSnapshot({
            sessionId,
            repoId,
            sessionStatus: 'FAILED',
            normalizedIntent: mergedIntent,
            summary: 'Architect synthesis failed.',
            now: Date.now(),
            userIntent,
            metadata: {
                ...baseMetadata,
                phase_in_flight: 'weave:architect',
                research_payload: researchPayload,
                branch_ledger_digest: branchLedgerDigest ?? getBranchLedgerDigest(researchPayload?.branch_ledger_digest),
            },
            createdAt,
        });
        return {
            weave_id: 'weave:chant',
            status: 'FAILURE',
            output: '',
            error: architectResult.error ?? 'Architect phase failed.',
            metadata: {
                context_policy: 'project',
                normalized_intent: normalizedIntent,
                planning_session_id: sessionId,
                planning_status: 'FAILED',
            },
        };
    }

    const normalizedProposal = normalizeArchitectProposal(
        normalizedIntent,
        payload.project_root,
        architectResult.metadata?.architect_proposal,
    );
    const persisted = persistArchitectProposal(payload.project_root, repoId, sessionId, {
        proposal_summary: normalizedProposal.proposalSummary,
        beads: normalizedProposal.beads,
    });
    const reviewOutput = buildProposalReviewOutput(normalizedProposal.proposalSummary, persisted.beadIds);

    persistPlanningSessionSnapshot({
        sessionId,
        repoId,
        sessionStatus: 'PROPOSAL_REVIEW',
        normalizedIntent: mergedIntent,
        summary: reviewOutput,
        now: Date.now(),
        userIntent,
        currentBeadId: persisted.beadIds[0],
        architectOpinion: normalizedProposal.proposalSummary,
        metadata: {
            ...baseMetadata,
            phase_in_flight: null,
            research_payload: researchPayload,
            branch_ledger_digest: branchLedgerDigest ?? getBranchLedgerDigest(researchPayload?.branch_ledger_digest),
            bead_ids: persisted.beadIds,
            proposal_ids: persisted.proposalIds,
        },
        createdAt,
    });

    return {
        weave_id: 'weave:chant',
        status: 'TRANSITIONAL',
        output: reviewOutput,
        metadata: {
            context_policy: 'project',
            normalized_intent: normalizedIntent,
            planning_session_id: sessionId,
            planning_status: 'PROPOSAL_REVIEW',
            bead_ids: persisted.beadIds,
            proposal_ids: persisted.proposalIds,
        },
    };
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
