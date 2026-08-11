import fs from 'node:fs';
import path from 'node:path';

import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    assertExactObjectKeys,
    assertRunId,
    assertSha256,
    fail,
    readJson,
    repairInterruptedImmutableWrite,
    sha256File,
    writeImmutableJson,
} from './contracts.js';
import { RepositoryLeaseRecord } from './repository_lease_contract.js';

export interface ReceiptSeal {
    schema_version: typeof COUNCIL_AUTORESEARCH_SCHEMA;
    runner_version: typeof COUNCIL_AUTORESEARCH_RUNNER;
    run_id: string;
    lease_id: string;
    receipt_name: string;
    receipt_sha256: string;
    source_lease_sha256: string;
    source_head: string;
    source_manifest_sha256: string;
}

export type ReceiptPairState = 'absent' | 'body-only' | 'sealed';

const RECEIPT_NAME = /^(00-source-lease|10-packet|20-ratings|25-mapping-reveal|30-decision|40-publication|50-source-release)\.json$/;

export function receiptSealPath(receiptFile: string): string {
    const target = path.resolve(receiptFile);
    if (!target.endsWith('.json')) fail('receipt path must end in .json');
    return `${target.slice(0, -5)}.seal.json`;
}

function regularFileExists(file: string): boolean {
    repairInterruptedImmutableWrite(file);
    try {
        const stat = fs.lstatSync(file);
        if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) {
            fail(`receipt pair contains an invalid file: ${file}`);
        }
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
    }
}

export function physicalReceiptPresent(receiptFile: string): boolean {
    return regularFileExists(path.resolve(receiptFile)) || regularFileExists(receiptSealPath(receiptFile));
}

function assertReceiptLocation(receiptFile: string, lease: RepositoryLeaseRecord): string {
    const receipt = path.resolve(receiptFile);
    const expectedDirectory = path.resolve(lease.control_root, 'council-autoresearch', lease.run_id);
    if (path.dirname(receipt) !== expectedDirectory) fail('receipt does not belong to the source lease run directory');
    const name = path.basename(receipt);
    if (!RECEIPT_NAME.test(name)) fail('receipt name is not a supported lifecycle receipt');
    return name;
}

function sourceLeaseFile(lease: RepositoryLeaseRecord): string {
    return path.resolve(lease.control_root, 'council-autoresearch', lease.run_id, '00-source-lease.json');
}

function sealValue(receiptFile: string, lease: RepositoryLeaseRecord): ReceiptSeal {
    return {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        run_id: lease.run_id,
        lease_id: lease.lease_id,
        receipt_name: assertReceiptLocation(receiptFile, lease),
        receipt_sha256: sha256File(receiptFile),
        source_lease_sha256: sha256File(sourceLeaseFile(lease)),
        source_head: lease.source_head,
        source_manifest_sha256: lease.source_manifest.manifest_sha256,
    };
}

export function verifyReceiptSeal(receiptFile: string, lease: RepositoryLeaseRecord): ReceiptSeal {
    const seal = readJson<ReceiptSeal>(receiptSealPath(receiptFile));
    assertExactObjectKeys(seal, [
        'schema_version', 'runner_version', 'run_id', 'lease_id', 'receipt_name',
        'receipt_sha256', 'source_lease_sha256', 'source_head', 'source_manifest_sha256',
    ], 'receipt seal');
    if (seal.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || seal.runner_version !== COUNCIL_AUTORESEARCH_RUNNER
        || seal.run_id !== lease.run_id
        || seal.lease_id !== lease.lease_id
        || seal.receipt_name !== assertReceiptLocation(receiptFile, lease)
        || seal.source_head !== lease.source_head
        || seal.source_manifest_sha256 !== lease.source_manifest.manifest_sha256) {
        fail('receipt seal does not bind the source lease');
    }
    assertRunId(seal.run_id);
    assertSha256(seal.receipt_sha256, 'receipt seal body digest');
    assertSha256(seal.source_lease_sha256, 'receipt seal source lease digest');
    assertSha256(seal.source_manifest_sha256, 'receipt seal source manifest digest');
    if (seal.receipt_sha256 !== sha256File(receiptFile)
        || seal.source_lease_sha256 !== sha256File(sourceLeaseFile(lease))) {
        fail('receipt seal digest mismatch');
    }
    return seal;
}

export function receiptPairState(receiptFile: string, lease?: RepositoryLeaseRecord): ReceiptPairState {
    const body = regularFileExists(path.resolve(receiptFile));
    const seal = regularFileExists(receiptSealPath(receiptFile));
    if (seal && !body) fail('receipt seal exists without its body');
    if (!body) return 'absent';
    if (!seal) return 'body-only';
    if (lease) verifyReceiptSeal(receiptFile, lease);
    return 'sealed';
}

export function sealReceipt(receiptFile: string, lease: RepositoryLeaseRecord): { created: boolean } {
    const state = receiptPairState(receiptFile, lease);
    if (state === 'sealed') return { created: false };
    if (state !== 'body-only') fail('receipt body is required before sealing');
    const persisted = writeImmutableJson(receiptSealPath(receiptFile), sealValue(receiptFile, lease));
    verifyReceiptSeal(receiptFile, lease);
    return { created: persisted.created };
}
