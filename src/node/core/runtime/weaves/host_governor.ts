import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
    getHallBeads,
    getHallBeadsByStatus,
    getDb,
    getHallPlanningSession,
    listHallSkillProposals,
    listHallPlanningSessions,
    saveHallSkillObservation,
    saveHallPlanningSession,
    saveHallSkillProposal,
    summarizeHallOneMindBranches,
} from '../../../../tools/pennyone/intel/database.ts';
import { buildHallRepositoryId, normalizeHallPath } from  '../../../../types/hall.js';
import type { SovereignBead } from  '../../../../types/bead.js';
import type { HallOneMindBranchDigest, HallPlanningSessionRecord, HallPlanningSessionStatus } from  '../../../../types/hall.js';
import {
    HostGovernorDecision,
    HostGovernorPolicy,
    HostGovernorWeavePayload,
    OrchestrateWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';
import type { ChantWeavePayload } from  '../contracts.js';
import { resolveHostGovernorPolicy } from  '../host_governor_policy.js';
import type { HostProvider } from  '../../../../core/host_session.js';
import { defaultHostTextInvoker, extractJsonObject, resolveRuntimeHostProvider, type HostTextInvoker } from  './host_bridge.js';

interface ReplanResult {
    invoked: boolean;
    planningSessionId?: string;
    planningStatus?: string;
    output?: string;
    beadIds: string[];
}

interface GovernancePassResult {
    source: 'existing' | 'replan';
    planningSessionId?: string;
    candidateBeadIds: string[];
    promotedBeadIds: string[];
    deferredBeadIds: string[];
    reasonCode?: string;
    notes?: string;
}

const ACTIVE_PLANNING_STATUSES: HallPlanningSessionStatus[] = [
    'INTENT_RECEIVED',
    'RESEARCH_PHASE',
    'PROPOSAL_REVIEW',
    'BEAD_CRITIQUE_LOOP',
    'BEAD_USER_REVIEW',
    'PLAN_CONCRETE',
    'FORGE_EXECUTION',
    'NEEDS_INPUT',
    'PLAN_READY',
    'ROUTED',
];
function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean);
}

function getBeadTargets(bead: SovereignBead): string[] {
    const critiqueTargets = Array.isArray(bead.critique_payload?.targets)
        ? bead.critique_payload.targets
            .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
            .filter(Boolean)
        : [];
    const primaryTarget = bead.target_path ?? bead.target_ref;
    return Array.from(new Set([primaryTarget, ...critiqueTargets].filter((entry): entry is string => Boolean(entry))));
}

function isVerificationOrDocumentationTarget(target: string): boolean {
    const normalized = target.trim().replace(/\\/g, '/').toLowerCase();
    return normalized.startsWith('tests/')
        || normalized.includes('/tests/')
        || normalized.includes('/__tests__/')
        || normalized.endsWith('.test.ts')
        || normalized.endsWith('.test.tsx')
        || normalized.endsWith('.test.js')
        || normalized.endsWith('.test.jsx')
        || normalized.endsWith('.test.py')
        || normalized.endsWith('.spec.ts')
        || normalized.endsWith('.spec.tsx')
        || normalized.endsWith('.spec.js')
        || normalized.endsWith('.spec.jsx')
        || normalized.endsWith('.spec.py')
        || normalized.startsWith('docs/')
        || normalized.includes('/docs/')
        || normalized.endsWith('.md')
        || normalized.endsWith('.qmd')
        || normalized.endsWith('.feature');
}

function getAcceptanceCriteriaItems(bead: SovereignBead): string[] {
    const raw = bead.acceptance_criteria;
    if (typeof raw !== 'string' || raw.trim().length === 0) {
        return [];
    }

    return raw
        .split('|')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function hasConciseAcceptanceCriteria(bead: SovereignBead, policy: HostGovernorPolicy): boolean {
    const items = getAcceptanceCriteriaItems(bead);
    return items.length > 0
        && items.length <= policy.max_acceptance_items
        && items.every((item) => item.length <= policy.max_acceptance_item_length);
}

function resolveTargetFilePath(projectRoot: string, target: string): string | null {
    const trimmed = target.trim();
    if (!trimmed) {
        return null;
    }

    if (trimmed.includes(':') && !trimmed.startsWith('./') && !trimmed.startsWith('../') && !path.isAbsolute(trimmed)) {
        return null;
    }

    const resolved = path.isAbsolute(trimmed)
        ? trimmed
        : path.resolve(projectRoot, trimmed);
    if (!existsSync(resolved)) {
        return null;
    }
    return resolved;
}

function readTargetLineCount(projectRoot: string, target: string): number | null {
    const resolved = resolveTargetFilePath(projectRoot, target);
    if (!resolved) {
        return null;
    }

    try {
        const content = readFileSync(resolved, 'utf-8');
        return content.split(/\r?\n/).length;
    } catch {
        return null;
    }
}

function fitsLocalWorkerFileBudget(projectRoot: string, targets: string[], policy: HostGovernorPolicy): boolean {
    let totalLines = 0;

    for (const target of targets) {
        const lineCount = readTargetLineCount(projectRoot, target);
        if (lineCount === null) {
            continue;
        }

        totalLines += lineCount;
        if (!isVerificationOrDocumentationTarget(target) && lineCount > policy.max_implementation_lines) {
            return false;
        }
    }

    return totalLines === 0 || totalLines <= policy.max_total_target_lines;
}

function isBoundedBead(projectRoot: string, bead: SovereignBead, policy: HostGovernorPolicy): boolean {
    const targets = getBeadTargets(bead);
    if (targets.length === 0 || targets.length > policy.max_total_targets) {
        return false;
    }

    const implementationTargets = targets.filter((target) => !isVerificationOrDocumentationTarget(target));
    return implementationTargets.length === policy.max_implementation_targets
        && hasConciseAcceptanceCriteria(bead, policy);
}

function extractCheckerCommand(checkerShell: string): string | null {
    const match = checkerShell.trim().match(/^"([^"]+)"|'([^']+)'|(\S+)/);
    return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function isCommandAvailable(command: string, projectRoot: string): boolean {
    if (!command.trim()) {
        return false;
    }

    if (command === 'node') {
        return true;
    }

    if (command.includes('/') || command.startsWith('.')) {
        const resolved = path.isAbsolute(command) ? command : path.resolve(projectRoot, command);
        return existsSync(resolved);
    }

    const lookupCommand = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(lookupCommand, [command], {
        cwd: projectRoot,
        stdio: 'ignore',
    });
    return result.status === 0;
}

function hasGovernableValidation(bead: SovereignBead, projectRoot: string): boolean {
    if (typeof bead.checker_shell !== 'string' || bead.checker_shell.trim().length === 0) {
        return false;
    }

    const checkerCommand = extractCheckerCommand(bead.checker_shell);
    if (!checkerCommand) {
        return false;
    }

    return isCommandAvailable(checkerCommand, projectRoot);
}

function summarizeCandidates(projectRoot: string, beads: SovereignBead[], policy: HostGovernorPolicy): Array<Record<string, unknown>> {
    return beads.map((bead) => ({
        bead_id: bead.id,
        target_path: bead.target_path ?? bead.target_ref ?? null,
        targets: getBeadTargets(bead),
        rationale: bead.rationale,
        acceptance_criteria: bead.acceptance_criteria ?? null,
        checker_shell: bead.checker_shell ?? null,
        architect_opinion: bead.architect_opinion ?? null,
        contract_refs: bead.contract_refs,
        source_kind: bead.source_kind ?? null,
        acceptance_criteria_items: getAcceptanceCriteriaItems(bead),
        bounded: isBoundedBead(projectRoot, bead, policy),
    }));
}

function summarizeTargetFileBudgets(projectRoot: string, bead: SovereignBead, policy: HostGovernorPolicy): Array<Record<string, unknown>> {
    return getBeadTargets(bead).map((target) => {
        const lineCount = readTargetLineCount(projectRoot, target);
        return {
            path: target,
            line_count: lineCount,
            verification_like: isVerificationOrDocumentationTarget(target),
            local_worker_fit: lineCount === null
                ? null
                : (isVerificationOrDocumentationTarget(target)
                    ? lineCount <= policy.max_total_target_lines
                    : lineCount <= policy.max_implementation_lines),
        };
    });
}

function summarizeBlockedBeads(projectRoot: string, beads: SovereignBead[], policy: HostGovernorPolicy): Array<Record<string, unknown>> {
    return beads.map((bead) => ({
        bead_id: bead.id,
        status: bead.status,
        target_path: bead.target_path ?? bead.target_ref ?? null,
        triage_reason: bead.triage_reason ?? null,
        rationale: bead.rationale,
        focus_hint: typeof bead.critique_payload?.focus_hint === 'string' ? bead.critique_payload.focus_hint : null,
        acceptance_criteria: bead.acceptance_criteria ?? null,
        checker_shell: bead.checker_shell ?? null,
        architect_opinion: bead.architect_opinion ?? null,
        target_file_budgets: summarizeTargetFileBudgets(projectRoot, bead, policy),
    }));
}

function uniqueStrings(values: Iterable<string>): string[] {
    return Array.from(new Set(Array.from(values).map((value) => value.trim()).filter(Boolean)));
}

function getPromotionLimit(payload: HostGovernorWeavePayload): number {
    return Math.max(1, payload.max_promotions ?? 5);
}

function buildBlockedBeadReplanQuery(projectRoot: string, beads: SovereignBead[], policy: HostGovernorPolicy): string {
    return [
        'Replan blocked Hall beads.',
        'Take a big step back and reassess using first principles.',
        'The following beads are BLOCKED or NEEDS_TRIAGE and require a revised plan.',
        'Produce micro-beads for the local SovereignWorker: exactly 1 implementation target, optionally 1 supporting verification/docs target, exactly 1 checker path, and concise acceptance criteria.',
        `If target_file_budgets show an implementation file above ${policy.max_implementation_lines} lines or a combined surface above ${policy.max_total_target_lines} lines, do not target the whole file again.`,
        'For oversized or cross-cutting files, split by named function or focused section and repeat that scope explicitly in focus_hint, title, and rationale.',
        'Do not rely on inferred imports or dependencies that are not directly verifiable from the named targets.',
        'Keep the new plan aligned with the CStar framework and the One Mind governance policy.',
        '',
        `BLOCKED_BEADS:\n${JSON.stringify(summarizeBlockedBeads(projectRoot, beads, policy), null, 2)}`,
    ].join('\n');
}

function getPendingReplannedBeadIds(projectRoot: string): Set<string> {
    const sessions = listHallPlanningSessions(projectRoot, { statuses: ACTIVE_PLANNING_STATUSES });
    const ids = new Set<string>();

    for (const session of sessions) {
        const beadIds = Array.isArray(session.metadata?.replanned_bead_ids)
            ? session.metadata.replanned_bead_ids
                .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
                .filter(Boolean)
            : [];
        for (const beadId of beadIds) {
            ids.add(beadId);
        }
    }

    return ids;
}

function getPlanningSessionBeadIds(projectRoot: string, planningSessionId: string): string[] {
    const session = getHallPlanningSession(planningSessionId);
    const metadataBeadIds = Array.isArray(session?.metadata?.bead_ids)
        ? session?.metadata?.bead_ids
            .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
            .filter(Boolean)
        : [];
    if (metadataBeadIds.length > 0) {
        return uniqueStrings(metadataBeadIds);
    }

    return uniqueStrings(
        listHallSkillProposals(projectRoot, { skill_id: 'chant', statuses: ['PROPOSED', 'VALIDATED'] })
            .filter((proposal) => proposal.metadata?.session_id === planningSessionId && typeof proposal.bead_id === 'string')
            .map((proposal) => proposal.bead_id as string),
    );
}

function getPlanningSessionBranchDigest(projectRoot: string, session: HallPlanningSessionRecord | null): HallOneMindBranchDigest | undefined {
    const metadataDigest = session?.metadata?.branch_ledger_digest;
    if (metadataDigest && typeof metadataDigest === 'object' && !Array.isArray(metadataDigest)) {
        const digest = metadataDigest as HallOneMindBranchDigest;
        if (Array.isArray(digest.groups) && typeof digest.total_branches === 'number') {
            return digest;
        }
    }

    const traceId = typeof session?.metadata?.trace_id === 'string' && session.metadata.trace_id.trim()
        ? session.metadata.trace_id.trim()
        : undefined;
    if (!traceId) {
        return undefined;
    }
    return summarizeHallOneMindBranches(projectRoot, {
        traceId,
        maxGroups: 4,
        maxArtifacts: 6,
    }) ?? undefined;
}

function getProjectBeads(projectRoot: string, statuses?: HallPlanningSessionStatus[] | string[]): SovereignBead[] {
    const repoId = buildHallRepositoryId(normalizeHallPath(projectRoot));
    if (!statuses || statuses.length === 0) {
        return getHallBeads(repoId);
    }

    return uniqueStrings(statuses).flatMap((status) => getHallBeadsByStatus(repoId, status as SovereignBead['status']));
}

function collectGovernableCandidates(
    projectRoot: string,
    limit: number,
    policy: HostGovernorPolicy,
    options: {
        beadIds?: string[];
        excludeBeadIds?: string[];
    } = {},
): SovereignBead[] {
    const beadIdFilter = options.beadIds ? new Set(options.beadIds) : null;
    const excludedIds = new Set(options.excludeBeadIds ?? []);

    return getProjectBeads(projectRoot, ['OPEN', 'SET-PENDING'])
        .filter((bead) => hasGovernableValidation(bead, projectRoot) && isBoundedBead(projectRoot, bead, policy))
        .filter((bead) => !beadIdFilter || beadIdFilter.has(bead.id))
        .filter((bead) => !excludedIds.has(bead.id))
        .slice(0, limit);
}

function normalizeApprovedIds(
    decision: HostGovernorDecision,
    candidates: SovereignBead[],
): { approved: string[]; deferred: string[]; reasonCode?: string; notes?: string } {
    if (decision.approved_bead_ids !== undefined && !Array.isArray(decision.approved_bead_ids)) {
        throw new Error('Host governor response approved_bead_ids must be an array of strings.');
    }
    if (decision.deferred_bead_ids !== undefined && !Array.isArray(decision.deferred_bead_ids)) {
        throw new Error('Host governor response deferred_bead_ids must be an array of strings.');
    }
    if (decision.reason_code !== undefined && typeof decision.reason_code !== 'string') {
        throw new Error('Host governor response reason_code must be a string when provided.');
    }
    if (decision.notes !== undefined && typeof decision.notes !== 'string') {
        throw new Error('Host governor response notes must be a string when provided.');
    }

    const candidateIds = new Set(candidates.map((bead) => bead.id));
    const approved = asStringArray(decision.approved_bead_ids).filter((beadId) => candidateIds.has(beadId));
    const deferred = asStringArray(decision.deferred_bead_ids).filter((beadId) => candidateIds.has(beadId));
    const reasonCode = typeof decision.reason_code === 'string' && decision.reason_code.trim()
        ? decision.reason_code.trim()
        : undefined;
    const notes = typeof decision.notes === 'string' && decision.notes.trim() ? decision.notes.trim() : undefined;

    return {
        approved: Array.from(new Set(approved)),
        deferred: Array.from(new Set(deferred)),
        reasonCode,
        notes,
    };
}

export class HostGovernorWeave implements RuntimeAdapter<HostGovernorWeavePayload> {
    public readonly id = 'weave:host-governor';
    private readonly dispatchPort: RuntimeDispatchPort;
    private readonly hostTextInvoker: HostTextInvoker;

    public constructor(
        dispatchPort: RuntimeDispatchPort,
        hostTextInvoker: HostTextInvoker = defaultHostTextInvoker,
    ) {
        this.dispatchPort = dispatchPort;
        this.hostTextInvoker = hostTextInvoker;
    }

    private async evaluateCandidates(
        candidates: SovereignBead[],
        provider: HostProvider,
        projectRoot: string,
        payload: HostGovernorWeavePayload,
        policy: HostGovernorPolicy,
        env: NodeJS.ProcessEnv,
        source: GovernancePassResult['source'],
        planningSessionId?: string,
    ): Promise<GovernancePassResult> {
        const planningSession = planningSessionId ? getHallPlanningSession(planningSessionId) : null;
        const branchDigest = planningSession ? getPlanningSessionBranchDigest(projectRoot, planningSession) : undefined;
        const rawText = await this.hostTextInvoker({
            provider,
            projectRoot,
            source: 'runtime:host-governor',
            env,
            systemPrompt: 'You are the Corvus Star Host Governor. Return strict JSON only.',
            prompt: [
                'Take a big step back and reassess using first principles.',
                'Review the candidate Hall beads and decide which may be promoted to SET now.',
                'Approve only beads that are aligned with the CStar framework, micro-bounded for the local SovereignWorker, and backed by explicit checker_shell validation.',
                `Micro-bounded means: at most ${policy.max_total_targets} total target(s), exactly ${policy.max_implementation_targets} implementation target(s) outside tests/docs, and concise acceptance criteria capped at ${policy.max_acceptance_items} item(s).`,
                'Defer anything ambiguous, architectural, cross-cutting, or weakly specified.',
                'Return strict JSON only in this format:',
                '{ "approved_bead_ids": ["..."], "deferred_bead_ids": ["..."], "reason_code": "...", "notes": "..." }',
                '',
                'REASON_CODE OPTIONS: TOO_WIDE, WEAK_VALIDATION, AMBIGUOUS_INTENT, ARCHITECTURAL_SMELL, MISSING_CONTEXT, REDUNDANT.',
                '',
                `TASK: ${payload.task ?? 'Resume host-governed autonomy loop.'}`,
                `WORKSPACE ROOT: ${projectRoot}`,
                `CANDIDATE SOURCE: ${source === 'replan' ? 'fresh chant replan' : 'existing hall backlog'}`,
                planningSessionId ? `PLANNING SESSION: ${planningSessionId}` : '',
                branchDigest ? `PLANNING BRANCH DIGEST:\n${JSON.stringify(branchDigest, null, 2)}` : '',
                '',
                `POLICY:\n${JSON.stringify(policy, null, 2)}`,
                `CANDIDATES:\n${JSON.stringify(summarizeCandidates(projectRoot, candidates, policy), null, 2)}`,
            ].filter(Boolean).join('\n'),
        });

        const decision = normalizeApprovedIds(extractJsonObject(rawText) as HostGovernorDecision, candidates);
        const now = Date.now();

        if (!payload.dry_run) {
            this.updateBeadStatusAndMetadata(projectRoot, decision.approved, decision.deferred, policy, decision.reasonCode, now, planningSessionId);
        }

        return {
            source,
            planningSessionId,
            candidateBeadIds: candidates.map((bead) => bead.id),
            promotedBeadIds: decision.approved,
            deferredBeadIds: decision.deferred,
            reasonCode: decision.reasonCode,
            notes: decision.notes,
        };
    }

    private updateBeadStatusAndMetadata(
        projectRoot: string,
        approvedBeadIds: string[],
        deferredBeadIds: string[],
        policy: HostGovernorPolicy,
        reasonCode: string | undefined,
        updatedAt: number,
        planningSessionId?: string,
    ): void {
        const repoId = buildHallRepositoryId(normalizeHallPath(projectRoot));
        const db = getDb();
        const beads = getProjectBeads(projectRoot);

        if (approvedBeadIds.length > 0) {
            const promoteBead = db.prepare(`
                UPDATE hall_beads
                SET status = 'SET',
                    assigned_agent = ?,
                    triage_reason = NULL,
                    updated_at = ?
                WHERE bead_id = ? AND repo_id = ?
            `);
            for (const beadId of approvedBeadIds) {
                const bead = beads.find(b => b.id === beadId);
                let agent = 'SOVEREIGN-WORKER';
                if (bead) {
                    const targets = getBeadTargets(bead);
                    if (!fitsLocalWorkerFileBudget(projectRoot, targets, policy)) {
                        agent = 'HOST-WORKER';
                    }
                }
                promoteBead.run(agent, updatedAt, beadId, repoId);
            }

            const linkedProposals = listHallSkillProposals(projectRoot, { statuses: ['PROPOSED', 'VALIDATED'] })
                .filter((proposal) => proposal.bead_id && approvedBeadIds.includes(proposal.bead_id));

            for (const proposal of linkedProposals) {
                saveHallSkillProposal({
                    ...proposal,
                    status: 'PROMOTED',
                    promotion_note: planningSessionId
                        ? `Promoted to SET by HOST-GOVERNOR from planning session ${planningSessionId}.`
                        : 'Promoted to SET by HOST-GOVERNOR.',
                    promoted_at: updatedAt,
                    promoted_by: 'HOST-GOVERNOR',
                    updated_at: updatedAt,
                });
            }
        }

        if (deferredBeadIds.length > 0) {
            const deferBead = db.prepare(`
                UPDATE hall_beads
                SET triage_reason = ?,
                    updated_at = ?
                WHERE bead_id = ? AND repo_id = ?
            `);
            for (const beadId of deferredBeadIds) {
                deferBead.run(reasonCode || 'DEFERRED_BY_GOVERNOR', updatedAt, beadId, repoId);
            }
        }
    }

    private async triggerBlockedBeadReplan(
        blockedBeads: SovereignBead[],
        invocation: WeaveInvocation<HostGovernorWeavePayload>,
        payload: HostGovernorWeavePayload,
        projectRoot: string,
        policy: HostGovernorPolicy,
    ): Promise<ReplanResult> {
        const beadIds = blockedBeads.map((bead) => bead.id);
        if (beadIds.length === 0) {
            return { invoked: false, beadIds: [] };
        }

        const pendingBeadIds = getPendingReplannedBeadIds(projectRoot);
        const beadsToReplan = blockedBeads.filter((bead) => !pendingBeadIds.has(bead.id));
        if (beadsToReplan.length === 0) {
            return { invoked: false, beadIds: [] };
        }

        const chantResult = await this.dispatchPort.dispatch<ChantWeavePayload>({
            weave_id: 'weave:chant',
            payload: {
                query: buildBlockedBeadReplanQuery(projectRoot, beadsToReplan, policy),
                project_root: projectRoot,
                cwd: payload.cwd ?? projectRoot,
                source: 'cli',
            },
            session: {
                mode: invocation.session?.mode ?? 'cli',
                interactive: invocation.session?.interactive ?? true,
            },
            target: invocation.target,
        });

        const planningSessionId = typeof chantResult.metadata?.planning_session_id === 'string'
            ? chantResult.metadata.planning_session_id
            : undefined;
        const planningStatus = typeof chantResult.metadata?.planning_status === 'string'
            ? chantResult.metadata.planning_status
            : undefined;

        if (planningSessionId) {
            const session = getHallPlanningSession(planningSessionId);
            if (session) {
                saveHallPlanningSession({
                    ...session,
                    metadata: {
                        ...(session.metadata ?? {}),
                        replanned_bead_ids: beadsToReplan.map((bead) => bead.id),
                        replan_origin: 'host-governor',
                        replan_generated_at: Date.now(),
                    },
                    updated_at: Date.now(),
                });
            }
        }

        return {
            invoked: true,
            planningSessionId,
            planningStatus,
            output: chantResult.output,
            beadIds: beadsToReplan.map((bead) => bead.id),
        };
    }

    private async governReplannedSession(
        planningSessionId: string,
        provider: HostProvider,
        projectRoot: string,
        payload: HostGovernorWeavePayload,
        policy: HostGovernorPolicy,
        env: NodeJS.ProcessEnv,
        promotedCount: number,
        excludedBeadIds: string[],
    ): Promise<GovernancePassResult | null> {
        const limit = Math.max(0, getPromotionLimit(payload) - promotedCount);
        if (limit <= 0) {
            return null;
        }

        const candidates = collectGovernableCandidates(projectRoot, limit, policy, {
            beadIds: getPlanningSessionBeadIds(projectRoot, planningSessionId),
            excludeBeadIds: excludedBeadIds,
        });
        if (candidates.length === 0) {
            return null;
        }

        return await this.evaluateCandidates(candidates, provider, projectRoot, payload, policy, env, 'replan', planningSessionId);
    }

    public async execute(
        invocation: WeaveInvocation<HostGovernorWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const projectRoot = payload.project_root || context.workspace_root;
        const provider = resolveRuntimeHostProvider(context);
        const policy = resolveHostGovernorPolicy(payload.policy);

        if (!provider) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: 'Host governor requires an active host session. Governance is paused until the One Mind is available.',
            };
        }

        const promotionLimit = getPromotionLimit(payload);
        const runtimeEnv = { ...process.env, ...context.env } as NodeJS.ProcessEnv;
        const initialCandidates = collectGovernableCandidates(projectRoot, promotionLimit, policy);
        const governancePasses: GovernancePassResult[] = [];
        const repoId = buildHallRepositoryId(normalizeHallPath(projectRoot));
        const orchestrateResults: WeaveResult[] = [];
        let replanResult: ReplanResult = { invoked: false, beadIds: [] };

        if (initialCandidates.length === 0) {
            replanResult = !payload.dry_run && payload.auto_replan_blocked !== false
                ? await this.triggerBlockedBeadReplan(
                    getProjectBeads(projectRoot, ['BLOCKED', 'NEEDS_TRIAGE']),
                    invocation,
                    payload,
                    projectRoot,
                    policy,
                )
                : { invoked: false, beadIds: [] } satisfies ReplanResult;

            if (replanResult.planningSessionId) {
                try {
                    const replannedPass = await this.governReplannedSession(
                        replanResult.planningSessionId,
                        provider,
                        projectRoot,
                        payload,
                        policy,
                        runtimeEnv,
                        0,
                        [],
                    );
                    if (replannedPass) {
                        governancePasses.push(replannedPass);
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    return {
                        weave_id: this.id,
                        status: 'FAILURE',
                        output: '',
                        error: `Host governor could not complete its governance pass for replanned beads: ${message}`,
                        metadata: {
                            provider,
                            policy,
                            replanned_bead_ids: replanResult.beadIds,
                            replan_planning_session_id: replanResult.planningSessionId,
                            replan_planning_status: replanResult.planningStatus,
                        },
                    };
                }
            }

            const replannedPass = governancePasses[0];
            if (!payload.dry_run && payload.auto_execute && replannedPass && replannedPass.promotedBeadIds.length > 0) {
                const replannedOrchestrate = await this.dispatchPort.dispatch<OrchestrateWeavePayload>({
                    weave_id: 'weave:orchestrate',
                    payload: {
                        bead_ids: replannedPass.promotedBeadIds,
                        max_parallel: payload.max_parallel ?? 1,
                        project_root: projectRoot,
                        cwd: payload.cwd ?? projectRoot,
                        source: 'runtime',
                    },
                    session: invocation.session,
                    target: invocation.target,
                });

                if (replannedOrchestrate.status === 'FAILURE') {
                    return {
                        weave_id: this.id,
                        status: 'FAILURE',
                        output: '',
                        error: replannedOrchestrate.error ?? 'Host governor promoted replanned beads, but orchestration failed.',
                        metadata: {
                            promoted_bead_ids: replannedPass.promotedBeadIds,
                            deferred_bead_ids: replannedPass.deferredBeadIds,
                            provider,
                        },
                    };
                }

                orchestrateResults.push(replannedOrchestrate);
            }

            if (governancePasses.length > 0) {
                const promoted = uniqueStrings(governancePasses.flatMap((pass) => pass.promotedBeadIds));
                const deferred = uniqueStrings(governancePasses.flatMap((pass) => pass.deferredBeadIds));
                const notes = governancePasses.map((pass) => pass.notes).filter((value): value is string => Boolean(value && value.trim()));
                const noteText = notes.join(' ').trim() || undefined;
                const summaryParts = [
                    promoted.length > 0
                        ? `Host governor promoted ${promoted.length} bead(s) to SET.`
                        : 'Host governor deferred all candidate beads.',
                    ...notes,
                    ...orchestrateResults.map((result) => result.output).filter(Boolean),
                    replanResult.invoked
                        ? `Triggered chant replanning for ${replanResult.beadIds.length} blocked bead(s).`
                        : undefined,
                    replanResult.output,
                ].filter((value): value is string => Boolean(value && value.trim()));

                saveHallSkillObservation({
                    observation_id: `observation:host-governor:${randomUUID()}`,
                    repo_id: repoId,
                    skill_id: 'host-governor',
                    outcome: promoted.length > 0 ? 'PROMOTED' : 'DEFERRED',
                    observation: promoted.length > 0
                        ? `Host governor promoted ${promoted.length} bead(s) to SET.`
                        : 'Host governor deferred all candidate beads.',
                    created_at: Date.now(),
                    metadata: {
                        provider,
                        task: payload.task ?? null,
                        promoted_bead_ids: promoted,
                        deferred_bead_ids: deferred,
                        notes: noteText,
                        passes: governancePasses,
                    },
                });

                return {
                    weave_id: this.id,
                    status: 'SUCCESS',
                    output: summaryParts.join(' '),
                    metadata: {
                        promoted_bead_ids: promoted,
                        deferred_bead_ids: deferred,
                        total_candidates: governancePasses.reduce((sum, pass) => sum + pass.candidateBeadIds.length, 0),
                        provider,
                        notes: noteText,
                        policy,
                        delegated_orchestrate: orchestrateResults.length > 0,
                        orchestrate_status: orchestrateResults.at(-1)?.status,
                        replanned_bead_ids: replanResult.beadIds,
                        replan_planning_session_id: replanResult.planningSessionId,
                        replan_planning_status: replanResult.planningStatus,
                        replan_promoted_bead_ids: governancePasses
                            .filter((pass) => pass.source === 'replan')
                            .flatMap((pass) => pass.promotedBeadIds),
                    },
                };
            }

            return {
                weave_id: this.id,
                status: 'SUCCESS',
                output: replanResult.invoked
                    ? `Host governor found no bounded OPEN beads with governable validation. Triggered chant replanning for ${replanResult.beadIds.length} blocked bead(s). ${replanResult.output ?? ''}`.trim()
                    : 'Host governor found no bounded OPEN beads with governable validation. Governance remains paused.',
                metadata: {
                    promoted_bead_ids: [],
                    deferred_bead_ids: [],
                    total_candidates: 0,
                    provider,
                    policy,
                    replanned_bead_ids: replanResult.beadIds,
                    replan_planning_session_id: replanResult.planningSessionId,
                    replan_planning_status: replanResult.planningStatus,
                },
            };
        }

        let existingPass: GovernancePassResult;
        try {
            existingPass = await this.evaluateCandidates(initialCandidates, provider, projectRoot, payload, policy, runtimeEnv, 'existing');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: `Host governor could not complete its governance pass: ${message}`,
            };
        }
        governancePasses.push(existingPass);

        if (!payload.dry_run && payload.auto_execute && existingPass.promotedBeadIds.length > 0) {
            const orchestrateResult = await this.dispatchPort.dispatch<OrchestrateWeavePayload>({
                weave_id: 'weave:orchestrate',
                payload: {
                    bead_ids: existingPass.promotedBeadIds,
                    max_parallel: payload.max_parallel ?? 1,
                    project_root: projectRoot,
                    cwd: payload.cwd ?? projectRoot,
                    source: 'runtime',
                },
                session: invocation.session,
                target: invocation.target,
            });
            orchestrateResults.push(orchestrateResult);

            if (orchestrateResult.status === 'FAILURE') {
                return {
                    weave_id: this.id,
                    status: 'FAILURE',
                    output: '',
                    error: orchestrateResult.error ?? 'Host governor promoted beads, but orchestration failed.',
                    metadata: {
                        promoted_bead_ids: existingPass.promotedBeadIds,
                        deferred_bead_ids: existingPass.deferredBeadIds,
                        provider,
                    },
                };
            }

            if (payload.auto_replan_blocked !== false) {
                const blockedBeads = getProjectBeads(projectRoot, ['BLOCKED', 'NEEDS_TRIAGE'])
                    .filter((bead) => existingPass.promotedBeadIds.includes(bead.id));
                replanResult = await this.triggerBlockedBeadReplan(blockedBeads, invocation, payload, projectRoot, policy);
            }
        } else if (!payload.dry_run && payload.auto_replan_blocked !== false) {
            const blockedBeads = getProjectBeads(projectRoot, ['BLOCKED', 'NEEDS_TRIAGE']);
            replanResult = await this.triggerBlockedBeadReplan(blockedBeads, invocation, payload, projectRoot, policy);
        }

        if (replanResult.planningSessionId) {
            try {
                const replannedPass = await this.governReplannedSession(
                    replanResult.planningSessionId,
                    provider,
                    projectRoot,
                    payload,
                    policy,
                    runtimeEnv,
                    uniqueStrings(governancePasses.flatMap((pass) => pass.promotedBeadIds)).length,
                    uniqueStrings(governancePasses.flatMap((pass) => pass.candidateBeadIds)),
                );
                if (replannedPass) {
                    governancePasses.push(replannedPass);
                    if (!payload.dry_run && payload.auto_execute && replannedPass.promotedBeadIds.length > 0) {
                        const orchestrateResult = await this.dispatchPort.dispatch<OrchestrateWeavePayload>({
                            weave_id: 'weave:orchestrate',
                            payload: {
                                bead_ids: replannedPass.promotedBeadIds,
                                max_parallel: payload.max_parallel ?? 1,
                                project_root: projectRoot,
                                cwd: payload.cwd ?? projectRoot,
                                source: 'runtime',
                            },
                            session: invocation.session,
                            target: invocation.target,
                        });
                        orchestrateResults.push(orchestrateResult);

                        if (orchestrateResult.status === 'FAILURE') {
                            return {
                                weave_id: this.id,
                                status: 'FAILURE',
                                output: '',
                                error: orchestrateResult.error ?? 'Host governor promoted replanned beads, but orchestration failed.',
                                metadata: {
                                    promoted_bead_ids: uniqueStrings(governancePasses.flatMap((pass) => pass.promotedBeadIds)),
                                    deferred_bead_ids: uniqueStrings(governancePasses.flatMap((pass) => pass.deferredBeadIds)),
                                    provider,
                                    replanned_bead_ids: replanResult.beadIds,
                                    replan_planning_session_id: replanResult.planningSessionId,
                                    replan_planning_status: replanResult.planningStatus,
                                },
                            };
                        }
                    }
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    weave_id: this.id,
                    status: 'FAILURE',
                    output: '',
                    error: `Host governor could not complete its governance pass for replanned beads: ${message}`,
                    metadata: {
                        context_policy: 'project',
                        promoted_bead_ids: uniqueStrings(governancePasses.flatMap((pass) => pass.promotedBeadIds)),
                        deferred_bead_ids: uniqueStrings(governancePasses.flatMap((pass) => pass.deferredBeadIds)),
                        provider,
                        replanned_bead_ids: replanResult.beadIds,
                        replan_planning_session_id: replanResult.planningSessionId,
                        replan_planning_status: replanResult.planningStatus,
                    },
                };
            }
        }

        const promoted = uniqueStrings(governancePasses.flatMap((pass) => pass.promotedBeadIds));
        const deferred = uniqueStrings(governancePasses.flatMap((pass) => pass.deferredBeadIds));
        const notes = governancePasses.map((pass) => pass.notes).filter((value): value is string => Boolean(value && value.trim()));
        const noteText = notes.join(' ').trim() || undefined;
        const now = Date.now();

        saveHallSkillObservation({
            observation_id: `observation:host-governor:${randomUUID()}`,
            repo_id: repoId,
            skill_id: 'host-governor',
            outcome: promoted.length > 0 ? 'PROMOTED' : 'DEFERRED',
            observation: promoted.length > 0
                ? `Host governor promoted ${promoted.length} bead(s) to SET.`
                : 'Host governor deferred all candidate beads.',
            created_at: now,
            metadata: {
                provider,
                task: payload.task ?? null,
                promoted_bead_ids: promoted,
                deferred_bead_ids: deferred,
                notes: noteText,
                passes: governancePasses,
                policy,
            },
        });

        const summaryParts = [
            promoted.length > 0
                ? `Host governor promoted ${promoted.length} bead(s) to SET.`
                : 'Host governor deferred all candidate beads.',
            ...notes,
            ...orchestrateResults.map((result) => result.output).filter((value): value is string => Boolean(value && value.trim())),
            replanResult.invoked
                ? `Triggered chant replanning for ${replanResult.beadIds.length} blocked bead(s).`
                : undefined,
            replanResult.output,
        ].filter((value): value is string => Boolean(value && value.trim()));

        return {
            weave_id: this.id,
            status: 'SUCCESS',
            output: summaryParts.join(' '),
            metadata: {
                context_policy: 'project',
                promoted_bead_ids: promoted,
                deferred_bead_ids: deferred,
                total_candidates: governancePasses.reduce((sum, pass) => sum + pass.candidateBeadIds.length, 0),
                provider,
                notes: noteText,
                policy,
                delegated_orchestrate: orchestrateResults.length > 0,
                orchestrate_status: orchestrateResults.at(-1)?.status,
                replanned_bead_ids: replanResult.beadIds,
                replan_planning_session_id: replanResult.planningSessionId,
                replan_planning_status: replanResult.planningStatus,
                replan_promoted_bead_ids: governancePasses
                    .filter((pass) => pass.source === 'replan')
                    .flatMap((pass) => pass.promotedBeadIds),
            },
        };
    }
}
