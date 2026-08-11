import {
    ARTIFACT_MANIFEST_MAX_ENTRIES,
    ARTIFACT_MANIFEST_MAX_TOTAL_BYTES,
} from './artifact_manifest.js';
import { assertSha256, fail } from './contracts.js';

export const REPOSITORY_RECEIPT_NAMES = Object.freeze([
    '10-packet.json',
    '20-ratings.json',
    '25-mapping-reveal.json',
    '30-decision.json',
    '40-publication.json',
    '50-source-release.json',
] as const);

export type RepositoryReceiptName = typeof REPOSITORY_RECEIPT_NAMES[number];
export type RepositoryNonPacketReceiptName = Exclude<
    RepositoryReceiptName,
    '10-packet.json'
>;

export interface RepositoryReceiptOperationBaseFields {
    receipt_name: RepositoryReceiptName;
    body_sha256: string;
    seal_sha256: string;
}

export interface RepositoryPacketReceiptOperationFields
    extends RepositoryReceiptOperationBaseFields {
    receipt_name: '10-packet.json';
    experiment_sha256: string;
    claim_sha256: string;
    bundle_plan_sha256: string;
    bundle_entry_count: number;
    bundle_total_bytes: number;
}

export interface RepositoryNonPacketReceiptOperationFields
    extends RepositoryReceiptOperationBaseFields {
    receipt_name: RepositoryNonPacketReceiptName;
}

export type RepositoryReceiptOperationFields =
    | RepositoryPacketReceiptOperationFields
    | RepositoryNonPacketReceiptOperationFields;

const receiptFieldKeys = Object.freeze([
    'receipt_name', 'body_sha256', 'seal_sha256',
] as const);
const packetReceiptFieldKeys = Object.freeze([
    ...receiptFieldKeys,
    'experiment_sha256', 'claim_sha256', 'bundle_plan_sha256',
    'bundle_entry_count', 'bundle_total_bytes',
] as const);

function assertReceiptName(value: unknown): asserts value is RepositoryReceiptName {
    if (typeof value !== 'string'
        || !REPOSITORY_RECEIPT_NAMES.includes(value as RepositoryReceiptName)) {
        fail('repository receipt operation name is invalid');
    }
}

export function repositoryReceiptOperationFieldKeys(record: unknown): readonly string[] {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
        fail('repository receipt operation must be an object');
    }
    const receiptName = (record as { receipt_name?: unknown }).receipt_name;
    assertReceiptName(receiptName);
    return receiptName === '10-packet.json' ? packetReceiptFieldKeys : receiptFieldKeys;
}

export function validateRepositoryReceiptOperationFields(
    record: unknown,
): asserts record is RepositoryReceiptOperationFields {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
        fail('repository receipt operation must be an object');
    }
    const value = record as Record<string, unknown>;
    assertReceiptName(value.receipt_name);
    assertSha256(value.body_sha256, 'repository receipt operation body hash');
    assertSha256(value.seal_sha256, 'repository receipt operation seal hash');
    if (value.receipt_name !== '10-packet.json') return;
    assertSha256(value.experiment_sha256, 'repository packet receipt experiment hash');
    assertSha256(value.claim_sha256, 'repository packet receipt claim hash');
    assertSha256(value.bundle_plan_sha256, 'repository packet receipt bundle plan hash');
    if (!Number.isSafeInteger(value.bundle_entry_count)
        || (value.bundle_entry_count as number) < 1
        || (value.bundle_entry_count as number) > ARTIFACT_MANIFEST_MAX_ENTRIES) {
        fail('repository packet receipt bundle entry count is invalid');
    }
    if (!Number.isSafeInteger(value.bundle_total_bytes)
        || (value.bundle_total_bytes as number) < 1
        || (value.bundle_total_bytes as number) > ARTIFACT_MANIFEST_MAX_TOTAL_BYTES) {
        fail('repository packet receipt bundle total bytes is invalid');
    }
}
