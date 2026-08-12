import path from 'node:path';

import {
    COUNCIL_AUTORESEARCH_RUNNER,
    COUNCIL_AUTORESEARCH_SCHEMA,
    MAX_JSON_FILE_BYTES,
    assertExactObjectKeys,
    assertRunId,
    assertSha256,
    canonicalJson,
    canonicalPrivateDirectory,
    fail,
    sha256,
    type Sha256,
} from './contracts.js';
import {
    verifyRepositoryLeaseRecordStructure,
    type RepositoryLeaseRecord,
} from './repository_lease_contract.js';
import {
    assertOwnedPrivateFile,
    closeOwnedPrivateFile,
    openPrivateJson,
    optionalStat,
    type OpenedPrivateJson,
} from './repository_private_file.js';
import {
    writePrivateReceiptJson,
    type ReceiptWriteIdentity,
} from './repository_receipt_content.js';

export { writePrivateReceiptJson };
export type { ReceiptWriteIdentity };

export interface ReceiptSeal {
    schema_version: typeof COUNCIL_AUTORESEARCH_SCHEMA;
    runner_version: typeof COUNCIL_AUTORESEARCH_RUNNER;
    run_id: string;
    lease_id: string;
    receipt_name: string;
    receipt_sha256: Sha256;
    source_lease_sha256: Sha256;
    source_head: string;
    source_manifest_sha256: Sha256;
}

export type ReceiptPairState = 'absent' | 'body-only' | 'sealed';

const RECEIPT_NAME = /^(?:00-source-lease|10-packet|20-ratings|25-mapping-reveal|30-decision|40-publication|50-source-release)\.json$/;

function canonicalJsonFile(file: string, label: string): string {
    if (typeof file !== 'string' || !path.isAbsolute(file) || path.resolve(file) !== file
        || !file.endsWith('.json') || /[\r\n\0]/.test(file)) {
        fail(`${label} must be an absolute canonical JSON path`);
    }
    return file;
}

export function receiptSealPath(receiptFile: string): string {
    const target = canonicalJsonFile(receiptFile, 'receipt path');
    return `${target.slice(0, -5)}.seal.json`;
}

function privateReceiptDirectory(file: string): string {
    return canonicalPrivateDirectory(path.dirname(file), 'receipt directory');
}

function validateLeaseForSeal(lease: RepositoryLeaseRecord): string {
    verifyRepositoryLeaseRecordStructure(lease, 'receipt seal source lease');
    return canonicalPrivateDirectory(lease.control_root, 'receipt seal control root');
}

function receiptLocation(receiptFile: string, lease: RepositoryLeaseRecord): {
    receipt: string;
    name: string;
    directory: string;
} {
    const controlRoot = validateLeaseForSeal(lease);
    const receipt = canonicalJsonFile(receiptFile, 'receipt path');
    const directory = path.join(controlRoot, 'council-autoresearch', lease.run_id);
    if (path.dirname(receipt) !== directory) {
        fail('receipt does not belong to the source lease run directory');
    }
    canonicalPrivateDirectory(directory, 'receipt run directory');
    const name = path.basename(receipt);
    if (!RECEIPT_NAME.test(name)) fail('receipt name is not a supported lifecycle receipt');
    return { receipt, name, directory };
}

function sourceLeaseFile(lease: RepositoryLeaseRecord): string {
    return path.join(
        lease.control_root,
        'council-autoresearch',
        lease.run_id,
        '00-source-lease.json',
    );
}

function closeOpened(files: Array<OpenedPrivateJson<unknown>>): void {
    let failure: unknown;
    for (const opened of files.reverse()) {
        try {
            closeOwnedPrivateFile(opened, 'private receipt');
        } catch (error) {
            failure ??= error;
        }
    }
    if (failure !== undefined) throw failure;
}

function openReceipt<T>(file: string, directory: string, label: string): OpenedPrivateJson<T> {
    return openPrivateJson<T>(file, directory, label, MAX_JSON_FILE_BYTES);
}

export function validateReceiptSealStructure(seal: ReceiptSeal): void {
    assertExactObjectKeys(seal, [
        'schema_version', 'runner_version', 'run_id', 'lease_id', 'receipt_name',
        'receipt_sha256', 'source_lease_sha256', 'source_head', 'source_manifest_sha256',
    ], 'receipt seal');
    if (seal.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA
        || seal.runner_version !== COUNCIL_AUTORESEARCH_RUNNER
        || typeof seal.lease_id !== 'string'
        || typeof seal.receipt_name !== 'string'
        || typeof seal.source_head !== 'string'
        || !/^[a-f0-9]{40}$/.test(seal.source_head)) {
        fail('receipt seal identity is invalid');
    }
    assertRunId(seal.run_id, 'receipt seal run_id');
    assertSha256(seal.receipt_sha256, 'receipt seal body digest');
    assertSha256(seal.source_lease_sha256, 'receipt seal source lease digest');
    assertSha256(seal.source_manifest_sha256, 'receipt seal source manifest digest');
}

export function expectedReceiptSeal(
    receiptFile: string,
    lease: RepositoryLeaseRecord,
    receiptContent: Buffer,
    sourceLeaseContent: Buffer = receiptContent,
): ReceiptSeal {
    const location = receiptLocation(receiptFile, lease);
    return {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        runner_version: COUNCIL_AUTORESEARCH_RUNNER,
        run_id: lease.run_id,
        lease_id: lease.lease_id,
        receipt_name: location.name,
        receipt_sha256: sha256(receiptContent),
        source_lease_sha256: sha256(sourceLeaseContent),
        source_head: lease.source_head,
        source_manifest_sha256: lease.source_manifest.manifest_sha256,
    };
}

function openSealInputs(receiptFile: string, lease: RepositoryLeaseRecord): {
    seal: ReceiptSeal;
    opened: Array<OpenedPrivateJson<unknown>>;
    location: { receipt: string; name: string; directory: string };
} {
    const location = receiptLocation(receiptFile, lease);
    const opened: Array<OpenedPrivateJson<unknown>> = [];
    try {
        const body = openReceipt<unknown>(
            location.receipt, location.directory, 'receipt body',
        );
        opened.push(body);
        const sourceFile = sourceLeaseFile(lease);
        const source = sourceFile === location.receipt
            ? body
            : openReceipt<RepositoryLeaseRecord>(
                sourceFile, location.directory, 'source lease receipt',
            );
        if (source !== body) opened.push(source);
        if (canonicalJson(source.record) !== canonicalJson(lease)) {
            fail('source lease receipt does not match the seal authority');
        }
        const seal = expectedReceiptSeal(
            location.receipt,
            lease,
            body.content,
            source.content,
        );
        return { seal, opened, location };
    } catch (error) {
        closeOpened(opened);
        throw error;
    }
}

export function verifyReceiptSeal(
    receiptFile: string,
    lease: RepositoryLeaseRecord,
): ReceiptSeal {
    const inputs = openSealInputs(receiptFile, lease);
    let opened: OpenedPrivateJson<ReceiptSeal> | undefined;
    try {
        opened = openReceipt<ReceiptSeal>(
            receiptSealPath(inputs.location.receipt),
            inputs.location.directory,
            'receipt seal',
        );
        validateReceiptSealStructure(opened.record);
        if (canonicalJson(opened.record) !== canonicalJson(inputs.seal)) {
            fail('receipt seal does not bind the exact body and source lease');
        }
        for (const input of inputs.opened) assertOwnedPrivateFile(input, 'private receipt');
        assertOwnedPrivateFile(opened, 'receipt seal');
        return opened.record;
    } finally {
        closeOpened(opened ? [...inputs.opened, opened] : inputs.opened);
    }
}

function privateJsonPresent(file: string, label: string): boolean {
    if (optionalStat(file) === undefined) return false;
    const directory = privateReceiptDirectory(file);
    const opened = openReceipt<unknown>(file, directory, label);
    closeOwnedPrivateFile(opened, label);
    return true;
}

export function physicalReceiptPresent(receiptFile: string): boolean {
    const receipt = canonicalJsonFile(receiptFile, 'receipt path');
    const name = path.basename(receipt);
    if (!RECEIPT_NAME.test(name)) fail('receipt name is not a supported lifecycle receipt');
    const body = privateJsonPresent(receipt, 'receipt body');
    const seal = privateJsonPresent(receiptSealPath(receipt), 'receipt seal');
    return body || seal;
}

export function receiptPairState(
    receiptFile: string,
    lease?: RepositoryLeaseRecord,
): ReceiptPairState {
    const receipt = canonicalJsonFile(receiptFile, 'receipt path');
    const name = path.basename(receipt);
    if (!RECEIPT_NAME.test(name)) fail('receipt name is not a supported lifecycle receipt');
    const body = privateJsonPresent(receipt, 'receipt body');
    const sealFile = receiptSealPath(receipt);
    const seal = privateJsonPresent(sealFile, 'receipt seal');
    if (seal && !body) fail('receipt seal exists without its body');
    if (!body) return 'absent';
    if (!seal) return 'body-only';
    const directory = privateReceiptDirectory(sealFile);
    const opened = openReceipt<ReceiptSeal>(sealFile, directory, 'receipt seal');
    try {
        validateReceiptSealStructure(opened.record);
    } finally {
        closeOwnedPrivateFile(opened, 'receipt seal');
    }
    if (!lease) fail('source lease is required to verify a sealed receipt pair');
    verifyReceiptSeal(receipt, lease);
    return 'sealed';
}

export function sealReceipt(
    receiptFile: string,
    lease: RepositoryLeaseRecord,
    identity: ReceiptWriteIdentity,
): { created: boolean } {
    const state = receiptPairState(receiptFile, lease);
    if (state === 'sealed') return { created: false };
    if (state !== 'body-only') fail('receipt body is required before sealing');
    const inputs = openSealInputs(receiptFile, lease);
    let persisted: { sha256: Sha256; created: boolean };
    try {
        persisted = writePrivateReceiptJson(
            receiptSealPath(receiptFile),
            inputs.seal,
            identity,
        );
        for (const opened of inputs.opened) {
            assertOwnedPrivateFile(opened, 'private receipt');
        }
    } finally {
        closeOpened(inputs.opened);
    }
    verifyReceiptSeal(receiptFile, lease);
    return { created: persisted.created };
}
