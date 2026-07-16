import { createHash } from 'node:crypto';
import * as path from 'node:path';

import type {
    AuguryLearningEvent,
    AuguryLearningMetadata,
    AugurySteeringContext,
    AugurySteeringMode,
    HostSkillActivationRequest,
} from './host_session.js';

export const AUGURY_STEERING_BLOCK_VERSION = 2;
export const AUGURY_CORVUS_STANDARD_VERSION = 1;
export const AUGURY_PROMPT_CONSULT_LIMIT = 3;
export const RETIRED_HOST_AUGURY_LEDGER_ERROR =
    'legacy_host_augury_ledger_writer_retired_use_cstar_record_result';

export function buildHostSkillActivationEnvelope(request: HostSkillActivationRequest): string {
    return [
        '[CORVUS_SKILL_ACTIVATION]',
        `SKILL_ID: ${request.skill_id}`,
        request.role ? `ROLE: ${request.role}` : '',
        `INTENT: ${request.intent}`,
        `PROJECT_ROOT: ${request.project_root}`,
        request.target_paths?.length ? `TARGET_PATHS: ${request.target_paths.join(', ')}` : '',
        'PAYLOAD:',
        JSON.stringify(request.payload ?? {}, null, 2),
        '[/CORVUS_SKILL_ACTIVATION]',
    ].filter(Boolean).join('\n');
}

function asStringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : [];
}

function compactSingleLine(value: unknown, maxLength = 220): string {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
    return normalized.length <= maxLength
        ? normalized
        : `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function stableNormalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableNormalize);
    if (value && typeof value === 'object') {
        const normalized: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            const entry = (value as Record<string, unknown>)[key];
            if (entry !== undefined) normalized[key] = stableNormalize(entry);
        }
        return normalized;
    }
    return value;
}

function buildContractHash(contract: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(stableNormalize(contract))).digest('hex');
}

function findCStarRoot(projectRoot: string, env: NodeJS.ProcessEnv = process.env): string {
    const explicitRoot = env.CSTAR_AUGURY_LEARNING_ROOT?.trim()
        || env.CSTAR_ROOT?.trim()
        || env.CSTAR_PROJECT_ROOT?.trim();
    return path.resolve(explicitRoot || projectRoot || process.cwd());
}

export function resolveAuguryLearningLedgerPath(projectRoot: string, env: NodeJS.ProcessEnv = process.env): string {
    const explicitPath = env.CSTAR_AUGURY_LEARNING_LEDGER?.trim();
    return explicitPath
        ? path.resolve(explicitPath)
        : path.join(findCStarRoot(projectRoot, env), '.agents', 'state', 'augury-learning.jsonl');
}

export function recordAuguryLearningEvent(
    projectRoot: string,
    event: AuguryLearningEvent,
    env: NodeJS.ProcessEnv = process.env,
): string | null {
    void projectRoot;
    void event;
    void env;
    return null;
}

export function buildAuguryLearningMetadata(
    contract: Record<string, unknown> | undefined,
    options: {
        session_id?: string | null; planning_session_id?: string | null; designation_source?: string | null;
        prompt_surface?: string | null; bead_id?: string | null; weave_id?: string | null;
        result_status?: string | null; provider?: string | null; prompt_token_estimate?: number | null;
        steering_mode?: AugurySteeringMode; confidence_source?: 'explicit' | 'missing' | 'synthetic';
        target_domain?: string | null; spoke_name?: string | null; requested_root?: string | null;
    } = {},
): AuguryLearningMetadata | undefined {
    if (!contract) return undefined;
    const expert = contract.council_expert && typeof contract.council_expert === 'object' && !Array.isArray(contract.council_expert)
        ? contract.council_expert as Record<string, unknown>
        : undefined;
    const intentCategory = typeof contract.intent_category === 'string' ? contract.intent_category : undefined;
    const selectionTier = typeof contract.selection_tier === 'string' ? contract.selection_tier : undefined;
    const selectionName = typeof contract.selection_name === 'string' ? contract.selection_name : undefined;
    const route = [intentCategory, selectionTier && selectionName ? `${selectionTier}: ${selectionName}` : undefined]
        .filter(Boolean).join(' -> ') || undefined;
    const mimirsWellCount = asStringArray(contract.mimirs_well).length;
    const councilCandidates = (Array.isArray(contract.council_candidates)
        ? contract.council_candidates
        : Array.isArray(expert?.selection_candidates) ? expert.selection_candidates : [])
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
        .map((entry) => ({
            id: String(entry.id ?? ''), label: String(entry.label ?? ''),
            score: Number(entry.score ?? 0), reason: String(entry.reason ?? ''),
        }))
        .filter((entry) => entry.id && entry.label && Number.isFinite(entry.score) && entry.reason)
        .slice(0, 3);
    const { confidence: _legacyConfidence, confidence_source: _legacyConfidenceSource, ...confidenceFreeContract } = contract;
    return {
        schema_version: 1,
        steering_block_version: AUGURY_STEERING_BLOCK_VERSION,
        steering_mode: options.steering_mode ?? 'full',
        corvus_standard_version: AUGURY_CORVUS_STANDARD_VERSION,
        optimizer_ready: true,
        optimizer_family: 'GEPA_DSPY',
        contract_hash: buildContractHash(confidenceFreeContract),
        confidence_source: 'missing',
        ...(route ? { route } : {}),
        ...(intentCategory ? { intent_category: intentCategory } : {}),
        ...(selectionTier ? { selection_tier: selectionTier } : {}),
        ...(selectionName ? { selection_name: selectionName } : {}),
        ...(typeof expert?.id === 'string' ? { expert_id: expert.id } : {}),
        ...(typeof expert?.label === 'string' ? { expert_label: expert.label } : {}),
        ...(councilCandidates.length ? { council_candidates: councilCandidates } : {}),
        mimirs_well_count: mimirsWellCount,
        mimirs_well_omitted_count: Math.max(0, mimirsWellCount - AUGURY_PROMPT_CONSULT_LIMIT),
        session_id: options.session_id ?? null,
        planning_session_id: options.planning_session_id ?? null,
        designation_source: options.designation_source ?? null,
        prompt_surface: options.prompt_surface ?? null,
        bead_id: options.bead_id ?? null,
        weave_id: options.weave_id ?? null,
        result_status: options.result_status ?? null,
        provider: options.provider ?? null,
        prompt_token_estimate: typeof options.prompt_token_estimate === 'number' && Number.isFinite(options.prompt_token_estimate)
            ? options.prompt_token_estimate : null,
        target_domain: options.target_domain ?? null,
        spoke_name: options.spoke_name ?? null,
        requested_root: options.requested_root ?? null,
    };
}

function buildAuguryScopeLine(context: AugurySteeringContext): string {
    const domain = compactSingleLine(context.target_domain, 60);
    const spoke = compactSingleLine(context.spoke_name, 80);
    const project = compactSingleLine(context.project_root ? path.basename(context.project_root) : '', 80);
    const requestedRoot = compactSingleLine(context.requested_root, 120);
    if (spoke) return `Scope: spoke:${spoke}${requestedRoot ? ` (${requestedRoot})` : ''}`;
    if (!domain && project === 'CStar') return 'Scope: brain:CStar';
    if (domain) return `Scope: ${domain}${project ? `:${project}` : ''}`;
    return project ? `Scope: ${project}` : '';
}

function buildAuguryQualityLine(intentCategory: string): string {
    if (['VERIFY', 'SCORE', 'OBSERVE', 'DOCUMENT'].includes(intentCategory)) {
        return 'Review Standard: findings first; cite files; call out regressions, risks, and missing tests.';
    }
    if (['ORCHESTRATE', 'EXPAND', 'GUARD'].includes(intentCategory)) {
        return 'Coordination Standard: follow registry/runtime contracts; respect spoke boundaries; fail closed on unsafe ambiguity.';
    }
    return 'Code Standard: scoped changes; preserve unrelated work; verify focused behavior; leave no known broken surface.';
}

function buildProjectedPersonaToneLine(contract: Record<string, unknown>): string {
    const advice = contract.persona_advice;
    if (!advice || typeof advice !== 'object' || Array.isArray(advice)) return '';
    const projected = advice as Record<string, unknown>;
    if (projected.authority !== 'style_only' || projected.source !== 'hall_self_consistent_record') return '';
    const tone = compactSingleLine(projected.tone_directive, 200);
    return tone ? `Persona Tone: ${tone}` : '';
}

export function formatAugurySteeringBlock(
    contract: Record<string, unknown> | undefined,
    context: AugurySteeringContext = {},
): string {
    if (!contract) return '';
    const expert = contract.council_expert && typeof contract.council_expert === 'object' && !Array.isArray(contract.council_expert)
        ? contract.council_expert as Record<string, unknown>
        : undefined;
    const antiBehavior = asStringArray(expert?.anti_behavior).slice(0, 2).map((entry) => compactSingleLine(entry, 140));
    const mimirsWell = asStringArray(contract.mimirs_well);
    const promptMimirsWell = mimirsWell.slice(0, AUGURY_PROMPT_CONSULT_LIMIT);
    const intentCategory = compactSingleLine(contract.intent_category ?? 'UNKNOWN', 80);
    const selectionTier = compactSingleLine(contract.selection_tier ?? 'UNKNOWN', 80);
    const selectionName = compactSingleLine(contract.selection_name ?? 'unknown', 120);
    const trajectoryStatus = compactSingleLine(contract.trajectory_status, 80).toUpperCase();
    const trajectoryReason = compactSingleLine(contract.trajectory_reason, 180);
    const applyLens = compactSingleLine(expert?.lens ?? expert?.protocol, 220);
    const mode = context.mode ?? 'full';
    if (mode === 'lite') {
        return [
            '[CORVUS_STAR_AUGURY]', 'Mode: lite',
            `Route: ${intentCategory} -> ${selectionTier}: ${selectionName}`,
            buildAuguryScopeLine(context),
            `Intent: ${compactSingleLine(contract.intent ?? contract.canonical_intent, 180)}`,
            promptMimirsWell.length ? `Mimir's Well: ${promptMimirsWell.map((entry) => compactSingleLine(entry, 140)).join(' | ')}` : '',
            expert ? `Council Expert: ${compactSingleLine(expert.label ?? expert.id ?? 'UNKNOWN', 80)}` : '',
            'Directive: Route only. Consult targets before choosing a path. Do not echo.',
            '[/CORVUS_STAR_AUGURY]',
        ].filter(Boolean).join('\n');
    }
    return [
        '[CORVUS_STAR_AUGURY]', 'Mode: full',
        `Route: ${intentCategory} -> ${selectionTier}: ${selectionName}`,
        buildAuguryScopeLine(context),
        `Intent: ${compactSingleLine(contract.intent ?? contract.canonical_intent, 260)}`,
        promptMimirsWell.length ? `Mimir's Well: ${promptMimirsWell.map((entry) => compactSingleLine(entry, 160)).join(' | ')}` : '',
        expert ? `Council Expert: ${compactSingleLine(expert.label ?? expert.id ?? 'UNKNOWN', 80)}` : '',
        applyLens ? `Council Lens: ${applyLens}` : '',
        antiBehavior.length ? `Guardrails: ${antiBehavior.join(' | ')}` : '',
        'Corvus Standard: CStar is the engine; spokes are managed extensions; keep work Hall/Mimir traceable.',
        buildAuguryQualityLine(intentCategory.toUpperCase()),
        buildProjectedPersonaToneLine(contract),
        trajectoryStatus && trajectoryStatus !== 'STABLE'
            ? `Trajectory: ${trajectoryStatus}${trajectoryReason ? `: ${trajectoryReason}` : ''}` : '',
        contract.gungnir_verdict ? `Verdict: ${compactSingleLine(contract.gungnir_verdict, 220)}` : '',
        'Directive: Use this as routing context only. Consult targets before choosing a path. Do not echo this block.',
        '[/CORVUS_STAR_AUGURY]',
    ].filter(Boolean).join('\n');
}

export function buildHostNativeSkillPrompt(request: HostSkillActivationRequest): string {
    const targetPaths = request.target_paths?.filter((entry) => entry.trim().length > 0) ?? [];
    const auguryBlock = formatAugurySteeringBlock(request.augury_contract, {
        mode: request.augury_mode,
        project_root: request.project_root,
        target_paths: targetPaths,
        target_domain: request.target_domain,
        spoke_name: request.spoke_name,
        requested_root: request.requested_root,
    });
    return [
        buildHostSkillActivationEnvelope(request), auguryBlock, '',
        'Execute this Corvus skill natively inside the current host session.',
        'Do not invoke `cstar`, `node`, or a runtime dispatcher to fulfill it.',
        'Use the authoritative skill instructions directly so Hall and Augury continuity remain in-session.',
        targetPaths.length ? `Focus targets: ${targetPaths.join(', ')}` : '',
    ].filter(Boolean).join('\n');
}
