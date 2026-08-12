import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    MAX_JSON_FILE_BYTES,
    sha256,
    type Sha256,
} from '../../../src/core/council_autoresearch/contracts.js';
import {
    privateReceiptJsonContent,
    writePrivateReceiptContent,
} from '../../../src/core/council_autoresearch/repository_receipt_content.js';
import { writePrivateReceiptJson } from '../../../src/core/council_autoresearch/receipt_seal.js';
import { atomicPrivateTemporaryPath } from '../../../src/core/council_autoresearch/repository_private_file.js';
import { cleanup, temporary } from './test_helpers.js';

afterEach(cleanup);

function identity() {
    return { ownerPid: process.pid, operationId: randomUUID() };
}

function receiptFile(label: string): string {
    return path.join(temporary(`cstar-council-receipt-content-${label}-`), 'receipt.json');
}

function mutableFs(): { lstatSync: typeof fs.lstatSync } {
    return createRequire(import.meta.url)('node:fs') as { lstatSync: typeof fs.lstatSync };
}

describe('Council autoresearch exact private receipt content', () => {
    it('preserves the compatibility serializer bytes including Unicode and terminal LF', () => {
        const value = {
            title: 'café 🧪',
            nested: [true, null, { escaped: '\n' }],
        };
        const expected = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
        assert.deepEqual(privateReceiptJsonContent(value), expected);
        assert.equal(expected.at(-1), 0x0a);
        assert.throws(
            () => privateReceiptJsonContent(undefined),
            /not serializable JSON/i,
        );
        const cyclic: { self?: unknown } = {};
        cyclic.self = cyclic;
        assert.throws(() => privateReceiptJsonContent(cyclic), /not serializable JSON/i);
        assert.throws(
            () => privateReceiptJsonContent('x'.repeat(MAX_JSON_FILE_BYTES)),
            /byte limit/i,
        );
    });

    it('creates and replays exact content through both APIs without replacing its inode', () => {
        const file = receiptFile('replay');
        const value = { durable: true, unicode: 'λ' };
        const content = privateReceiptJsonContent(value);
        const digest = sha256(content);
        assert.deepEqual(
            writePrivateReceiptContent(file, content, digest, identity()),
            { sha256: digest, created: true },
        );
        const inode = fs.lstatSync(file, { bigint: true }).ino;
        assert.deepEqual(fs.readFileSync(file), content);
        assert.deepEqual(
            writePrivateReceiptContent(file, content, digest, identity()),
            { sha256: digest, created: false },
        );
        assert.deepEqual(
            writePrivateReceiptJson(file, value, identity()),
            { sha256: digest, created: false },
        );
        assert.equal(fs.lstatSync(file, { bigint: true }).ino, inode);
    });

    it('writes from its immediate content copy even if the caller Buffer later mutates', () => {
        const file = receiptFile('copy');
        const expected = privateReceiptJsonContent({ stable: true });
        const supplied = Buffer.from(expected);
        const digest = sha256(expected);
        const mutable = mutableFs();
        const originalLstat = mutable.lstatSync;
        let mutationObserved = false;
        mutable.lstatSync = ((...args: unknown[]) => {
            if (!mutationObserved && path.resolve(String(args[0])) === path.dirname(file)) {
                supplied.fill(0x20);
                mutationObserved = true;
            }
            return Reflect.apply(originalLstat, mutable, args);
        }) as typeof fs.lstatSync;
        syncBuiltinESMExports();
        try {
            assert.deepEqual(
                writePrivateReceiptContent(file, supplied, digest, identity()),
                { sha256: digest, created: true },
            );
        } finally {
            mutable.lstatSync = originalLstat;
            syncBuiltinESMExports();
        }
        assert.equal(mutationObserved, true);
        assert.equal(supplied.equals(expected), false);
        assert.deepEqual(fs.readFileSync(file), expected);
    });

    it('rejects content, digest, and identity before inspecting target or temporary paths', () => {
        const file = receiptFile('validation-order');
        const canonical = privateReceiptJsonContent({ exact: true });
        const mutable = mutableFs();
        const originalLstat = mutable.lstatSync;
        let inspected = 0;
        mutable.lstatSync = ((...args: unknown[]) => {
            const candidate = path.resolve(String(args[0]));
            if (candidate === file || candidate.startsWith(`${file}.tmp-`)) {
                inspected += 1;
                throw new Error('target or temporary inspected');
            }
            return Reflect.apply(originalLstat, mutable, args);
        }) as typeof fs.lstatSync;
        syncBuiltinESMExports();
        try {
            const cases: Array<{
                content: Buffer;
                digest: Sha256;
                writerIdentity: ReturnType<typeof identity>;
                error: RegExp;
            }> = [
                { content: Buffer.alloc(0), digest: sha256(Buffer.alloc(0)), writerIdentity: identity(), error: /byte limit/i },
                { content: Buffer.from([0xc3, 0x28]), digest: sha256(Buffer.from([0xc3, 0x28])), writerIdentity: identity(), error: /valid UTF-8/i },
                { content: Buffer.from('{\n'), digest: sha256(Buffer.from('{\n')), writerIdentity: identity(), error: /valid JSON/i },
                { content: Buffer.from('{"exact":true}\n'), digest: sha256(Buffer.from('{"exact":true}\n')), writerIdentity: identity(), error: /canonical pretty JSON/i },
                { content: canonical, digest: 'not-a-digest', writerIdentity: identity(), error: /expected digest must be a lowercase SHA-256/i },
                { content: canonical, digest: 'a'.repeat(64), writerIdentity: identity(), error: /digest does not match/i },
                { content: canonical, digest: sha256(canonical), writerIdentity: { ownerPid: 0, operationId: randomUUID() }, error: /creator identity is invalid/i },
                { content: Buffer.alloc(MAX_JSON_FILE_BYTES + 1, 0x20), digest: 'a'.repeat(64), writerIdentity: identity(), error: /byte limit/i },
            ];
            for (const sample of cases) {
                assert.throws(
                    () => writePrivateReceiptContent(
                        file,
                        sample.content,
                        sample.digest,
                        sample.writerIdentity,
                    ),
                    sample.error,
                );
            }
        } finally {
            mutable.lstatSync = originalLstat;
            syncBuiltinESMExports();
        }
        assert.equal(inspected, 0);
        assert.equal(fs.existsSync(file), false);
    });

    it('preserves exact replay conflicts and operation-derived temporary authority', () => {
        const file = receiptFile('conflict');
        const expected = privateReceiptJsonContent({ exact: true });
        const digest = sha256(expected);
        writePrivateReceiptContent(file, expected, digest, identity());
        const before = fs.readFileSync(file);
        const different = privateReceiptJsonContent({ exact: false });
        assert.throws(
            () => writePrivateReceiptContent(file, different, sha256(different), identity()),
            /private receipt conflicts/i,
        );
        assert.deepEqual(fs.readFileSync(file), before);

        const compactFile = receiptFile('compact-conflict');
        fs.writeFileSync(compactFile, '{"exact":true}\n', { mode: 0o600 });
        assert.throws(
            () => writePrivateReceiptContent(compactFile, expected, digest, identity()),
            /private receipt conflicts/i,
        );
        assert.equal(fs.readFileSync(compactFile, 'utf8'), '{"exact":true}\n');

        const blockedFile = receiptFile('temporary');
        const writerIdentity = identity();
        const temporaryFile = atomicPrivateTemporaryPath(
            blockedFile,
            writerIdentity.ownerPid,
            writerIdentity.operationId,
        );
        fs.writeFileSync(temporaryFile, expected, { mode: 0o600 });
        const temporaryBefore = fs.readFileSync(temporaryFile);
        assert.throws(
            () => writePrivateReceiptContent(
                blockedFile,
                expected,
                digest,
                writerIdentity,
            ),
            /EEXIST|exist/i,
        );
        assert.equal(fs.existsSync(blockedFile), false);
        assert.deepEqual(fs.readFileSync(temporaryFile), temporaryBefore);
    });
});
