import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    ARTIFACT_MANIFEST_MAX_ENTRIES,
    ARTIFACT_MANIFEST_MAX_TOTAL_BYTES,
} from '../../../src/core/council_autoresearch/artifact_manifest.js';
import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
} from '../../../src/core/council_autoresearch/contracts.js';
import {
    validateRecoveryOwnerRecord,
    validateRepositoryOperationRecord,
} from '../../../src/core/council_autoresearch/repository_lease_contract.js';
import {
    REPOSITORY_RECEIPT_NAMES,
} from '../../../src/core/council_autoresearch/repository_receipt_operation_contract.js';

const baseKeys = Object.freeze([
    'schema_version', 'runner_version', 'operation_kind', 'operation_id',
    'lease_id', 'run_id', 'resume_token_sha256', 'owner', 'acquired_at',
] as const);
const receiptKeys = Object.freeze([
    'receipt_name', 'body_sha256', 'seal_sha256',
] as const);
const packetKeys = Object.freeze([
    'experiment_sha256', 'claim_sha256', 'bundle_plan_sha256',
    'bundle_entry_count', 'bundle_total_bytes',
] as const);

function digest(character: string): string {
    return character.repeat(64);
}

function owner(): Record<string, unknown> {
    return {
        pid: 123,
        hostname: 'receipt-contract.test',
        machine_id_sha256: digest('1'),
        boot_id_sha256: digest('2'),
        pid_namespace_sha256: digest('3'),
        process_start_ticks: '456',
    };
}

function operation(
    operationKind: 'lease-command' | 'receipt-command' = 'receipt-command',
): Record<string, unknown> {
    return {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        operation_kind: operationKind,
        operation_id: '00000000-0000-4000-8000-000000000001',
        lease_id: '00000000-0000-4000-8000-000000000002',
        run_id: 'receipt-contract-test',
        resume_token_sha256: digest('4'),
        owner: owner(),
        acquired_at: '2026-08-11T12:34:56.789Z',
    };
}

function nonPacket(receiptName = '20-ratings.json'): Record<string, unknown> {
    return {
        ...operation(),
        receipt_name: receiptName,
        body_sha256: digest('5'),
        seal_sha256: digest('6'),
    };
}

function packet(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ...nonPacket('10-packet.json'),
        experiment_sha256: digest('7'),
        claim_sha256: digest('8'),
        bundle_plan_sha256: digest('9'),
        bundle_entry_count: 1,
        bundle_total_bytes: 1,
        ...overrides,
    };
}

function invalid(record: Record<string, unknown>): void {
    assert.throws(() => validateRepositoryOperationRecord(record));
}

function recoveryOwner(operationKind: unknown): Record<string, unknown> {
    return {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        recovery_id: '00000000-0000-4000-8000-000000000003',
        target: {
            operation_kind: operationKind,
            operation_id: '00000000-0000-4000-8000-000000000001',
            guard_sha256: digest('a'),
            guard_device: '1',
            guard_inode: '2',
        },
        owner: owner(),
        acquired_at: '2026-08-11T12:34:56.789Z',
    };
}

describe('Council autoresearch receipt-command operation wire contract', () => {
    it('accepts only the exact closed non-packet receipt records', () => {
        assert.deepEqual(REPOSITORY_RECEIPT_NAMES, [
            '10-packet.json',
            '20-ratings.json',
            '25-mapping-reveal.json',
            '30-decision.json',
            '40-publication.json',
            '50-source-release.json',
        ]);
        for (const receiptName of REPOSITORY_RECEIPT_NAMES.slice(1)) {
            const record = nonPacket(receiptName);
            validateRepositoryOperationRecord(record);
            assert.deepEqual(Object.keys(record), [...baseKeys, ...receiptKeys]);
        }
    });

    it('accepts the exact packet receipt record and inclusive bundle bounds', () => {
        for (const record of [
            packet(),
            packet({
                bundle_entry_count: ARTIFACT_MANIFEST_MAX_ENTRIES,
                bundle_total_bytes: ARTIFACT_MANIFEST_MAX_TOTAL_BYTES,
            }),
        ]) {
            validateRepositoryOperationRecord(record);
            assert.deepEqual(Object.keys(record), [...baseKeys, ...receiptKeys, ...packetKeys]);
        }
    });

    it('preserves the legacy lease-command wire exactly', () => {
        const legacy = operation('lease-command');
        validateRepositoryOperationRecord(legacy);
        assert.deepEqual(Object.keys(legacy), baseKeys);

        invalid({
            ...legacy,
            receipt_name: '20-ratings.json',
            body_sha256: digest('5'),
            seal_sha256: digest('6'),
        });
    });

    it('rejects missing, extra, and cross-variant fields', () => {
        const exactPacket = packet();
        for (const key of [...receiptKeys, ...packetKeys]) {
            const missing = { ...exactPacket };
            delete missing[key];
            invalid(missing);
        }
        invalid({ ...exactPacket, unexpected: true });

        const exactNonPacket = nonPacket();
        for (const key of packetKeys) {
            invalid({ ...exactNonPacket, [key]: exactPacket[key] });
        }
        invalid({ ...exactNonPacket, receipt_name: '10-packet.json' });
        invalid({ ...exactPacket, receipt_name: '20-ratings.json' });
    });

    it('rejects excluded, unknown, and malformed receipt-name variants', () => {
        for (const receiptName of [
            '00-source-lease.json',
            '60-unknown.json',
            '../10-packet.json',
            '10-PACKET.json',
            '',
        ]) invalid(nonPacket(receiptName));
        invalid({ ...nonPacket(), operation_kind: 'receipt_command' });
    });

    it('rejects malformed digests and wrong scalar field types', () => {
        const exactPacket = packet();
        for (const key of [
            'body_sha256', 'seal_sha256', 'experiment_sha256',
            'claim_sha256', 'bundle_plan_sha256',
        ]) {
            invalid({ ...exactPacket, [key]: digest('A') });
            invalid({ ...exactPacket, [key]: 64 });
        }
        invalid({ ...exactPacket, receipt_name: 10 });
    });

    it('enforces packet bundle count and total-byte bounds', () => {
        for (const bundleEntryCount of [
            0, ARTIFACT_MANIFEST_MAX_ENTRIES + 1, 1.5, Number.NaN, '1',
        ]) invalid(packet({ bundle_entry_count: bundleEntryCount }));
        for (const bundleTotalBytes of [
            0, ARTIFACT_MANIFEST_MAX_TOTAL_BYTES + 1, 1.5, Number.NaN, '1',
        ]) invalid(packet({ bundle_total_bytes: bundleTotalBytes }));
    });

    it('accepts receipt-command recovery targets without widening other target kinds', () => {
        const receiptRecovery = recoveryOwner('receipt-command');
        validateRecoveryOwnerRecord(receiptRecovery);
        assert.deepEqual(Object.keys(receiptRecovery.target as object), [
            'operation_kind', 'operation_id', 'guard_sha256', 'guard_device', 'guard_inode',
        ]);

        for (const kind of ['receipt_command', 'packet-command', '', 10]) {
            assert.throws(() => validateRecoveryOwnerRecord(recoveryOwner(kind)));
        }
    });
});
