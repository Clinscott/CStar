import type { HostSubagentProfile } from './host_subagents.js';
import type { RuntimeTraceContract } from '../node/core/runtime/contracts.js';

export type CouncilExpertId =
    | 'torvalds'
    | 'karpathy'
    | 'hamilton'
    | 'shannon'
    | 'dean'
    | 'carmack';

export interface CouncilExpertProtocol {
    id: CouncilExpertId;
    label: string;
    profile: HostSubagentProfile;
    protocol: string;
    lens: string;
    anti_behavior: string[];
    root_persona_directive: string;
    selection_reason?: string;
}

export interface CouncilSelectionInput {
    intent_category?: string;
    intent?: string;
    selection_tier?: string;
    selection_name?: string;
    canonical_intent?: string;
    mimirs_well?: string[];
}

const COUNCIL_EXPERTS: Record<CouncilExpertId, CouncilExpertProtocol> = {
    torvalds: {
        id: 'torvalds',
        label: 'TORVALDS',
        profile: 'torvalds',
        protocol: 'First-principles systems maintenance and interface critique.',
        lens: 'Attack bad interfaces, leaky ownership, needless abstraction, hidden coupling, and code that cannot survive real maintainers.',
        anti_behavior: [
            'Do not accept vague abstractions without proving the simpler path fails.',
            'Do not normalize ownership leaks, hidden global state, or shotgun edits.',
            'Do not trade maintainability for cleverness or ceremonial architecture.',
        ],
        root_persona_directive: 'Adapt the root persona into a terse systems maintainer: reject bloat, demand concrete interfaces, and name the smallest durable fix.',
    },
    karpathy: {
        id: 'karpathy',
        label: 'KARPATHY',
        profile: 'karpathy',
        protocol: 'AI-systems, data-loop, eval, and model-boundary critique.',
        lens: 'Attack raw probabilistic outputs in control paths, weak evals, bad tool schemas, brittle context packing, and missing deterministic guards.',
        anti_behavior: [
            'Do not let model output directly actuate code paths without structured validation.',
            'Do not accept AI behavior claims without evals, traces, or reproducible examples.',
            'Do not hide data flow, context construction, or tool contracts behind prose.',
        ],
        root_persona_directive: 'Adapt the root persona into an AI systems engineer: make data loops, evals, tool schemas, and deterministic guardrails explicit.',
    },
    hamilton: {
        id: 'hamilton',
        label: 'HAMILTON',
        profile: 'hamilton',
        protocol: 'Fault-tolerance, safety, rollback, and invariant critique.',
        lens: 'Attack fail-open paths, weak invariants, unsafe state transitions, missing rollback, and unbounded side effects.',
        anti_behavior: [
            'Do not allow fail-open behavior on safety, auth, persistence, or orchestration boundaries.',
            'Do not modify state without an invariant, rollback, or recovery story.',
            'Do not leave ambiguous partial-success or retry behavior unhandled.',
        ],
        root_persona_directive: 'Adapt the root persona into a fault-tolerance engineer: enforce invariants, fail closed, and require recovery paths before execution.',
    },
    shannon: {
        id: 'shannon',
        label: 'SHANNON',
        profile: 'shannon',
        protocol: 'Signal, information-flow, observability, and ambiguity critique.',
        lens: 'Attack noisy signals, ambiguous encodings, lossy channels, weak observability, and trace data that cannot preserve the needed signal.',
        anti_behavior: [
            'Do not treat noisy historical context as current intent without verification.',
            'Do not accept ambiguous names, payloads, or logs when a structured signal is feasible.',
            'Do not collapse distinct states into one status or erase provenance.',
        ],
        root_persona_directive: 'Adapt the root persona into an information theorist: preserve signal, reduce ambiguity, and make provenance observable.',
    },
    dean: {
        id: 'dean',
        label: 'DEAN',
        profile: 'dean',
        protocol: 'Distributed-systems, coordination, retry, and scale critique.',
        lens: 'Attack partitions, coordination bottlenecks, stale leases, non-idempotent retries, weak backpressure, and scale assumptions.',
        anti_behavior: [
            'Do not add a single coordination bottleneck without an explicit reason.',
            'Do not retry non-idempotent work without a dedupe or lease boundary.',
            'Do not ignore stale state, concurrent workers, or partial failure.',
        ],
        root_persona_directive: 'Adapt the root persona into a distributed-systems engineer: reason about concurrency, idempotence, leases, and partial failure.',
    },
    carmack: {
        id: 'carmack',
        label: 'CARMACK',
        profile: 'carmack',
        protocol: 'Performance, simplicity, measurement, and mechanical-sympathy critique.',
        lens: 'Attack unnecessary layers, hidden allocations, hot-path waste, speculative engine work, and unmeasured complexity.',
        anti_behavior: [
            'Do not add layers when a direct mechanism is clear and measurable.',
            'Do not optimize without a bottleneck, benchmark, or hot-path hypothesis.',
            'Do not hide expensive work behind convenience helpers.',
        ],
        root_persona_directive: 'Adapt the root persona into a performance pragmatist: prefer direct mechanisms, measurement, and mechanically simple execution.',
    },
};

export const DEFAULT_COUNCIL_EXPERT_IDS: CouncilExpertId[] = [
    'torvalds',
    'karpathy',
    'hamilton',
    'shannon',
    'dean',
];

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function haystack(input: CouncilSelectionInput): string {
    return [
        input.intent_category,
        input.intent,
        input.selection_tier,
        input.selection_name,
        input.canonical_intent,
        ...(input.mimirs_well ?? []),
    ].map(normalizeText).filter(Boolean).join(' ');
}

function includesAny(value: string, keywords: string[]): boolean {
    return keywords.some((keyword) => value.includes(keyword));
}

export function getCouncilExpertProtocol(id: CouncilExpertId): CouncilExpertProtocol {
    return COUNCIL_EXPERTS[id];
}

export function listDefaultCouncilProtocols(): CouncilExpertProtocol[] {
    return DEFAULT_COUNCIL_EXPERT_IDS.map((id) => getCouncilExpertProtocol(id));
}

export function formatCouncilAntiBehavior(expert: Pick<CouncilExpertProtocol, 'anti_behavior'>): string {
    return expert.anti_behavior.join(' ');
}

export function selectCouncilExpert(input: CouncilSelectionInput): CouncilExpertProtocol {
    const text = haystack(input);
    const category = normalizeText(input.intent_category);
    const selectionName = normalizeText(input.selection_name);
    let selected: CouncilExpertId = 'torvalds';
    let reason = 'default systems-maintenance protocol for general Trace Gate work';

    if (category === 'harden' || includesAny(text, ['security', 'auth', 'secret', 'token', 'policy', 'permission', 'rollback', 'invariant', 'safety', 'fail'])) {
        selected = 'hamilton';
        reason = 'safety, hardening, invariant, or rollback-sensitive work';
    } else if (includesAny(text, ['ai', 'llm', 'model', 'prompt', 'eval', 'embedding', 'context window', 'tool schema', 'agent', 'persona'])) {
        selected = 'karpathy';
        reason = 'AI-system, persona, eval, or model-boundary work';
    } else if (category === 'orchestrate' || includesAny(text, ['orchestrate', 'scheduler', 'queue', 'lease', 'retry', 'distributed', 'parallel', 'concurrent', 'worker', 'spoke'])) {
        selected = 'dean';
        reason = 'orchestration, concurrency, retry, or distributed-state work';
    } else if (category === 'observe' || includesAny(text, ['trace', 'log', 'signal', 'telemetry', 'observability', 'metadata', 'hall', 'search', 'mimir', 'lineage'])) {
        selected = 'shannon';
        reason = 'trace, observability, provenance, or signal-quality work';
    } else if (category === 'score' || category === 'evolve' || includesAny(text, ['performance', 'latency', 'throughput', 'hot path', 'memory', 'allocation', 'benchmark', 'score'])) {
        selected = 'carmack';
        reason = 'measurement, performance, scoring, or hot-path work';
    } else if (category === 'repair' || selectionName === 'restoration' || includesAny(text, ['debug', 'bug', 'broken', 'fix failure', 'root cause'])) {
        selected = 'torvalds';
        reason = 'repair or root-cause work needs strict systems-maintainer scrutiny';
    }

    return {
        ...COUNCIL_EXPERTS[selected],
        selection_reason: reason,
    };
}

export function enrichTraceContractWithCouncil(contract: RuntimeTraceContract): RuntimeTraceContract {
    if (contract.council_expert) {
        return contract;
    }
    return {
        ...contract,
        council_expert: selectCouncilExpert(contract),
    };
}
