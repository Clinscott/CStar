import path from 'node:path';

export type AuguryTargetDivergence = {
    diverged: boolean;
    requested_target_paths: string[];
    session_target_paths: string[];
    reason?: string;
};

export type AuguryCurrentIntentCategoryMatch = {
    category: string;
    default_path: string;
    tier: string;
    matched_trigger: string;
    matched_triggers: string[];
    match_count: number;
};

export type AugurySessionRoutingDecision = {
    source: 'session' | 'deterministic' | 'fallback' | 'blocked';
    use_session_as_primary: boolean;
    stale_session_demoted: boolean;
    stale_session_divergence_blocker: boolean;
    divergence_warnings: string[];
    required_operator_decision?: string;
};

function normalizeAuguryComparablePath(candidate: string, root: string): string {
    const trimmed = candidate.trim();
    if (!trimmed) return '';
    return path.resolve(path.isAbsolute(trimmed) ? trimmed : path.join(root, trimmed));
}

function auguryPathsOverlap(left: string, right: string): boolean {
    if (!left || !right) return false;
    if (left === right) return true;
    const normalizedLeft = left.endsWith(path.sep) ? left : `${left}${path.sep}`;
    const normalizedRight = right.endsWith(path.sep) ? right : `${right}${path.sep}`;
    return normalizedLeft.startsWith(normalizedRight) || normalizedRight.startsWith(normalizedLeft);
}

export function detectAuguryTargetDivergence(
    requestedTargetPaths: string[] | undefined,
    sessionTargetPaths: string[] | undefined,
    root: string,
): AuguryTargetDivergence {
    const requested = (requestedTargetPaths ?? [])
        .map((targetPath) => normalizeAuguryComparablePath(targetPath, root))
        .filter(Boolean);
    const session = (sessionTargetPaths ?? [])
        .map((targetPath) => normalizeAuguryComparablePath(targetPath, root))
        .filter(Boolean);

    if (requested.length === 0 || session.length === 0) {
        return { diverged: false, requested_target_paths: requested, session_target_paths: session };
    }

    const allRequestedTargetsCovered = requested.every((requestedPath) =>
        session.some((sessionPath) => auguryPathsOverlap(requestedPath, sessionPath)),
    );

    return {
        diverged: !allRequestedTargetsCovered,
        requested_target_paths: requested,
        session_target_paths: session,
        ...(allRequestedTargetsCovered ? {} : {
            reason: 'Caller supplied target_paths are not fully covered by the active Augury/handoff session targets.',
        }),
    };
}

function normalizeAuguryIntentToken(token: string): string {
    return token.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
}

function auguryTokenMatchesTrigger(token: string, trigger: string): boolean {
    if (!token || !trigger) return false;
    if (token === trigger) return true;
    return trigger.length >= 4 && token.startsWith(trigger);
}

export function resolveAuguryCurrentIntentCategory(
    tokens: string[],
    grammar: Record<string, { triggers: string[]; default_path: string; tier: string }>,
): AuguryCurrentIntentCategoryMatch | null {
    const normalizedTokens = tokens.map(normalizeAuguryIntentToken).filter(Boolean);
    const matches: AuguryCurrentIntentCategoryMatch[] = [];

    for (const [category, config] of Object.entries(grammar)) {
        const matchedTriggers = config.triggers.filter((trigger) => {
            const normalizedTrigger = normalizeAuguryIntentToken(trigger);
            return normalizedTokens.some((token) => auguryTokenMatchesTrigger(token, normalizedTrigger));
        });
        if (matchedTriggers.length > 0) {
            const matchCount = config.triggers.reduce((count, trigger) => {
                const normalizedTrigger = normalizeAuguryIntentToken(trigger);
                return count + normalizedTokens.filter((token) => auguryTokenMatchesTrigger(token, normalizedTrigger)).length;
            }, 0);
            matches.push({
                category,
                default_path: config.default_path,
                tier: config.tier,
                matched_trigger: matchedTriggers[0],
                matched_triggers: matchedTriggers,
                match_count: matchCount,
            });
        }
    }

    matches.sort((left, right) => right.match_count - left.match_count);
    return matches[0] ?? null;
}

export function callerRequestedActiveSessionContinuity(prompt: string, inferredIntent?: string): boolean {
    const text = `${prompt} ${inferredIntent ?? ''}`.toLowerCase();
    return /\b(session continuity|continue (?:the )?active (?:session|handoff|mission)|resume (?:the )?active (?:session|handoff|mission)|use (?:the )?active (?:session|handoff))\b/.test(text);
}

export function decideAugurySessionRouting(params: {
    hasSessionRoute: boolean;
    hasExplicitTargetPaths: boolean;
    targetDiverged: boolean;
    deterministicAvailable: boolean;
    currentRouteDiverged?: boolean;
    activeSessionContinuityRequested?: boolean;
}): AugurySessionRoutingDecision {
    if (!params.hasSessionRoute) {
        return {
            source: params.deterministicAvailable ? 'deterministic' : 'fallback',
            use_session_as_primary: false,
            stale_session_demoted: false,
            stale_session_divergence_blocker: false,
            divergence_warnings: [],
        };
    }
    if (!params.hasExplicitTargetPaths && !params.deterministicAvailable) {
        return {
            source: 'blocked',
            use_session_as_primary: false,
            stale_session_demoted: false,
            stale_session_divergence_blocker: true,
            divergence_warnings: ['active_session_only_context'],
            required_operator_decision: 'Provide an explicit prompt route or target_paths before using the active session as mission truth.',
        };
    }
    if (params.targetDiverged) {
        if (!params.deterministicAvailable || params.activeSessionContinuityRequested) {
            return {
                source: 'blocked',
                use_session_as_primary: false,
                stale_session_demoted: false,
                stale_session_divergence_blocker: true,
                divergence_warnings: ['stale_session_target_divergence'],
                required_operator_decision: params.activeSessionContinuityRequested
                    ? 'Caller requested active-session continuity, but supplied target_paths diverge from the active session. Select the intended session or clear the stale one.'
                    : 'Clarify the prompt or target_paths so Augury can derive a safe current mission route.',
            };
        }
        return {
            source: 'deterministic',
            use_session_as_primary: false,
            stale_session_demoted: true,
            stale_session_divergence_blocker: false,
            divergence_warnings: ['stale_session_target_divergence'],
        };
    }
    if (params.currentRouteDiverged) {
        if (!params.deterministicAvailable || params.activeSessionContinuityRequested) {
            return {
                source: 'blocked',
                use_session_as_primary: false,
                stale_session_demoted: false,
                stale_session_divergence_blocker: true,
                divergence_warnings: ['stale_session_intent_divergence'],
                required_operator_decision: params.activeSessionContinuityRequested
                    ? 'Caller requested active-session continuity, but the active session intent diverges from the current deterministic route. Select the intended session or clear the stale one.'
                    : 'Clarify the prompt so Augury can derive a safe current mission route.',
            };
        }
        return {
            source: 'deterministic',
            use_session_as_primary: false,
            stale_session_demoted: true,
            stale_session_divergence_blocker: false,
            divergence_warnings: ['stale_session_intent_divergence'],
        };
    }
    return {
        source: 'session',
        use_session_as_primary: true,
        stale_session_demoted: false,
        stale_session_divergence_blocker: false,
        divergence_warnings: [],
    };
}
