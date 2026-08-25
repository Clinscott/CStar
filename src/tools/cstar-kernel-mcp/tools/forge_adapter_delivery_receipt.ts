import { createHash } from 'node:crypto';

import type { ForgeWorkspaceCommitReceipt } from './forge_workspace_commit.js';

export interface PrivateForgeResponseProof {
    bytes: number;
    sha256: string;
}

function stableError(value: string | null, fallback = 'adapter_response_contract_invalid'): string {
    return value && /^[a-z0-9_]{1,120}$/.test(value)
        ? value
        : fallback;
}

function encoded(value: Record<string, unknown>): Buffer {
    return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

export function privateForgeResponseProof(content: Buffer): PrivateForgeResponseProof {
    return {
        bytes: content.byteLength,
        sha256: createHash('sha256').update(content).digest('hex'),
    };
}

export function buildSanitizedForgeResponseRejection(
    error: string | null,
    expectedCallbackPacket: string,
    privateResponse: PrivateForgeResponseProof,
): Buffer {
    return encoded({
        schema: 'cstar.forge_worker_response_rejection.v1',
        status: 'rejected',
        summary: 'Private Forge worker response rejected before delivery.',
        files_changed: [],
        artifacts: {
            worker_response_rejection: {
                contract_error: stableError(error),
                private_response_sha256: privateResponse.sha256,
                private_response_bytes: privateResponse.bytes,
                raw_response_persisted: false,
            },
        },
        validation: { response_contract: 'rejected' },
        metrics: { committed_file_count: 0 },
        boundaries: {
            raw_worker_response_persisted: false,
            project_file_writes: 0,
            live_source_collection: false,
        },
        callback_packet: expectedCallbackPacket,
    });
}

export function buildCanonicalForgeDeliveryReceipt(
    expectedCallbackPacket: string,
    privateResponse: PrivateForgeResponseProof,
    responseContract: Record<string, unknown>,
    workspaceCommit: ForgeWorkspaceCommitReceipt,
): Buffer {
    return encoded({
        schema: 'cstar.forge_delivery_receipt.v1',
        status: 'pass',
        summary: 'CStar committed the exact validated Forge outputs.',
        files_changed: workspaceCommit.files.map((file) => file.path),
        artifacts: {
            workspace_commit: workspaceCommit,
            private_worker_response: {
                sha256: privateResponse.sha256,
                bytes: privateResponse.bytes,
                persisted: false,
            },
        },
        validation: { private_response_contract: responseContract },
        metrics: { committed_file_count: workspaceCommit.files.length },
        boundaries: {
            canonical_source_paths: true,
            raw_worker_response_persisted: false,
            parent_published: true,
            live_source_collection: false,
        },
        callback_packet: expectedCallbackPacket,
    });
}

export function buildUnverifiedForgeResponseEvidence(
    reason: string | null,
    expectedCallbackPacket: string,
    privateResponse: PrivateForgeResponseProof,
    responseContract: Record<string, unknown>,
): Buffer {
    return encoded({
        schema: 'cstar.forge_worker_response_unverified.v1',
        status: 'inconclusive',
        summary: 'Private Forge response passed structure checks but was not committed.',
        files_changed: [],
        artifacts: {
            private_worker_response: {
                sha256: privateResponse.sha256,
                bytes: privateResponse.bytes,
                persisted: false,
            },
        },
        validation: { private_response_contract: responseContract },
        metrics: { committed_file_count: 0 },
        boundaries: {
            delivery_committed: false,
            raw_worker_response_persisted: false,
            reason: stableError(reason, 'adapter_delivery_not_committed'),
        },
        callback_packet: expectedCallbackPacket,
    });
}
