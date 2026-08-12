import path from 'node:path';
import { TextDecoder } from 'node:util';

import {
    MAX_JSON_FILE_BYTES,
    assertSha256,
    canonicalPrivateDirectory,
    fail,
    sha256,
    type Sha256,
} from './contracts.js';
import {
    atomicPrivateTemporaryPath,
    closeOwnedPrivateFile,
    createAtomicPrivateFile,
    openPrivateJson,
    optionalStat,
} from './repository_private_file.js';

export interface ReceiptWriteIdentity {
    ownerPid: number;
    operationId: string;
}

function canonicalJsonFile(file: string): string {
    if (typeof file !== 'string' || !path.isAbsolute(file) || path.resolve(file) !== file
        || !file.endsWith('.json') || /[\r\n\0]/.test(file)) {
        fail('private receipt path must be an absolute canonical JSON path');
    }
    return file;
}

export function privateReceiptJsonContent(value: unknown): Buffer {
    let serialized: string | undefined;
    try {
        serialized = JSON.stringify(value, null, 2);
    } catch (error) {
        fail(`private receipt is not serializable JSON: ${
            error instanceof Error ? error.message : String(error)
        }`);
    }
    if (serialized === undefined) fail('private receipt is not serializable JSON');
    const content = Buffer.from(`${serialized}\n`);
    if (content.length < 1 || content.length > MAX_JSON_FILE_BYTES) {
        fail('private receipt exceeds its byte limit');
    }
    return content;
}

function copyAndValidateContent(content: Buffer, expectedSha256: Sha256): {
    content: Buffer;
    sha256: Sha256;
} {
    if (!Buffer.isBuffer(content)) fail('private receipt content must be a Buffer');
    const copy = Buffer.from(content);
    if (copy.length < 1 || copy.length > MAX_JSON_FILE_BYTES) {
        fail('private receipt exceeds its byte limit');
    }
    let decoded: string;
    try {
        decoded = new TextDecoder('utf-8', { fatal: true }).decode(copy);
    } catch (error) {
        fail(`private receipt is not valid UTF-8: ${
            error instanceof Error ? error.message : String(error)
        }`);
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(decoded);
    } catch (error) {
        fail(`private receipt is not valid JSON: ${
            error instanceof Error ? error.message : String(error)
        }`);
    }
    if (!privateReceiptJsonContent(parsed).equals(copy)) {
        fail('private receipt content is not canonical pretty JSON');
    }
    assertSha256(expectedSha256, 'private receipt expected digest');
    const digest = sha256(copy);
    if (digest !== expectedSha256) fail('private receipt content digest does not match');
    return { content: copy, sha256: digest };
}

export function writePrivateReceiptContent(
    file: string,
    content: Buffer,
    expectedSha256: Sha256,
    identity: ReceiptWriteIdentity,
): { sha256: Sha256; created: boolean } {
    const stable = copyAndValidateContent(content, expectedSha256);
    const target = canonicalJsonFile(file);
    if (!identity || typeof identity !== 'object') {
        fail('private receipt write identity is required');
    }
    const temporary = atomicPrivateTemporaryPath(
        target,
        identity.ownerPid,
        identity.operationId,
    );
    const commonDirectory = canonicalPrivateDirectory(
        path.dirname(target),
        'receipt directory',
    );
    if (optionalStat(target) !== undefined) {
        const opened = openPrivateJson<unknown>(
            target,
            commonDirectory,
            'private receipt',
            MAX_JSON_FILE_BYTES,
        );
        try {
            if (!opened.content.equals(stable.content)) {
                fail(`private receipt conflicts at ${target}`);
            }
            return { sha256: stable.sha256, created: false };
        } finally {
            closeOwnedPrivateFile(opened, 'private receipt');
        }
    }
    const owned = createAtomicPrivateFile({
        file: target,
        temporary,
        commonDirectory,
        content: stable.content,
        label: 'private receipt',
    });
    try {
        return { sha256: stable.sha256, created: true };
    } finally {
        closeOwnedPrivateFile(owned, 'private receipt');
    }
}

export function writePrivateReceiptJson(
    file: string,
    value: unknown,
    identity: ReceiptWriteIdentity,
): { sha256: Sha256; created: boolean } {
    const content = privateReceiptJsonContent(value);
    return writePrivateReceiptContent(file, content, sha256(content), identity);
}
