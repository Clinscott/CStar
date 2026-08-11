import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    ARTIFACT_MANIFEST_MAX_DEPTH,
    ARTIFACT_MANIFEST_MAX_ENTRIES,
    ARTIFACT_MANIFEST_MAX_FILE_BYTES,
    ARTIFACT_MANIFEST_MAX_TOTAL_BYTES,
    MAX_JSON_FILE_BYTES,
    MAX_REGULAR_FILE_BYTES,
    buildArtifactManifest,
    readJson,
    readRegularFileNoFollow,
    repairInterruptedImmutableWrite,
    writeImmutableFile,
    writeImmutableJson,
} from '../../../src/core/council_autoresearch/index.js';

const roots: string[] = [];

afterEach(() => {
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

function temporary(label: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), label));
    roots.push(root);
    return root;
}

function sparseFile(file: string, bytes: number): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '');
    fs.truncateSync(file, bytes);
}

function interruptedAlias(target: string, suffix: string): string {
    return `${target}.tmp-999999999-${suffix}`;
}

describe('Council autoresearch resource bounds', () => {
    it('caps regular-file and JSON reads before allocating file-sized buffers', () => {
        const root = temporary('cstar-council-read-bounds-');
        const smallJson = path.join(root, 'small.json');
        fs.writeFileSync(smallJson, '{"bounded":true}\n');
        assert.equal(readJson<{ bounded: boolean }>(smallJson).bounded, true);

        const oversizedJson = path.join(root, 'oversized.json');
        sparseFile(oversizedJson, MAX_JSON_FILE_BYTES + 1);
        assert.throws(() => readJson(oversizedJson), /exceeds.*read limit/i);

        const oversizedFile = path.join(root, 'oversized.bin');
        sparseFile(oversizedFile, MAX_REGULAR_FILE_BYTES + 1);
        assert.throws(() => readRegularFileNoFollow(oversizedFile), /exceeds.*read limit/i);
        assert.throws(
            () => readRegularFileNoFollow(smallJson, 'small JSON', MAX_REGULAR_FILE_BYTES + 1),
            /read limit must be a safe integer/i,
        );
    });

    it('repairs one exact interrupted immutable-write alias on identical replay', () => {
        const root = temporary('cstar-council-immutable-repair-');
        const target = path.join(root, 'receipt.json');
        const value = { durable: true };
        assert.equal(writeImmutableJson(target, value).created, true);
        const alias = interruptedAlias(target, '00000000-0000-4000-8000-000000000001');
        fs.linkSync(target, alias);
        assert.equal(fs.statSync(target).nlink, 2);

        assert.equal(writeImmutableJson(target, value).created, false);
        assert.equal(fs.existsSync(alias), false);
        assert.equal(fs.statSync(target).nlink, 1);
    });

    it('preserves an interrupted alias on conflicting replay', () => {
        const root = temporary('cstar-council-immutable-conflict-');
        const target = path.join(root, 'receipt.json');
        assert.equal(writeImmutableJson(target, { durable: true }).created, true);
        const alias = interruptedAlias(target, '00000000-0000-4000-8000-000000000005');
        fs.linkSync(target, alias);
        assert.throws(
            () => writeImmutableJson(target, { durable: false }),
            /immutable receipt conflicts/i,
        );
        assert.equal(fs.existsSync(alias), true);
        assert.equal(fs.statSync(target).nlink, 2);
    });

    it('preserves malformed runner-shaped immutable aliases', () => {
        const root = temporary('cstar-council-immutable-malformed-');
        const target = path.join(root, 'receipt.json');
        assert.equal(writeImmutableJson(target, { durable: true }).created, true);
        const alias = `${target}.tmp-999999999-${'f'.repeat(36)}`;
        fs.linkSync(target, alias);
        assert.throws(() => writeImmutableJson(target, { durable: true }), /unexplained hard links/i);
        assert.equal(fs.existsSync(alias), true);
        assert.equal(fs.statSync(target).nlink, 2);
    });

    it('does not repair unexplained or multiply linked immutable targets', () => {
        const root = temporary('cstar-council-immutable-links-');
        const unexplained = path.join(root, 'unexplained.json');
        writeImmutableJson(unexplained, { durable: true });
        const foreignAlias = path.join(root, 'foreign-alias.json');
        fs.linkSync(unexplained, foreignAlias);
        assert.throws(
            () => writeImmutableJson(unexplained, { durable: true }),
            /unexplained hard links/i,
        );
        assert.equal(fs.existsSync(foreignAlias), true);
        assert.equal(fs.statSync(unexplained).nlink, 2);

        const multiple = path.join(root, 'multiple.json');
        const multipleReceipt = writeImmutableJson(multiple, { durable: true });
        const firstAlias = interruptedAlias(multiple, '00000000-0000-4000-8000-000000000002');
        const secondAlias = interruptedAlias(multiple, '00000000-0000-4000-8000-000000000003');
        fs.linkSync(multiple, firstAlias);
        fs.linkSync(multiple, secondAlias);
        assert.throws(
            () => repairInterruptedImmutableWrite(multiple, {
                digest: multipleReceipt.sha256,
                mode: 0o600,
            }),
            /unexplained hard links/i,
        );
        assert.equal(fs.existsSync(firstAlias), true);
        assert.equal(fs.existsSync(secondAlias), true);
        assert.equal(fs.statSync(multiple).nlink, 3);
    });

    it('never repairs runner-shaped aliases during a generic artifact read', () => {
        const root = temporary('cstar-council-generic-read-links-');
        const target = path.join(root, 'artifact.txt');
        fs.writeFileSync(target, 'artifact bytes\n');
        const alias = interruptedAlias(target, '00000000-0000-4000-8000-000000000004');
        fs.linkSync(target, alias);

        assert.throws(() => readRegularFileNoFollow(target), /single-link regular file/i);
        assert.equal(fs.existsSync(alias), true);
        assert.equal(fs.statSync(target).nlink, 2);
    });

    it('preserves immutable file mode and rejects mode-conflicting replay', () => {
        const root = temporary('cstar-council-immutable-mode-');
        const target = path.join(root, 'bundle.mjs');
        const content = Buffer.from('export default true;\n');

        assert.equal(writeImmutableFile(target, content, 0o640).created, true);
        assert.equal(fs.statSync(target).mode & 0o777, 0o640);
        assert.equal(writeImmutableFile(target, content, 0o640).created, false);
        assert.throws(
            () => writeImmutableFile(target, content, 0o600),
            /immutable receipt conflicts/i,
        );
        assert.equal(fs.statSync(target).mode & 0o777, 0o640);
    });

    it('rejects an oversized artifact file during metadata preflight', () => {
        const root = temporary('cstar-council-artifact-file-bound-');
        sparseFile(path.join(root, 'artifact.bin'), ARTIFACT_MANIFEST_MAX_FILE_BYTES + 1);
        assert.throws(() => buildArtifactManifest({
            root,
            rootLabel: 'file-bound',
            includedPaths: ['artifact.bin'],
        }), /artifact file exceeds/i);
    });

    it('rejects an oversized aggregate during metadata preflight', () => {
        const root = temporary('cstar-council-artifact-total-bound-');
        const count = Math.floor(
            ARTIFACT_MANIFEST_MAX_TOTAL_BYTES / ARTIFACT_MANIFEST_MAX_FILE_BYTES,
        ) + 1;
        for (let index = 0; index < count; index += 1) {
            sparseFile(path.join(root, `artifact-${index}.bin`), ARTIFACT_MANIFEST_MAX_FILE_BYTES);
        }
        assert.throws(() => buildArtifactManifest({
            root,
            rootLabel: 'total-bound',
            includedPaths: ['.'],
        }), /artifact manifest exceeds.*total bytes/i);
    });

    it('bounds traversal depth before walking an arbitrarily deep tree', () => {
        const root = temporary('cstar-council-artifact-depth-bound-');
        let directory = path.join(root, 'tree');
        for (let depth = 0; depth < ARTIFACT_MANIFEST_MAX_DEPTH; depth += 1) {
            directory = path.join(directory, `level-${depth}`);
        }
        fs.mkdirSync(directory, { recursive: true });
        assert.throws(() => buildArtifactManifest({
            root,
            rootLabel: 'depth-bound',
            includedPaths: ['tree'],
        }), /maximum depth/i);
    });

    it('bounds the combined file-and-directory entry count', () => {
        const root = temporary('cstar-council-artifact-entry-bound-');
        const crowded = path.join(root, 'crowded');
        fs.mkdirSync(crowded);
        for (let index = 0; index < ARTIFACT_MANIFEST_MAX_ENTRIES; index += 1) {
            fs.writeFileSync(path.join(crowded, `${index}.txt`), '');
        }
        assert.throws(() => buildArtifactManifest({
            root,
            rootLabel: 'entry-bound',
            includedPaths: ['crowded'],
        }), /filesystem entries/i);
    });

    it('still hashes bounded files into a deterministic manifest', () => {
        const root = temporary('cstar-council-artifact-bounded-');
        fs.mkdirSync(path.join(root, 'evidence'));
        fs.writeFileSync(path.join(root, 'evidence', 'proof.txt'), 'bounded evidence\n');
        const first = buildArtifactManifest({
            root,
            rootLabel: 'bounded',
            includedPaths: ['evidence'],
        });
        const second = buildArtifactManifest({
            root,
            rootLabel: 'bounded',
            includedPaths: ['evidence'],
        });
        assert.deepEqual(second, first);
        assert.equal(first.entries[0].path, 'evidence/proof.txt');
    });
});
