import type { SovereignBead } from '../types/bead.js';

export type HostSubagentProfile =
    | 'brooks'
    | 'parnas'
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
    | 'carmack'
    | 'sakaguchi'
    | 'nomura'
    | 'miyazaki'
    | 'adams'
    | 'wright'
    | 'heineman'
    | 'sweeney'
    | 'miyamoto'
    | 'kojima'
    | 'meier'
    | 'linscott';

export interface HostSubagentSpec {
    id: HostSubagentProfile;
    title: string;
    instruction: string;
}

const HOST_SUBAGENT_SPECS: Record<HostSubagentProfile, HostSubagentSpec> = {
    brooks: {
        id: 'brooks',
        title: 'Brooks Protocol (Architecture Orchestrator)',
        instruction: 'Own decomposition, boundaries, sequencing, and conceptual integrity. Reject speculative code, demand crisp plan phases, and enforce clear invariants.',
    },
    parnas: {
        id: 'parnas',
        title: 'Parnas Protocol (Modular Boundaries)',
        instruction: 'Enforce information hiding, wrap FFI interfaces cleanly, and minimize module coupling. Keep internals isolated behind clean public interfaces.',
    },
    backend: {
        id: 'backend',
        title: 'Backend Advisory Reviewer',
        instruction: 'Review server-side behavior, runtime correctness, and API contracts. Return evidence and bounded recommendations only; do not write or claim implementation.',
    },
    frontend: {
        id: 'frontend',
        title: 'Frontend Advisory Reviewer',
        instruction: 'Review component behavior, styling coherence, and accessible interaction details. Return evidence and bounded recommendations only; do not edit UI files.',
    },
    reviewer: {
        id: 'reviewer',
        title: 'Review Specialist',
        instruction: 'Own critique, regression detection, and architectural risk analysis. Surface concrete findings first, then recommendations.',
    },
    tester: {
        id: 'tester',
        title: 'Verification Advisor',
        instruction: 'Review acceptance checks and failure evidence. Recommend deterministic verification without writing tests or running mutating commands.',
    },
    debugger: {
        id: 'debugger',
        title: 'Debugging Advisor',
        instruction: 'Isolate root cause and explain the causal chain. Recommend a narrow repair, but do not apply it or claim execution.',
    },
    security: {
        id: 'security',
        title: 'Security Auditor',
        instruction: 'Review auth, secrets, trust boundaries, auditability, and escalation behavior. Return findings only; do not mutate security-sensitive state.',
    },
    documenter: {
        id: 'documenter',
        title: 'Documentation Advisor',
        instruction: 'Review docs, operator guidance, and behavioral contracts. Recommend concise corrections without editing files.',
    },
    devops: {
        id: 'devops',
        title: 'DevOps Auditor',
        instruction: 'Review workflows, build surfaces, deploy plumbing, and environment wiring. Do not run, deploy, restart, or mutate configuration.',
    },
    refactorer: {
        id: 'refactorer',
        title: 'Refactor Advisor',
        instruction: 'Identify structural cleanup opportunities and propose bounded moves. Do not change code or files.',
    },
    performance: {
        id: 'performance',
        title: 'Performance Auditor',
        instruction: 'Analyze throughput, latency, batching, and hot paths. Return measurable hypotheses only; do not tune or modify runtime state.',
    },
    api_designer: {
        id: 'api_designer',
        title: 'API Design Advisor',
        instruction: 'Review interface shape, request/response contracts, compatibility, and state transitions. Recommend explicit interfaces without implementing them.',
    },
    scout: {
        id: 'scout',
        title: 'Scout',
        instruction: 'Own codebase reconnaissance and evidence gathering. Return high-signal findings that reduce ambiguity for the next worker.',
    },
    droid: {
        id: 'droid',
        title: 'Droid Operations Auditor',
        instruction: 'Review low-level orchestration, background terminal management, and cross-agent handoffs. Do not start processes, control hardware, or mutate shared state.',
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
    sakaguchi: {
        id: 'sakaguchi',
        title: 'Sakaguchi Protocol',
        instruction: 'Apply a Sakaguchi-style visionary architecture critique. Focus on the union of deep narrative intent with systemic complexity and emotional resonance.',
    },
    nomura: {
        id: 'nomura',
        title: 'Nomura Protocol',
        instruction: 'Apply a Nomura-style interface maximalism critique. Focus on high-fidelity technical interfaces, visual identity, and aesthetic coherence.',
    },
    miyazaki: {
        id: 'miyazaki',
        title: 'Miyazaki Protocol',
        instruction: 'Apply a Miyazaki-style spatial lore critique. Focus on interconnected network graphs, environmental storytelling, and rhythmic systemic consistency.',
    },
    adams: {
        id: 'adams',
        title: 'Adams Protocol',
        instruction: 'Apply an Adams-style agentic simulation critique. Focus on hub-and-spoke simulation models, procedural history, and individual agent memories.',
    },
    wright: {
        id: 'wright',
        title: 'Wright Protocol',
        instruction: 'Apply a Wright-style open-ended simulation critique. Focus on reactive agent loops, spatial UI, and software as a reactive system.',
    },
    heineman: {
        id: 'heineman',
        title: 'Heineman Protocol',
        instruction: 'Apply a Heineman-style technical heavy-lifting critique. Focus on cross-platform architectural engineering, engine optimization, and porting discipline.',
    },
    sweeney: {
        id: 'sweeney',
        title: 'Sweeney Protocol',
        instruction: 'Apply a Sweeney-style framework democratization critique. Focus on primary framework orchestration, complex agent management, and high-fidelity environment scaling.',
    },
    miyamoto: {
        id: 'miyamoto',
        title: 'Miyamoto Protocol',
        instruction: 'Apply a Miyamoto-style universal interaction critique. Focus on fundamental grammar of movement, interaction polish, and universal systemic accessibility.',
    },
    kojima: {
        id: 'kojima',
        title: 'Kojima Protocol',
        instruction: 'Apply a Kojima-style meta-systemic narrative critique. Focus on reactive networks, social-strand connections, and player-to-AI interaction loops.',
    },
    meier: {
        id: 'meier',
        title: 'Meier Protocol',
        instruction: 'Apply a Meier-style macro-strategic decision loop critique. Focus on series of interesting choices and global mission control loops.',
    },
    linscott: {
        id: 'linscott',
        title: 'Linscott Protocol',
        instruction: 'Apply a Linscott-style empirical-evaluation critique. Attack unvalidated improvements, small-sample claims, ignored variance, and any "this is better" assertion without SPRT-style evidence. Demand the test regime, the sample size, and the confidence bound.',
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

    if (hasKeyword(beadText, ['modular', 'coupling', 'information hiding', 'module boundary', 'ffi wrapper'])) {
        return 'parnas';
    }

    if (bead.target_kind === 'WORKFLOW' || bead.target_kind === 'REPOSITORY' || hasKeyword(beadText, ['architecture', 'phase', 'decomposition', 'conceptual integrity', 'provider-fit', 'scheduler'])) {
        return 'brooks';
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
        'EXECUTION CLASS: advisory-only',
        'HARD BOUNDARY: Do not modify files or state, run mutating commands, spawn workers, or claim implementation. Return evidence and recommendations only.',
        `BOUNDARY: ${requestContext.boundary}`,
        `TASK KIND: ${requestContext.task_kind}`,
        `TARGET PATHS: ${targetPaths}`,
        `ACCEPTANCE CRITERIA: ${acceptanceCriteria}`,
        `CHECKER: ${requestContext.checker_shell ?? '(none)'}`,
        '',
        taskPrompt,
    ].join('\n');
}
