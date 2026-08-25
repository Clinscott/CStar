import type { HallPlanningSessionRecord } from '../../../types/hall.js';
import {
    attachCouncilExpertToAuguryContract,
    formatTraceDesignation,
    normalizeAuguryContractForActiveState,
    uniqueStrings,
} from './trace_contract.js';
import { buildTraceStatusPayload } from './trace_payload.js';
import type {
    AuguryDiagnosticCheck,
    AuguryDiagnosticStatus,
    AuguryDoctorPayload,
    AuguryExplainPayload,
    AuguryGuardrailPayload,
    TraceContractPayload,
    TraceStatusPayload,
} from './trace_types.js';

export function makeAuguryCheck(
    status: AuguryDiagnosticStatus,
    message: string,
    details?: Record<string, unknown>,
): AuguryDiagnosticCheck {
    return {
        status,
        ok: status === 'pass',
        message,
        ...(details ? { details } : {}),
    };
}

export function inferAuguryScope(payload: TraceStatusPayload | null, rootPath: string): { value: string; basis: string } {
    const lineage = payload?.lineage;
    const projectName = rootPath.replace(/\\/g, '/').split('/').filter(Boolean).at(-1);
    if (lineage?.spoke_name) {
        return {
            value: `spoke:${lineage.spoke_name}`,
            basis: 'lineage.spoke_name',
        };
    }
    if (lineage?.target_domain) {
        const normalizedDomain = lineage.target_domain.toLowerCase();
        if (normalizedDomain === 'brain') {
            return {
                value: `brain:${projectName || 'CStar'}`,
                basis: 'lineage.target_domain + project_root basename',
            };
        }
        if (normalizedDomain === 'spoke') {
            return {
                value: `spoke:${projectName && projectName !== 'CStar' ? projectName : 'unknown'}`,
                basis: 'lineage.target_domain + project_root basename',
            };
        }
        return {
            value: lineage.target_domain,
            basis: 'lineage.target_domain',
        };
    }
    if (projectName === 'CStar') {
        return {
            value: 'brain:CStar',
            basis: 'project_root basename',
        };
    }
    return {
        value: projectName || 'unknown',
        basis: 'project_root basename',
    };
}

export function inferExpectedExpertLabels(contract: TraceContractPayload | undefined): string[] {
    const text = [
        contract?.intent_category,
        contract?.intent,
        contract?.selection_name,
        ...(contract?.mimirs_well ?? []),
    ].join(' ').toLowerCase();
    const expected: string[] = [];
    if (/\b(ai|llm|model|embedding|rag|neural|inference|prompt)\b/.test(text)) {
        expected.push('KARPATHY');
    }
    if (/\b(game|render|physics|performance|hot-path|frame|fps|rpg)\b/.test(text)) {
        expected.push('CARMACK');
    }
    if (/\b(distributed|orchestrate|scheduler|queue|broker|parallel|concurrency)\b/.test(text)) {
        expected.push('DEAN');
    }
    if (/\b(observe|signal|trace|augury|telemetry|diagnostic|ambiguity|noise)\b/.test(text)) {
        expected.push('SHANNON');
    }
    if (/\b(security|guard|safety|failure|recover|fault|invariant|policy)\b/.test(text)) {
        expected.push('HAMILTON');
    }
    if (/\b(interface|api|kernel|linux|syscall)\b/.test(text)) {
        expected.push('TORVALDS');
    }
    return uniqueStrings(expected);
}

export function buildScopeCheck(payload: TraceStatusPayload | null, rootPath: string): AuguryDiagnosticCheck {
    const scope = inferAuguryScope(payload, rootPath);
    const lineage = payload?.lineage;
    if (!payload) {
        return makeAuguryCheck('fail', 'No active Augury state was found.');
    }
    if (lineage?.target_domain === 'spoke' && !lineage.spoke_name) {
        return makeAuguryCheck('warn', 'Spoke scope is declared without a spoke name.', { scope });
    }
    if (lineage?.target_domain === 'brain' && lineage.spoke_name) {
        return makeAuguryCheck('warn', 'Brain scope carries a spoke name; verify the target boundary.', { scope });
    }
    return makeAuguryCheck('pass', `Scope resolves to ${scope.value}.`, { scope });
}

export function buildRouteCheck(contract: TraceContractPayload | undefined): AuguryDiagnosticCheck {
    const allowedTiers = new Set(['SKILL', 'WEAVE', 'SPELL']);
    const missing = [
        contract?.intent_category ? '' : 'intent_category',
        contract?.intent ? '' : 'intent',
        contract?.selection_tier ? '' : 'selection_tier',
        contract?.selection_name ? '' : 'selection_name',
    ].filter(Boolean);
    if (!contract) {
        return makeAuguryCheck('fail', 'No Augury contract is attached to the active handoff.');
    }
    if (missing.length > 0) {
        return makeAuguryCheck('fail', `Augury route is missing ${missing.join(', ')}.`, { missing });
    }
    if (!allowedTiers.has(String(contract.selection_tier).toUpperCase())) {
        return makeAuguryCheck('warn', `Selection tier '${contract.selection_tier}' is not a canonical tier.`, {
            allowed_tiers: Array.from(allowedTiers),
        });
    }
    return makeAuguryCheck('pass', `Route resolves to ${formatTraceDesignation(contract)}.`);
}

export function buildExpertCheck(contract: TraceContractPayload | undefined): AuguryDiagnosticCheck {
    const expertLabel = (contract?.council_expert?.label ?? contract?.council_expert?.id)?.toUpperCase();
    const expected = inferExpectedExpertLabels(contract);
    if (!contract?.council_expert?.label && !contract?.council_expert?.id) {
        return makeAuguryCheck('warn', 'No Council expert is attached to the Augury contract.', { expected });
    }
    if (expected.length > 0 && expertLabel && !expected.includes(expertLabel)) {
        return makeAuguryCheck('warn', `Council expert ${expertLabel} may not match the strongest detected task signals.`, {
            expected,
            actual: expertLabel,
        });
    }
    return makeAuguryCheck('pass', `Council expert resolves to ${contract.council_expert.label ?? contract.council_expert.id}.`, {
        expected,
    });
}

export function isVagueMimirTarget(target: string): boolean {
    const trimmed = target.trim();
    if (!trimmed) {
        return true;
    }
    return !trimmed.includes('/') && !trimmed.includes('\\') && !/\.[a-z0-9]+$/i.test(trimmed);
}

export function buildMimirCheck(contract: TraceContractPayload | undefined): AuguryDiagnosticCheck {
    const targets = contract?.mimirs_well ?? [];
    const vagueTargets = targets.filter(isVagueMimirTarget);
    if (targets.length === 0) {
        return makeAuguryCheck('fail', 'Augury has no Mimir targets; agents lack a bounded discovery path.');
    }
    if (targets.length > 3) {
        return makeAuguryCheck('warn', 'Augury has more than three Mimir targets; prompt injection will omit extras.', {
            count: targets.length,
            omitted_from_prompt: targets.length - 3,
        });
    }
    if (vagueTargets.length > 0) {
        return makeAuguryCheck('warn', 'Some Mimir targets are vague; prefer concrete files, dirs, or Hall handles.', {
            vague_targets: vagueTargets,
        });
    }
    return makeAuguryCheck('pass', `Mimir targets are bounded (${targets.length}).`, { count: targets.length });
}

export function buildNoiseCheck(
    checks: Array<AuguryDiagnosticCheck>,
    payload: TraceStatusPayload | null,
    contract: TraceContractPayload | undefined,
): { check: AuguryDiagnosticCheck; noiseScore: number } {
    const warningPenalty = checks.filter((check) => check.status === 'warn').length * 15;
    const failurePenalty = checks.filter((check) => check.status === 'fail').length * 35;
    const mimirPenalty = Math.max(0, (contract?.mimirs_well.length ?? 0) - 3) * 10;
    const targetPenalty = Math.max(0, (payload?.agent_handoff.target_paths.length ?? 0) - 5) * 5;
    const noiseScore = Math.min(100, warningPenalty + failurePenalty + mimirPenalty + targetPenalty);
    if (noiseScore >= 70) {
        return {
            noiseScore,
            check: makeAuguryCheck('fail', 'Augury has too much diagnostic risk for safe agent routing.', { noise_score: noiseScore }),
        };
    }
    if (noiseScore > 25) {
        return {
            noiseScore,
            check: makeAuguryCheck('warn', 'Augury is usable but has avoidable routing noise.', { noise_score: noiseScore }),
        };
    }
    return {
        noiseScore,
        check: makeAuguryCheck('pass', 'Augury is compact enough for agent use.', { noise_score: noiseScore }),
    };
}

export function getAuguryWarnings(checks: Record<string, AuguryDiagnosticCheck>): string[] {
    return Object.values(checks)
        .filter((check) => check.status !== 'pass')
        .map((check) => check.message);
}

export function buildAuguryGuardrail(
    checks: Record<string, AuguryDiagnosticCheck>,
    status: AuguryDiagnosticStatus,
): AuguryGuardrailPayload {
    const failedChecks = Object.entries(checks)
        .filter(([, check]) => check.status === 'fail')
        .map(([name]) => name);
    const warningChecks = Object.entries(checks)
        .filter(([, check]) => check.status === 'warn')
        .map(([name]) => name);

    if (status === 'fail') {
        return {
            verdict: 'block',
            action: 'repair',
            reason: failedChecks.length > 0
                ? `Blocked by failed Augury checks: ${failedChecks.join(', ')}.`
                : 'Blocked by failed Augury diagnostics.',
            failed_checks: failedChecks,
            warning_checks: warningChecks,
        };
    }
    if (status === 'warn') {
        return {
            verdict: 'caution',
            action: 'recover',
            reason: warningChecks.length > 0
                ? `Proceed only after reviewing warning checks: ${warningChecks.join(', ')}.`
                : 'Proceed with caution after reviewing Augury diagnostics.',
            failed_checks: failedChecks,
            warning_checks: warningChecks,
        };
    }
    return {
        verdict: 'allow',
        action: 'continue',
        reason: 'All Augury checks passed.',
        failed_checks: [],
        warning_checks: [],
    };
}

export function buildAuguryDoctorFromStatus(
    payload: TraceStatusPayload | null,
    rootPath: string,
    registryRootPath: string = rootPath,
): AuguryDoctorPayload {
    const contract = attachCouncilExpertToAuguryContract(
        normalizeAuguryContractForActiveState(
            payload?.augury_contract ?? payload?.trace_contract ?? payload?.agent_handoff.designation,
            rootPath,
            registryRootPath,
        ),
    );
    const scope = buildScopeCheck(payload, rootPath);
    const route = buildRouteCheck(contract);
    const expert = buildExpertCheck(contract);
    const mimir = buildMimirCheck(contract);
    const noise = buildNoiseCheck([scope, route, expert, mimir], payload, contract);
    const checks = {
        scope,
        route,
        expert,
        mimir,
        noise: noise.check,
    };
    const statuses = Object.values(checks).map((check) => check.status);
    const status: AuguryDiagnosticStatus = statuses.includes('fail')
        ? 'fail'
        : statuses.includes('warn') ? 'warn' : 'pass';
    const score = Math.max(0, 100 - noise.noiseScore);
    const inferredScope = inferAuguryScope(payload, rootPath);
    const guardrail = buildAuguryGuardrail(checks, status);

    return {
        status,
        score,
        scope_ok: scope.status === 'pass',
        route_ok: route.status === 'pass',
        expert_ok: expert.status === 'pass',
        mimir_ok: mimir.status === 'pass',
        noise_score: noise.noiseScore,
        guardrail,
        agent_next_action: status === 'fail'
            ? 'Repair the Augury contract before editing or dispatching work.'
            : payload?.agent_handoff.next_action ?? 'Run cstar augury handoff --json and choose the next bounded action.',
        warnings: getAuguryWarnings(checks),
        ...(payload ? {
            active: {
                origin: payload.origin,
                handle: payload.handle ?? payload.session_id ?? payload.runtime_bead_id,
                status: payload.status,
                route: contract ? formatTraceDesignation(contract) : undefined,
                scope: inferredScope.value,
                expert: contract?.council_expert?.label ?? contract?.council_expert?.id,
                mimir_count: contract?.mimirs_well.length ?? 0,
                target_paths: payload.agent_handoff.target_paths,
            },
        } : {}),
        checks,
    };
}

export function buildAuguryDoctorPayload(
    session: HallPlanningSessionRecord | null,
    rootPath: string,
    registryRootPath: string = rootPath,
): AuguryDoctorPayload {
    return buildAuguryDoctorFromStatus(
        buildTraceStatusPayload(session, rootPath, registryRootPath),
        rootPath,
        registryRootPath,
    );
}

export function buildAuguryExplainFromStatus(
    payload: TraceStatusPayload | null,
    rootPath: string,
    registryRootPath: string = rootPath,
): AuguryExplainPayload {
    const contract = attachCouncilExpertToAuguryContract(
        normalizeAuguryContractForActiveState(
            payload?.augury_contract ?? payload?.trace_contract ?? payload?.agent_handoff.designation,
            rootPath,
            registryRootPath,
        ),
    );
    const scope = inferAuguryScope(payload, rootPath);
    const doctor = buildAuguryDoctorFromStatus(payload, rootPath, registryRootPath);
    const warnings = doctor.warnings;
    if (!payload || !contract) {
        return {
            status: 'missing',
            guardrail: doctor.guardrail,
            agent_next_action: 'Create or recover an Augury contract before routing agent work.',
            warnings: warnings.length > 0 ? warnings : ['No active Augury contract was found.'],
        };
    }

    return {
        status: 'available',
        route: {
            intent_category: contract.intent_category,
            intent: contract.intent,
            selection_tier: contract.selection_tier,
            selection_name: contract.selection_name,
            designation: formatTraceDesignation(contract),
            basis: 'active Hall planning/runtime Augury contract',
        },
        scope: {
            value: scope.value,
            basis: scope.basis,
            target_domain: payload.lineage?.target_domain,
            spoke_name: payload.lineage?.spoke_name,
            requested_root: payload.lineage?.requested_root,
        },
        expert: {
            id: contract.council_expert?.id,
            label: contract.council_expert?.label,
            lens: contract.council_expert?.lens ?? contract.council_expert?.protocol,
            selection_reason: contract.council_expert?.selection_reason,
            basis: contract.council_expert?.selection_reason
                ? 'council expert selection reason'
                : 'contract council_expert field',
        },
        mimir: {
            targets: contract.mimirs_well,
            count: contract.mimirs_well.length,
            prompt_limit: 3,
            omitted_from_prompt: Math.max(0, contract.mimirs_well.length - 3),
            basis: 'Augury Mimir targets bound the agent discovery path',
        },
        mode: {
            basis: 'Host prompts use full Augury once per session/planning key, then lite Augury for subsequent calls.',
        },
        confidence: {
            source: 'missing',
            basis: 'No numeric confidence is emitted without an independently validated scorer, denominator, and evidence contract.',
        },
        guardrail: doctor.guardrail,
        agent_next_action: payload.agent_handoff.next_action,
        warnings,
    };
}

export function buildAuguryExplainPayload(
    session: HallPlanningSessionRecord | null,
    rootPath: string,
    registryRootPath: string = rootPath,
): AuguryExplainPayload {
    return buildAuguryExplainFromStatus(
        buildTraceStatusPayload(session, rootPath, registryRootPath),
        rootPath,
        registryRootPath,
    );
}
