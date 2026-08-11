import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    acquireRepositoryLease,
    canonicalJson,
    physicalReceiptPresent,
    receiptPairState,
    receiptSealPath,
    sealReceipt,
    sha256,
    verifyReceiptSeal,
    writePrivateReceiptJson,
} from '../../../src/core/council_autoresearch/index.js';
import { cleanup, repository, temporary } from './test_helpers.js';

afterEach(cleanup);

function writeIdentity() {
    return { ownerPid: process.pid, operationId: randomUUID() };
}

function receiptFixture(runId: string) {
    const repo = repository();
    const control = temporary('cstar-council-receipt-control-');
    const lease = acquireRepositoryLease({
        repoRoot: repo,
        controlRoot: control,
        runId,
        governedPaths: ['src'],
    });
    const directory = path.join(control, 'council-autoresearch', runId);
    const source = path.join(directory, '00-source-lease.json');
    fs.chmodSync(source, 0o600);
    assert.deepEqual(
        writePrivateReceiptJson(source, lease.record, writeIdentity()),
        { sha256: sha256(fs.readFileSync(source)), created: false },
    );
    return { repo, control, lease, directory, source };
}

describe('Council autoresearch descriptor-backed receipt seals', () => {
    it('commits only an exact private body/source-lease pair and replays identically', () => {
        const fixture = receiptFixture('council-receipt-seal-1');
        assert.equal(receiptPairState(fixture.source), 'body-only');
        assert.deepEqual(
            sealReceipt(fixture.source, fixture.lease.record, writeIdentity()),
            { created: true },
        );
        assert.deepEqual(
            sealReceipt(fixture.source, fixture.lease.record, writeIdentity()),
            { created: false },
        );
        assert.equal(receiptPairState(fixture.source, fixture.lease.record), 'sealed');
        assert.equal(fs.statSync(fixture.source).mode & 0o7777, 0o600);
        assert.equal(fs.statSync(receiptSealPath(fixture.source)).mode & 0o7777, 0o600);

        const packet = path.join(fixture.directory, '10-packet.json');
        const body = { packet_sha256: 'a'.repeat(64), durable: true };
        const oldUmask = process.umask(0);
        try {
            assert.equal(writePrivateReceiptJson(packet, body, writeIdentity()).created, true);
        } finally {
            process.umask(oldUmask);
        }
        assert.equal(fs.statSync(packet).mode & 0o7777, 0o600);
        assert.equal(writePrivateReceiptJson(packet, body, writeIdentity()).created, false);
        assert.equal(receiptPairState(packet), 'body-only');
        assert.equal(sealReceipt(packet, fixture.lease.record, writeIdentity()).created, true);
        const seal = verifyReceiptSeal(packet, fixture.lease.record);
        assert.equal(seal.receipt_name, '10-packet.json');
        assert.equal(seal.receipt_sha256, sha256(fs.readFileSync(packet)));
        assert.equal(seal.source_lease_sha256, sha256(fs.readFileSync(fixture.source)));
        assert.deepEqual(Object.keys(seal).sort(), [
            'lease_id', 'receipt_name', 'receipt_sha256', 'run_id', 'runner_version',
            'schema_version', 'source_head', 'source_lease_sha256',
            'source_manifest_sha256',
        ]);
        assert.equal(seal.run_id, fixture.lease.record.run_id);
        assert.equal(seal.lease_id, fixture.lease.record.lease_id);
        assert.equal(seal.source_head, fixture.lease.record.source_head);
        assert.equal(
            seal.source_manifest_sha256,
            fixture.lease.record.source_manifest.manifest_sha256,
        );
        assert.equal(physicalReceiptPresent(packet), true);
        assert.throws(
            () => receiptPairState(packet),
            /source lease is required to verify a sealed receipt pair/i,
        );

        const ratings = path.join(fixture.directory, '20-ratings.json');
        assert.equal(receiptPairState(ratings), 'absent');
        assert.equal(physicalReceiptPresent(ratings), false);
    });

    it('rejects conflicts, links, modes, special files, and unsupported locations without repair', () => {
        const fixture = receiptFixture('council-receipt-seal-2');
        const packet = path.join(fixture.directory, '10-packet.json');
        writePrivateReceiptJson(packet, { durable: true }, writeIdentity());
        assert.throws(
            () => writePrivateReceiptJson(packet, { durable: false }, writeIdentity()),
            /private receipt conflicts/i,
        );
        assert.deepEqual(JSON.parse(fs.readFileSync(packet, 'utf8')), { durable: true });

        const alias = `${packet}.tmp-${process.pid}-${randomUUID()}`;
        fs.linkSync(packet, alias);
        assert.throws(() => receiptPairState(packet), /exact private owned regular file/i);
        assert.equal(fs.existsSync(alias), true);
        assert.equal(fs.statSync(packet).nlink, 2);
        fs.unlinkSync(alias);

        fs.chmodSync(packet, 0o644);
        assert.throws(() => receiptPairState(packet), /exact private owned regular file/i);
        fs.chmodSync(packet, 0o600);

        const sealIdentity = writeIdentity();
        sealReceipt(packet, fixture.lease.record, sealIdentity);
        const sealAlias = `${receiptSealPath(packet)}.tmp-${
            sealIdentity.ownerPid
        }-${sealIdentity.operationId}`;
        fs.linkSync(receiptSealPath(packet), sealAlias);
        assert.throws(
            () => receiptPairState(packet, fixture.lease.record),
            /exact private owned regular file/i,
        );
        assert.equal(fs.existsSync(sealAlias), true);
        assert.equal(fs.statSync(receiptSealPath(packet)).nlink, 2);
        fs.unlinkSync(sealAlias);

        const ratings = path.join(fixture.directory, '20-ratings.json');
        fs.symlinkSync(packet, ratings);
        assert.throws(() => receiptPairState(ratings), /ELOOP|opened|private/i);

        const reveal = path.join(fixture.directory, '25-mapping-reveal.json');
        assert.equal(spawnSync('/usr/bin/mkfifo', [reveal]).status, 0);
        assert.throws(() => receiptPairState(reveal), /exact private owned regular file/i);
        assert.throws(
            () => receiptPairState(path.join(fixture.directory, '99-invented.json')),
            /not a supported lifecycle receipt/i,
        );

        const outside = path.join(temporary('cstar-council-receipt-outside-'), '10-packet.json');
        writePrivateReceiptJson(outside, { misplaced: true }, writeIdentity());
        assert.throws(
            () => sealReceipt(outside, fixture.lease.record, writeIdentity()),
            /does not belong to the source lease run directory/i,
        );
    });

    it('rejects body, source-lease, seal, and pair drift while preserving evidence', () => {
        const fixture = receiptFixture('council-receipt-seal-3');
        sealReceipt(fixture.source, fixture.lease.record, writeIdentity());
        const packet = path.join(fixture.directory, '10-packet.json');
        writePrivateReceiptJson(packet, { durable: true }, writeIdentity());
        sealReceipt(packet, fixture.lease.record, writeIdentity());
        fs.writeFileSync(packet, `${JSON.stringify({ durable: false }, null, 2)}\n`, { mode: 0o600 });
        assert.throws(
            () => verifyReceiptSeal(packet, fixture.lease.record),
            /does not bind the exact body and source lease/i,
        );

        const ratings = path.join(fixture.directory, '20-ratings.json');
        writePrivateReceiptJson(ratings, { ratings: [] }, writeIdentity());
        sealReceipt(ratings, fixture.lease.record, writeIdentity());
        const ratingsSeal = receiptSealPath(ratings);
        const malformed = { ...JSON.parse(fs.readFileSync(ratingsSeal, 'utf8')), unexpected: true };
        fs.writeFileSync(ratingsSeal, `${JSON.stringify(malformed, null, 2)}\n`, { mode: 0o600 });
        assert.throws(
            () => receiptPairState(ratings, fixture.lease.record),
            /unexpected or missing fields/i,
        );

        const decision = path.join(fixture.directory, '30-decision.json');
        fs.copyFileSync(receiptSealPath(fixture.source), receiptSealPath(decision));
        fs.chmodSync(receiptSealPath(decision), 0o600);
        assert.throws(() => receiptPairState(decision), /seal exists without its body/i);
        assert.equal(fs.existsSync(receiptSealPath(decision)), true);

        const differentLease = { ...fixture.lease.record, lease_id: randomUUID() };
        assert.throws(
            () => verifyReceiptSeal(fixture.source, differentLease),
            /source lease receipt does not match the seal authority/i,
        );
    });

    it('holds body descriptors across seal publication and detects a concurrent mutation', () => {
        const fixture = receiptFixture('council-receipt-seal-4');
        const packet = path.join(fixture.directory, '10-packet.json');
        writePrivateReceiptJson(packet, { durable: true }, writeIdentity());
        const sealFile = receiptSealPath(packet);
        const mutable = createRequire(import.meta.url)('node:fs') as {
            linkSync: typeof fs.linkSync;
        };
        const original = mutable.linkSync;
        let mutated = false;
        mutable.linkSync = ((existingPath, newPath) => {
            original(existingPath, newPath);
            if (path.resolve(String(newPath)) === sealFile) {
                mutated = true;
                fs.appendFileSync(packet, ' ');
            }
        }) as typeof fs.linkSync;
        syncBuiltinESMExports();
        let caught: unknown;
        try {
            try {
                sealReceipt(packet, fixture.lease.record, writeIdentity());
            } catch (error) {
                caught = error;
            }
        } finally {
            mutable.linkSync = original;
            syncBuiltinESMExports();
        }
        assert.equal(mutated, true);
        assert.match(String(caught), /identity changed/i);
        assert.equal(fs.existsSync(sealFile), true);
        assert.throws(
            () => verifyReceiptSeal(packet, fixture.lease.record),
            /valid JSON|does not bind/i,
        );
    });
});
