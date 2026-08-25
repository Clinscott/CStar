import fs from 'node:fs';
import path from 'node:path';

function isStructuredEvidenceField(value: unknown): value is Record<string, unknown> | unknown[] {
    return Array.isArray(value) || (!!value && typeof value === 'object');
}

function structuredEvidenceCount(value: Record<string, unknown> | unknown[]): number {
    return Array.isArray(value) ? value.length : Object.keys(value).length;
}

function summarizeCallbackPacket(value: unknown): { callback_packet: string | null; callback_packet_kind: 'absent' | 'string' | 'object' } | null {
    if (value === undefined) {
        return { callback_packet: null, callback_packet_kind: 'absent' };
    }
    if (typeof value === 'string') {
        return { callback_packet: value, callback_packet_kind: 'string' };
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const packet = value as Record<string, unknown>;
        const packetId = typeof packet.callback_id === 'string'
            ? packet.callback_id
            : typeof packet.packet_name === 'string'
                ? packet.packet_name
                : typeof packet.name === 'string'
                    ? packet.name
                    : 'structured';
        return { callback_packet: packetId, callback_packet_kind: 'object' };
    }
    return null;
}

function isSuccessAdapterStatus(status: string): boolean {
    return ['accepted', 'ok', 'pass', 'passed', 'success', 'succeeded'].includes(status.trim().toLowerCase());
}

function looksLikePathClaim(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed || /^[a-f0-9]{64}$/i.test(trimmed)) {
        return false;
    }
    return trimmed.includes('/') || trimmed.includes('\\') || trimmed.startsWith('.') || /^[A-Za-z]:[\\/]/.test(trimmed);
}

const MAX_ARTIFACT_STRUCTURE_DEPTH = 64;
const MAX_ARTIFACT_STRUCTURE_NODES = 10_000;
const MAX_RESPONSE_PATH_CLAIMS = 1_000;
const EXPLICIT_SINGULAR_PATH_FIELDS = new Set([
    'artifact_path',
    'file',
    'file_path',
    'filename',
    'path',
]);
const EXPLICIT_PLURAL_PATH_FIELDS = new Set([
    'filenames',
    'files',
    'paths',
]);
const EXPLICIT_PATH_FIELDS = new Set([
    'artifacts',
    ...EXPLICIT_SINGULAR_PATH_FIELDS,
    ...EXPLICIT_PLURAL_PATH_FIELDS,
]);

type ArtifactPathClaimCollection =
    | { ok: true; claims: string[] }
    | { ok: false; error: string };

function collectArtifactPathClaims(value: unknown, maxClaims: number): ArtifactPathClaimCollection {
    const stack: Array<{
        value: unknown;
        depth: number;
        fieldName?: string;
        requiresPathString?: boolean;
    }> = [
        { value, depth: 0, fieldName: 'artifacts' },
    ];
    const claims: string[] = [];
    let scheduledNodes = 1;
    const addClaim = (claim: string): string | null => {
        const trimmed = claim.trim();
        if (!trimmed || trimmed !== claim) {
            return 'adapter_response_artifact_path_claim_invalid';
        }
        claims.push(trimmed);
        return claims.length <= maxClaims
            ? null
            : 'adapter_response_path_claim_limit_exceeded';
    };

    while (stack.length > 0) {
        const current = stack.pop()!;
        if (current.requiresPathString && typeof current.value !== 'string') {
            return { ok: false, error: 'adapter_response_artifact_path_claim_invalid' };
        }
        if (typeof current.value === 'string') {
            const explicitPathField = current.fieldName
                ? EXPLICIT_PATH_FIELDS.has(current.fieldName.trim().toLowerCase().replace(/-/g, '_'))
                : false;
            if (explicitPathField || looksLikePathClaim(current.value)) {
                const claimError = addClaim(current.value);
                if (claimError) return { ok: false, error: claimError };
            }
            continue;
        }
        if (!current.value || typeof current.value !== 'object') {
            continue;
        }

        if (Array.isArray(current.value)) {
            if (current.value.length === 0) continue;
            if (current.depth >= MAX_ARTIFACT_STRUCTURE_DEPTH) {
                return { ok: false, error: 'adapter_response_artifact_structure_too_deep' };
            }
            if (scheduledNodes + current.value.length > MAX_ARTIFACT_STRUCTURE_NODES) {
                return { ok: false, error: 'adapter_response_artifact_structure_too_large' };
            }
            scheduledNodes += current.value.length;
            for (let index = current.value.length - 1; index >= 0; index -= 1) {
                stack.push({
                    value: current.value[index],
                    depth: current.depth + 1,
                    fieldName: current.fieldName,
                    requiresPathString: current.fieldName
                        ? EXPLICIT_PLURAL_PATH_FIELDS.has(
                            current.fieldName.trim().toLowerCase().replace(/-/g, '_'),
                        )
                        : false,
                });
            }
            continue;
        }

        const object = current.value as Record<string, unknown>;
        let childCount = 0;
        for (const fieldName in object) {
            if (!Object.hasOwn(object, fieldName)) continue;
            const normalizedFieldName = fieldName.trim().toLowerCase().replace(/-/g, '_');
            const fieldValue = object[fieldName];
            if (
                EXPLICIT_SINGULAR_PATH_FIELDS.has(normalizedFieldName)
                && typeof fieldValue !== 'string'
            ) {
                return { ok: false, error: 'adapter_response_artifact_path_claim_invalid' };
            }
            if (
                EXPLICIT_PLURAL_PATH_FIELDS.has(normalizedFieldName)
                && !Array.isArray(fieldValue)
            ) {
                return { ok: false, error: 'adapter_response_artifact_path_claim_invalid' };
            }
            childCount += 1;
            if (current.depth >= MAX_ARTIFACT_STRUCTURE_DEPTH) {
                return { ok: false, error: 'adapter_response_artifact_structure_too_deep' };
            }
            if (scheduledNodes + childCount > MAX_ARTIFACT_STRUCTURE_NODES) {
                return { ok: false, error: 'adapter_response_artifact_structure_too_large' };
            }
            if (looksLikePathClaim(fieldName)) {
                const claimError = addClaim(fieldName);
                if (claimError) return { ok: false, error: claimError };
            }
            stack.push({
                value: fieldValue,
                depth: current.depth + 1,
                fieldName,
                requiresPathString: EXPLICIT_SINGULAR_PATH_FIELDS.has(normalizedFieldName),
            });
        }
        scheduledNodes += childCount;
    }

    return { ok: true, claims };
}

function isInside(candidate: string, root: string): boolean {
    const relative = path.relative(root, candidate);
    return relative === '' || (
        relative !== '..'
        && !relative.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relative)
    );
}

function canonicalEvidenceRoots(evidenceRoots: string[]): string[] {
    return [...new Set(evidenceRoots.flatMap((root) => {
        try {
            return [fs.realpathSync(root)];
        } catch {
            return [];
        }
    }))];
}

function claimedPathExists(claim: string, roots: string[]): boolean {
    const candidates = path.isAbsolute(claim)
        ? [path.resolve(claim)]
        : roots.map((root) => path.resolve(root, claim));
    return candidates.some((candidate) => {
        try {
            const containingRoot = roots.find((root) => isInside(candidate, root));
            if (!containingRoot) return false;
            const lexical = fs.lstatSync(candidate);
            if (lexical.isSymbolicLink() || !lexical.isFile() || lexical.nlink !== 1) return false;
            const canonical = fs.realpathSync(candidate);
            return canonical === candidate && isInside(canonical, containingRoot);
        } catch {
            return false;
        }
    });
}

export function validateForgeAdapterResponseContract(
    raw: string,
    evidenceRoots: string[],
    expectedCallbackPacket?: string,
): { ok: boolean; error: string | null; summary: Record<string, unknown> | null } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { ok: false, error: 'adapter_response_not_json', summary: null };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, error: 'adapter_response_not_object', summary: null };
    }
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.status !== 'string' || !obj.status.trim()) {
        return { ok: false, error: 'adapter_response_missing_status', summary: null };
    }
    if (typeof obj.summary !== 'string' || !obj.summary.trim()) {
        return { ok: false, error: 'adapter_response_missing_summary', summary: null };
    }
    if (!Array.isArray(obj.files_changed)) {
        return { ok: false, error: 'adapter_response_missing_files_changed', summary: null };
    }
    for (const field of ['artifacts', 'validation', 'metrics', 'boundaries']) {
        if (!isStructuredEvidenceField(obj[field])) {
            return { ok: false, error: `adapter_response_missing_${field}`, summary: null };
        }
    }
    const callbackPacket = summarizeCallbackPacket(obj.callback_packet);
    if (!callbackPacket) {
        return { ok: false, error: 'adapter_response_invalid_callback_packet', summary: null };
    }
    if (expectedCallbackPacket && callbackPacket.callback_packet_kind === 'absent') {
        return { ok: false, error: 'adapter_response_callback_packet_missing', summary: null };
    }
    if (expectedCallbackPacket && callbackPacket.callback_packet !== expectedCallbackPacket) {
        return { ok: false, error: 'adapter_response_callback_packet_mismatch', summary: null };
    }
    const filesChanged = obj.files_changed as unknown[];
    if (!filesChanged.every((entry) => (
        typeof entry === 'string'
        && entry.length > 0
        && entry === entry.trim()
    ))) {
        return { ok: false, error: 'adapter_response_invalid_files_changed', summary: null };
    }
    if (!isSuccessAdapterStatus(obj.status)) {
        return {
            ok: false,
            error: 'adapter_response_reported_failure',
            summary: { status: obj.status, ...callbackPacket },
        };
    }
    if (filesChanged.length > MAX_RESPONSE_PATH_CLAIMS) {
        return { ok: false, error: 'adapter_response_path_claim_limit_exceeded', summary: null };
    }
    const artifactPathClaims = collectArtifactPathClaims(
        obj.artifacts,
        MAX_RESPONSE_PATH_CLAIMS - filesChanged.length,
    );
    if (!artifactPathClaims.ok) {
        return { ok: false, error: artifactPathClaims.error, summary: null };
    }
    const claimedPaths = [...new Set([
        ...filesChanged,
        ...artifactPathClaims.claims,
    ].map((entry) => String(entry).trim()).filter(Boolean))];
    const roots = canonicalEvidenceRoots(evidenceRoots);
    const missingClaims = claimedPaths.filter((claim) => !claimedPathExists(claim, roots));
    if (missingClaims.length > 0) {
        return {
            ok: false,
            error: 'adapter_response_missing_claimed_path',
            summary: {
                status: obj.status,
                missing_claimed_paths: missingClaims.slice(0, 10),
                missing_claimed_path_count: missingClaims.length,
            },
        };
    }
    const artifacts = obj.artifacts as Record<string, unknown> | unknown[];
    const validation = obj.validation as Record<string, unknown> | unknown[];
    const metrics = obj.metrics as Record<string, unknown> | unknown[];
    const boundaries = obj.boundaries as Record<string, unknown> | unknown[];
    return {
        ok: true,
        error: null,
        summary: {
            status: obj.status,
            files_changed_count: filesChanged.length,
            artifacts_count: structuredEvidenceCount(artifacts),
            validation_count: structuredEvidenceCount(validation),
            metrics_count: structuredEvidenceCount(metrics),
            boundaries_count: structuredEvidenceCount(boundaries),
            ...callbackPacket,
        },
    };
}
