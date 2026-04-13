import type { SovereignBead } from '../types/bead.js';

export type HostSubagentProfile =
    | 'architect'
    | 'backend'
    | 'frontend'
    | 'reviewer'
    | 'tester'
    | 'debugger'
    | 'security'
    | 'documenter'
    | 'devops'
    | 'refactorer'
    | 'performance'
    | 'api_designer'
    | 'scout'
    | 'droid'
    | 'torvalds'
    | 'karpathy'
    | 'hamilton'
    | 'shannon'
    | 'dean'
    | 'carmack';

export interface HostSubagentSpec {
    id: HostSubagentProfile;
    title: string;
    instruction: string;
}

const HOST_SUBAGENT_SPECS: Record<HostSubagentProfile, HostSubagentSpec> = {
    architect: {
        id: 'architect',
        title: 'Architecture Orchestrator',
        instruction: 'Own decomposition, boundaries, sequencing, and provider-fit decisions. Prefer crisp plans, bounded edits, and explicit invariants over speculative prose.',
    },
    backend: {
        id: 'backend',
        title: 'Backend Implementer',
        instruction: 'Own server-side implementation details, runtime correctness, API contracts, and durable code changes. Favor direct, verifiable code over commentary.',
    },
    frontend: {
        id: 'frontend',
        title: 'Frontend Specialist',
        instruction: 'Own UI-facing implementation, component behavior, styling coherence, and accessible interaction details. Preserve the established visual language unless the task explicitly changes it.',
    },
    reviewer: {
        id: 'reviewer',
        title: 'Review Specialist',
        instruction: 'Own critique, regression detection, and architectural risk analysis. Surface concrete findings first, then recommendations.',
    },
    tester: {
        id: 'tester',
        title: 'Verification Specialist',
        instruction: 'Own test scaffolding, acceptance checks, and failure reproduction. Prefer deterministic verification and minimal test scope that still proves the contract.',
    },
    debugger: {
        id: 'debugger',
        title: 'Debugger',
        instruction: 'Own failure isolation, root-cause analysis, and narrow repairs. Remove guesswork and explain the causal chain through the code.',
    },
    security: {
        id: 'security',
        title: 'Security Auditor',
        instruction: 'Own security-sensitive review and implementation details, especially auth, secrets, trust boundaries, auditability, and escalation behavior.',
    },
    documenter: {
        id: 'documenter',
        title: 'Documentation Specialist',
        instruction: 'Own docs, operator guidance, and behavioral contracts. Keep text concise, accurate, and aligned with the actual runtime behavior.',
    },
    devops: {
        id: 'devops',
        title: 'DevOps Specialist',
        instruction: 'Own workflows, build surfaces, deploy plumbing, and environment wiring. Prefer reproducible commands and explicit configuration over hidden behavior.',
    },
    refactorer: {
        id: 'refactorer',
        title: 'Refactor Specialist',
        instruction: 'Own structural cleanup and code movement. Preserve behavior while improving boundaries, naming, and maintainability.',
    },
    performance: {
        id: 'performance',
        title: 'Performance Specialist',
        instruction: 'Own throughput, latency, batching, and hot-path discipline. Prefer measurable wins and low-risk changes.',
    },
    api_designer: {
        id: 'api_designer',
        title: 'API Designer',
        instruction: 'Own interface shape, request/response contracts, compatibility, and state transitions. Keep interfaces explicit and future-proof.',
    },
    scout: {
        id: 'scout',
        title: 'Scout',
        instruction: 'Own codebase reconnaissance and evidence gathering. Return high-signal findings that reduce ambiguity for the next worker.',
    },
    droid: {
        id: 'droid',
        title: 'Droid Control',
        instruction: 'Own low-level hardware orchestration, background terminal management, and cross-agent state handoffs. Ensure the war room state is synchronized and background processes are monitored.',
    },
    torvalds: {
        id: 'torvalds',
        title: 'Torvalds Protocol',
        instruction: 'Apply a Torvalds-style first-principles systems critique. Attack bloat, vague abstractions, leaky ownership, bad interfaces, and code paths that cannot survive real maintainers.',
    },
    karpathy: {
        id: 'karpathy',
        title: 'Karpathy Protocol',
        instruction: 'Apply an AI-systems critique. Attack weak data loops, model/tool boundaries, eval gaps, context-window misuse, and missing deterministic interfaces around probabilistic components.',
    },
    hamilton: {
        id: 'hamilton',
        title: 'Hamilton Protocol',
        instruction: 'Apply a fault-tolerance and safety critique. Attack missing invariants, unsafe state transitions, weak rollback behavior, and control paths that fail under stress.',
    },
    shannon: {
        id: 'shannon',
        title: 'Shannon Protocol',
        instruction: 'Apply an information-theory critique. Attack noisy signals, ambiguous encodings, weak compression, poor observability, and channels that cannot preserve the needed signal.',
    },
    dean: {
        id: 'dean',
        title: 'Dean Protocol',
        instruction: 'Apply a distributed-systems critique. Attack partitions, coordination bottlenecks, stale state, poor leases, non-idempotent retries, and scale assumptions.',
    },
    carmack: {
        id: 'carmack',
        title: 'Carmack Protocol',
        instruction: 'Apply a performance and simplicity critique. Attack unnecessary layers, hidden allocations, hot-path waste, weak instrumentation, and designs that are not mechanically sympathetic.',
    },
};

function hasKeyword(value: string, keywords: string[]): boolean {
    return keywords.some((keyword) => value.includes(keyword));
}

function normalizeTargetPath(bead: SovereignBead): string {
    return String(bead.target_path ?? bead.target_ref ?? '').trim().toLowerCase();
}

function normalizeBeadText(bead: SovereignBead): string {
    return [
        bead.rationale,
        bead.acceptance_criteria,
        bead.architect_opinion,
        bead.target_kind,
        bead.target_ref,
    ]
        .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
        .join(' ')
        .toLowerCase();
}

export function getHostSubagentSpec(profile: HostSubagentProfile): HostSubagentSpec {
    return HOST_SUBAGENT_SPECS[profile];
}

export function resolveHostSubagentProfile(bead: SovereignBead): HostSubagentProfile {
    const targetPath = normalizeTargetPath(bead);
    const beadText = normalizeBeadText(bead);
    const checker = String(bead.checker_shell ?? '').trim().toLowerCase();

    if (hasKeyword(targetPath, ['.md', '.qmd', '.txt', '.rst', '.feature'])) {
        return 'documenter';
    }

    if (hasKeyword(targetPath, ['.github/workflows/', 'docker', 'k8s', 'terraform', 'ansible', 'helm', 'vercel', 'fly.toml'])) {
        return 'devops';
    }

    if (hasKeyword(targetPath, ['component', 'ui/', 'frontend', '.tsx', '.jsx', '.css', '.scss'])) {
        return 'frontend';
    }

    if (hasKeyword(targetPath, ['route', 'controller', 'openapi', 'swagger', '/api/', 'rpc', 'graphql'])) {
        return 'api_designer';
    }

    if (hasKeyword(targetPath, ['auth', 'security', 'audit', 'permission', 'policy', 'secret', 'token'])) {
        return 'security';
    }

    if (hasKeyword(beadText, ['review', 'critique', 'regression', 'finding'])) {
        return 'reviewer';
    }

    if (hasKeyword(beadText, ['debug', 'bug', 'root cause', 'fix failure', 'blocked', 'error', 'timeout'])) {
        return 'debugger';
    }

    if (hasKeyword(beadText, ['performance', 'latency', 'throughput', 'hot path', 'batching'])) {
        return 'performance';
    }

    if (hasKeyword(beadText, ['refactor', 'cleanup', 'rename', 'restructure', 'extract'])) {
        return 'refactorer';
    }

    if (hasKeyword(beadText, ['research', 'discover', 'inventory', 'map the codebase', 'recon'])) {
        return 'scout';
    }

    if (hasKeyword(beadText, ['droid', 'hardware', 'background terminal', 'handoff', 'blackboard', 'war room'])) {
        return 'droid';
    }

    if (bead.target_kind === 'WORKFLOW' || bead.target_kind === 'REPOSITORY' || hasKeyword(beadText, ['architecture', 'phase', 'decomposition', 'provider-fit', 'scheduler'])) {
        return 'architect';
    }

    if (checker || (Array.isArray(bead.contract_refs) && bead.contract_refs.length > 0) || hasKeyword(beadText, ['verify', 'test', 'acceptance'])) {
        return 'tester';
    }

    return 'backend';
}

export function buildHostSubagentPrompt(
    profile: HostSubagentProfile,
    taskPrompt: string,
    requestContext: {
        boundary: string;
        task_kind: string;
        target_paths?: string[];
        acceptance_criteria?: string[];
        checker_shell?: string | null;
    },
): string {
    const spec = getHostSubagentSpec(profile);
    const targetPaths = requestContext.target_paths?.length ? requestContext.target_paths.join(', ') : '(none)';
    const acceptanceCriteria = requestContext.acceptance_criteria?.length
        ? requestContext.acceptance_criteria.join(' | ')
        : '(none)';

    return [
        `SPECIALIST ROLE: ${spec.title} (${spec.id})`,
        `ROLE MANDATE: ${spec.instruction}`,
        `BOUNDARY: ${requestContext.boundary}`,
        `TASK KIND: ${requestContext.task_kind}`,
        `TARGET PATHS: ${targetPaths}`,
        `ACCEPTANCE CRITERIA: ${acceptanceCriteria}`,
        `CHECKER: ${requestContext.checker_shell ?? '(none)'}`,
        '',
        taskPrompt,
    ].join('\n');
}
