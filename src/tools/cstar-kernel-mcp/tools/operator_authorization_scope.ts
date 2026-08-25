import fs from 'node:fs';
import path from 'node:path';

import type { McpRequestContext } from '../contracts/request_context.js';

const CSTAR_AUTHORIZATION_ROOT = '/home/morderith/Corvus/CStar';
const CSTAR_ABSOLUTE_PATH_PATTERN = /\/home\/morderith\/Corvus\/CStar(?:\/[^\s<>"'`]+)?/g;
const POSITIVE_TARGET_MANIFEST_PATTERN = /\b(?:targeting|targets?|writes?\s+limited)\s+exactly(?:\s+to)?\b\s*:?\s*/ig;
const PACKAGE_LOCK_SHA256_PATTERN = /\bpackage[-\s]?lock(?:\s+sha(?:-?256)?)?\s*(?:[:=]\s*)?([a-f0-9]{64})\b/ig;
const SAFE_BOUND_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

export interface OperatorAuthorizationScope {
    target_paths?: string[];
    requires_forge_hermes_m3?: boolean;
    bead_id?: string;
    decision_id?: string;
    package_lock_sha256s?: string[];
    requires_zero_retries?: boolean;
    requires_synthetic_fixtures_only?: boolean;
    requires_no_live_source?: boolean;
    caller_thread_id?: string;
    caller_transport?: string;
    request_context?: McpRequestContext;
    now?: number;
}

export function hasContradictoryForgeLaneInstruction(text: string): boolean {
    return (
        /\b(?:do\s+not|don't|never|must\s+not|not\s+authorized\s+to)\s+(?:(?:use|run|invoke|call|execute|start|perform|make)\s+){0,2}(?:the\s+)?(?:forge|hermes|m3|execution|model\s+calls?|spend)\b/i.test(text)
        || /\bwithout\s+(?:(?:using|running|invoking|calling)\s+)?(?:forge|hermes|m3)\b/i.test(text)
        || /\bauthorize\b[^.\n]{0,80}\bnot\s+to\s+(?:use|run|invoke|call|execute)\s+(?:forge|hermes|m3)\b/i.test(text)
        || /\bno\s+(?:hermes(?:\s*\/\s*m3)?|m3|forge\s+execution|model\s+calls?|spend)(?=$|[.!;,])/i.test(text)
        || /\bnot\s+(?:via|through)\s+(?:forge|hermes|m3)\b/i.test(text)
        || /\b(?:forge|hermes|m3|execute|execution|model\s+call|spend)\b[^.\n]{0,100}\b(?:forbidden|prohibited|disallowed|not\s+authorized)\b/i.test(text)
    );
}

function isInside(candidate: string, root: string): boolean {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function canonicalProspectivePath(candidate: string): string {
    const resolved = path.resolve(candidate);
    let current = resolved;
    while (!fs.existsSync(current)) {
        const parent = path.dirname(current);
        if (parent === current) throw new Error('operator_authorization_target_has_no_existing_ancestor');
        current = parent;
    }
    const ancestorStat = fs.lstatSync(current);
    const suffix = path.relative(current, resolved);
    if (suffix && !ancestorStat.isDirectory()) {
        throw new Error('operator_authorization_target_ancestor_not_directory');
    }
    if (!suffix && ancestorStat.isFile() && ancestorStat.nlink !== 1) {
        throw new Error('operator_authorization_target_hardlink_forbidden');
    }
    return path.resolve(fs.realpathSync(current), suffix);
}

function extractExplicitAuthorizationPaths(text: string): string[] {
    const candidates: string[] = [];
    for (const match of text.matchAll(POSITIVE_TARGET_MANIFEST_PATTERN)) {
        const start = (match.index ?? 0) + match[0].length;
        const remainder = text.slice(start);
        const stopCandidates = [
            remainder.search(/\n\s*\n(?=\S)/),
            remainder.search(/[,;]\s*with\s+(?:zero|0)[-\s]*retr(?:y|ies)\b/i),
            remainder.search(/\n\s*(?:Require|After|No\s|Do\s+not\b)/i),
            remainder.search(/[.;]\s*(?:Require|After|No\s|Do\s+not|Never)\b/i),
        ].filter((index) => index >= 0);
        const segment = remainder.slice(0, stopCandidates.length > 0 ? Math.min(...stopCandidates) : undefined);
        candidates.push(...(segment.match(CSTAR_ABSOLUTE_PATH_PATTERN) ?? []));
    }
    return [...new Set(candidates.map((candidate) => {
        const unwrapped = candidate.replace(/[),;:\]}]+$/g, '').replace(/\.$/, '');
        return path.resolve(unwrapped);
    }))];
}

function assertTargetsExplicitlyAuthorized(targets: string[], authorizedPaths: string[]): void {
    const canonicalRoot = fs.realpathSync(CSTAR_AUTHORIZATION_ROOT);
    const canonicalAuthorized = new Set(authorizedPaths.map((candidate) => {
        const canonical = canonicalProspectivePath(candidate);
        if (!isInside(canonical, canonicalRoot)) {
            throw new Error('operator_authorization_declared_path_out_of_scope');
        }
        return canonical;
    }));
    const canonicalTargets = new Set<string>();
    for (const target of targets) {
        if (!path.isAbsolute(target)) throw new Error('operator_authorization_target_must_be_absolute');
        const canonical = canonicalProspectivePath(target);
        if (!isInside(canonical, canonicalRoot)) throw new Error('operator_authorization_target_out_of_scope');
        canonicalTargets.add(canonical);
    }
    if (canonicalTargets.size !== canonicalAuthorized.size
        || [...canonicalTargets].some((target) => !canonicalAuthorized.has(target))) {
        throw new Error('operator_authorization_target_manifest_mismatch');
    }
}

function extractPackageLockSha256s(text: string): string[] {
    return [...new Set(
        [...text.matchAll(PACKAGE_LOCK_SHA256_PATTERN)]
            .map((match) => match[1]!.toLowerCase()),
    )].sort();
}

function assertBoundIdentifier(text: string, value: string | undefined, label: string): string {
    const literal = value?.trim() ?? '';
    if (!SAFE_BOUND_IDENTIFIER.test(literal)) {
        throw new Error(`operator_authorization_${label}_scope_invalid`);
    }
    let index = text.indexOf(literal);
    while (index >= 0) {
        const before = index === 0 ? '' : text[index - 1]!;
        const after = index + literal.length >= text.length ? '' : text[index + literal.length]!;
        if (!/[A-Za-z0-9._:/-]/.test(before) && !/[A-Za-z0-9._:/-]/.test(after)) return literal;
        index = text.indexOf(literal, index + 1);
    }
    throw new Error(`operator_authorization_${label}_not_explicitly_granted`);
}

function assertExactForgeConstraints(text: string, scope: OperatorAuthorizationScope): void {
    assertBoundIdentifier(text, scope.bead_id, 'bead_id');
    assertBoundIdentifier(text, scope.decision_id, 'decision_id');
    if (scope.requires_zero_retries && !/\b(?:zero|0)[-\s]*retr(?:y|ies)\b/i.test(text)) {
        throw new Error('operator_authorization_zero_retries_not_explicitly_granted');
    }
    if (scope.requires_synthetic_fixtures_only
        && !/\bsynthetic(?:[-\s]+fixtures?)?[-\s]+only\b/i.test(text)) {
        throw new Error('operator_authorization_synthetic_only_not_explicitly_granted');
    }
    if (scope.requires_no_live_source
        && !/\bno\s+live[-\s]+source(?:[-\s]+collection)?\b/i.test(text)) {
        throw new Error('operator_authorization_no_live_source_not_explicitly_granted');
    }
    const requestedPackageLocks = (scope.package_lock_sha256s ?? []).map((digest) => {
        const normalized = digest.trim().toLowerCase();
        if (!/^[a-f0-9]{64}$/.test(normalized)) {
            throw new Error('operator_authorization_package_lock_sha256_invalid');
        }
        return normalized;
    }).sort();
    const authorizedPackageLocks = extractPackageLockSha256s(text);
    if (requestedPackageLocks.length !== authorizedPackageLocks.length
        || requestedPackageLocks.some((digest, index) => digest !== authorizedPackageLocks[index])) {
        throw new Error('operator_authorization_package_lock_manifest_mismatch');
    }
}

export function assertOperatorAuthorizationScope(
    text: string,
    scope: OperatorAuthorizationScope,
): string[] {
    if (/\b(?:do\s+not|don't|not)\s+authorize\b|\brevoke\b/i.test(text)
        || /\b(?:example|hypothetical|not\s+permission|do\s+not\s+treat)\b/i.test(text)) {
        throw new Error('operator_authorization_negated_or_revoked');
    }
    if (scope.requires_forge_hermes_m3 && hasContradictoryForgeLaneInstruction(text)) {
        throw new Error('operator_authorization_contradictory_forge_lane_instruction');
    }
    if (!/\bi authorize you to complete the audit in full\b/i.test(text)) {
        throw new Error('operator_authorization_explicit_consent_missing');
    }
    if (!/\bcorvus\b/i.test(text) || !/\bcstar\b/i.test(text) || !/\b5\.6\b/i.test(text)) {
        throw new Error('operator_authorization_scope_missing');
    }
    if (scope.requires_forge_hermes_m3) {
        if (!/\bhermes\b/i.test(text) || !/\bm3\b/i.test(text)) {
            throw new Error('operator_authorization_forge_hermes_m3_missing');
        }
        assertExactForgeConstraints(text, scope);
    }
    const explicitPaths = extractExplicitAuthorizationPaths(text);
    if (explicitPaths.length === 0) {
        throw new Error('operator_authorization_explicit_target_manifest_missing');
    }
    if (!scope.target_paths || scope.target_paths.length === 0) {
        throw new Error('operator_authorization_requires_nonempty_targets');
    }
    assertTargetsExplicitlyAuthorized(scope.target_paths, explicitPaths);
    return explicitPaths;
}
