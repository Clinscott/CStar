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

function callbackPacketId(value: Record<string, unknown>): string | null {
    for (const key of ['callback_id', 'packet_name', 'name']) {
        if (typeof value[key] === 'string' && value[key].trim()) {
            return value[key].trim();
        }
    }
    return null;
}

function coerceCallbackOnlyReportPacket(
    obj: Record<string, unknown>,
    expectedCallbackPacket?: string,
): Record<string, unknown> | null {
    if (typeof obj.status === 'string') {
        return null;
    }
    const packetId = callbackPacketId(obj);
    if (!expectedCallbackPacket || packetId !== expectedCallbackPacket) {
        return null;
    }
    const summary = typeof obj.summary === 'string' && obj.summary.trim()
        ? obj.summary.trim()
        : typeof obj.headline === 'string' && obj.headline.trim()
            ? obj.headline.trim()
            : typeof obj.root_cause_summary === 'string' && obj.root_cause_summary.trim()
                ? obj.root_cause_summary.trim()
                : null;
    if (!summary) {
        return null;
    }
    return {
        status: 'pass',
        summary,
        files_changed: [],
        artifacts: { callback_packet: obj },
        validation: { callback_only_report_coerced: 'pass' },
        metrics: { callback_packet_contract: 'pass' },
        boundaries: {
            codex_worker_fallback_allowed: false,
            live_source_collection: false,
            report_only: true,
        },
        callback_packet: obj,
    };
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

function collectArtifactPathClaims(value: unknown): string[] {
    if (typeof value === 'string') {
        return looksLikePathClaim(value) ? [value] : [];
    }
    if (Array.isArray(value)) {
        return value.flatMap((entry) => collectArtifactPathClaims(entry));
    }
    if (value && typeof value === 'object') {
        return Object.values(value as Record<string, unknown>).flatMap((entry) => collectArtifactPathClaims(entry));
    }
    return [];
}

function claimedPathExists(claim: string, evidenceRoots: string[]): boolean {
    const candidates = path.isAbsolute(claim)
        ? [claim]
        : evidenceRoots.map((root) => path.resolve(root, claim));
    return candidates.some((candidate) => {
        try {
            return fs.existsSync(candidate);
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
    const originalObj = parsed as Record<string, unknown>;
    const obj = coerceCallbackOnlyReportPacket(originalObj, expectedCallbackPacket) ?? originalObj;
    const coercedFromCallback = obj !== originalObj;
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
    const filesChanged = obj.files_changed as unknown[];
    if (!filesChanged.every((entry) => typeof entry === 'string')) {
        return { ok: false, error: 'adapter_response_invalid_files_changed', summary: null };
    }
    if (isSuccessAdapterStatus(obj.status)) {
        const claimedPaths = [
            ...filesChanged,
            ...collectArtifactPathClaims(obj.artifacts),
        ].map((entry) => String(entry).trim()).filter(Boolean);
        const missingClaims = claimedPaths.filter((claim) => !claimedPathExists(claim, evidenceRoots));
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
            coerced_from_callback_packet: coercedFromCallback,
            ...callbackPacket,
        },
    };
}
