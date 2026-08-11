import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { canonicalJson, sha256 } from '../../../src/core/council_autoresearch/contracts.js';
import type {
    FrozenBundleEffectPlan,
    FrozenBundleOperationAuthority,
} from '../../../src/core/council_autoresearch/frozen_bundle_effect_plan.js';
import {
    inspectOperationBoundFrozenFile,
    repairOperationBoundFrozenFilePublication,
    writeOperationBoundFrozenFile,
} from '../../../src/core/council_autoresearch/frozen_operation_file.js';
import { atomicPrivateTemporaryPath } from '../../../src/core/council_autoresearch/repository_private_file.js';
import { cleanup, temporary } from './test_helpers.js';

afterEach(cleanup);

const operationId = '00000000-0000-4000-8000-000000000777';

interface Fixture {
    witness: string;
    destination: string;
    target: string;
    temporary: string;
    content: Buffer;
    plan: FrozenBundleEffectPlan;
    authority: FrozenBundleOperationAuthority;
}

function effectPlan(destination: string, content: Buffer, mode: 0o644 | 0o755): FrozenBundleEffectPlan {
    const entries = Object.freeze([Object.freeze({
        path: 'nested/effect.bin',
        sha256: sha256(content),
        bytes: content.length,
        mode,
    })]);
    const base = {
        packet_sha256: 'a'.repeat(64),
        destination_root: destination,
        entry_count: 1,
        total_bytes: content.length,
        entries,
    };
    return Object.freeze({
        ...base,
        bundle_plan_sha256: sha256(canonicalJson(base)),
    });
}

function fixture(mode: 0o644 | 0o755 = 0o644): Fixture {
    const witness = temporary('cstar-frozen-operation-witness-');
    const destination = temporary('cstar-frozen-operation-destination-');
    fs.mkdirSync(path.join(witness, 'nested'), { mode: 0o700 });
    fs.mkdirSync(path.join(destination, 'nested'), { mode: 0o700 });
    const content = Buffer.from('operation-bound frozen bytes\n');
    fs.writeFileSync(path.join(witness, 'nested', 'effect.bin'), content, { mode });
    fs.chmodSync(path.join(witness, 'nested', 'effect.bin'), mode);
    const plan = effectPlan(destination, content, mode);
    const authority = Object.freeze({
        owner_pid: process.pid,
        operation_id: operationId,
        bundle_plan_sha256: plan.bundle_plan_sha256,
        bundle_entry_count: plan.entry_count,
        bundle_total_bytes: plan.total_bytes,
    });
    const target = path.join(destination, 'nested', 'effect.bin');
    return {
        witness,
        destination,
        target,
        temporary: atomicPrivateTemporaryPath(target, process.pid, operationId),
        content,
        plan,
        authority,
    };
}

function bound(f: Fixture, observe = () => undefined) {
    return () => {
        observe();
        return f.authority;
    };
}

function operationInput(f: Fixture, observe = () => undefined) {
    return {
        plan: f.plan,
        entryIndex: 0,
        assertTargetBoundOperation: bound(f, observe),
    };
}

function assertPostUnlinkAuthorityDrift(
    f: Fixture,
    action: (authority: () => FrozenBundleOperationAuthority) => unknown,
): void {
    const mutable = createRequire(import.meta.url)('node:fs') as typeof fs;
    const originalUnlink = mutable.unlinkSync;
    const originalFsync = mutable.fsyncSync;
    const changed = Object.freeze({
        ...f.authority,
        operation_id: '00000000-0000-4000-8000-000000000779',
    });
    let unlinked = false;
    let postUnlinkDirectorySyncs = 0;
    mutable.unlinkSync = ((file: fs.PathLike) => {
        originalUnlink(file);
        if (file === f.temporary) unlinked = true;
    }) as typeof fs.unlinkSync;
    mutable.fsyncSync = ((descriptor: number) => {
        if (unlinked && fs.fstatSync(descriptor).isDirectory()) postUnlinkDirectorySyncs += 1;
        return originalFsync(descriptor);
    }) as typeof fs.fsyncSync;
    syncBuiltinESMExports();
    try {
        assert.throws(
            () => action(() => unlinked ? changed : f.authority),
            /authority changed/i,
        );
    } finally {
        mutable.unlinkSync = originalUnlink;
        mutable.fsyncSync = originalFsync;
        syncBuiltinESMExports();
    }
    assert.equal(unlinked, true);
    assert.equal(postUnlinkDirectorySyncs, 0);
}

describe('operation-bound frozen files', () => {
    it('writes exact bytes once, verifies raw mode, and replays without a new temporary', () => {
        const f = fixture(0o755);
        let assertions = 0;
        assert.deepEqual(writeOperationBoundFrozenFile({
            ...operationInput(f, () => { assertions += 1; }),
            witnessRoot: f.witness,
        }), { sha256: sha256(f.content), created: true });
        assert.ok(assertions >= 7);
        assert.deepEqual(fs.readFileSync(f.target), f.content);
        assert.equal(fs.statSync(f.target).mode & 0o7777, 0o755);
        assert.equal(fs.statSync(f.target).nlink, 1);
        assert.equal(fs.existsSync(f.temporary), false);

        const inode = fs.statSync(f.target, { bigint: true }).ino;
        assert.deepEqual(writeOperationBoundFrozenFile({
            ...operationInput(f),
            witnessRoot: f.witness,
        }), { sha256: sha256(f.content), created: false });
        assert.equal(fs.statSync(f.target, { bigint: true }).ino, inode);
    });

    it('rejects an overlapping witness and destination before writing', () => {
        const f = fixture();
        fs.mkdirSync(path.join(f.destination, 'nested', 'nested'), { recursive: true, mode: 0o700 });
        fs.writeFileSync(path.join(f.destination, 'nested', 'effect.bin'), f.content, { mode: 0o644 });
        assert.throws(() => writeOperationBoundFrozenFile({
            ...operationInput(f),
            witnessRoot: f.destination,
        }), /must not overlap/i);
        assert.equal(fs.existsSync(f.temporary), false);
    });

    it('removes an exact partial staged temporary without promoting it', () => {
        const f = fixture();
        fs.writeFileSync(f.temporary, f.content.subarray(0, 7), { mode: 0o600 });
        fs.chmodSync(f.temporary, 0o600);
        const expected = inspectOperationBoundFrozenFile(operationInput(f));
        assert.equal(expected.state, 'staged');
        const inode = fs.statSync(f.temporary, { bigint: true }).ino;
        assert.deepEqual(repairOperationBoundFrozenFilePublication({
            ...operationInput(f), expected,
        }), { outcome: 'absent', repaired: 'staged-removed' });
        assert.equal(fs.existsSync(f.temporary), false);
        assert.equal(fs.existsSync(f.target), false);
        assert.ok(inode > 0n);
    });

    it('preserves a staged preplant with an impossible writer mode', () => {
        const f = fixture();
        fs.writeFileSync(f.temporary, f.content.subarray(0, 7), { mode: 0o640 });
        fs.chmodSync(f.temporary, 0o640);
        assert.throws(
            () => inspectOperationBoundFrozenFile(operationInput(f)),
            /not a plausible partial write/i,
        );
        assert.equal(fs.existsSync(f.temporary), true);
        assert.equal(fs.existsSync(f.target), false);
    });

    it('normalizes only an exact committed same-inode alias', () => {
        const f = fixture();
        fs.writeFileSync(f.temporary, f.content, { mode: 0o644 });
        fs.chmodSync(f.temporary, 0o644);
        fs.linkSync(f.temporary, f.target);
        const inode = fs.statSync(f.target, { bigint: true }).ino;
        const expected = inspectOperationBoundFrozenFile(operationInput(f));
        assert.equal(expected.state, 'committed');
        assert.deepEqual(repairOperationBoundFrozenFilePublication({
            ...operationInput(f), expected,
        }), { outcome: 'complete', repaired: 'committed-normalized' });
        assert.equal(fs.existsSync(f.temporary), false);
        assert.equal(fs.statSync(f.target, { bigint: true }).ino, inode);
        assert.equal(fs.statSync(f.target).nlink, 1);
        assert.deepEqual(fs.readFileSync(f.target), f.content);
    });

    it('preserves a malformed committed alias and a separate target/temporary pair', () => {
        const malformed = fixture();
        fs.writeFileSync(malformed.temporary, Buffer.alloc(malformed.content.length, 0x78), {
            mode: 0o644,
        });
        fs.linkSync(malformed.temporary, malformed.target);
        assert.throws(
            () => inspectOperationBoundFrozenFile(operationInput(malformed)),
            /does not match the exact effect entry/i,
        );
        assert.equal(fs.existsSync(malformed.temporary), true);
        assert.equal(fs.existsSync(malformed.target), true);

        const separate = fixture();
        fs.writeFileSync(separate.target, separate.content, { mode: 0o644 });
        fs.writeFileSync(separate.temporary, Buffer.from('partial'), { mode: 0o600 });
        assert.throws(
            () => inspectOperationBoundFrozenFile(operationInput(separate)),
            /publication state is ambiguous/i,
        );
        assert.equal(fs.existsSync(separate.target), true);
        assert.equal(fs.existsSync(separate.temporary), true);
    });

    it('rejects a foreign temporary before changing the expected staged file', () => {
        const f = fixture();
        fs.writeFileSync(f.temporary, Buffer.from('partial'), { mode: 0o600 });
        const foreign = `${f.target}.tmp-${process.pid}-00000000-0000-4000-8000-000000000778`;
        fs.writeFileSync(foreign, Buffer.from('foreign'), { mode: 0o600 });
        assert.throws(
            () => inspectOperationBoundFrozenFile(operationInput(f)),
            /foreign temporary/i,
        );
        assert.equal(fs.existsSync(f.temporary), true);
        assert.equal(fs.existsSync(foreign), true);
        assert.equal(fs.existsSync(f.target), false);
    });

    it('rechecks the frozen authority before staged removal', () => {
        const f = fixture();
        fs.writeFileSync(f.temporary, Buffer.from('partial'), { mode: 0o600 });
        const expected = inspectOperationBoundFrozenFile(operationInput(f));
        let calls = 0;
        const changed = Object.freeze({
            ...f.authority,
            operation_id: '00000000-0000-4000-8000-000000000779',
        });
        assert.throws(() => repairOperationBoundFrozenFilePublication({
            plan: f.plan,
            entryIndex: 0,
            expected,
            assertTargetBoundOperation: () => {
                calls += 1;
                return calls < 3 ? f.authority : changed;
            },
        }), /authority changed/i);
        assert.equal(calls, 3);
        assert.equal(fs.existsSync(f.temporary), true);
        assert.equal(fs.existsSync(f.target), false);
    });

    it('rechecks authority after writer cleanup unlink and before parent fsync', () => {
        const f = fixture();
        assertPostUnlinkAuthorityDrift(f, (assertTargetBoundOperation) =>
            writeOperationBoundFrozenFile({
                plan: f.plan,
                entryIndex: 0,
                assertTargetBoundOperation,
                witnessRoot: f.witness,
            }));
        assert.equal(fs.existsSync(f.temporary), false);
        assert.equal(inspectOperationBoundFrozenFile(operationInput(f)).state, 'complete');
        assert.deepEqual(writeOperationBoundFrozenFile({
            ...operationInput(f), witnessRoot: f.witness,
        }), { sha256: sha256(f.content), created: false });
    });

    for (const interruption of ['staged', 'committed'] as const) {
        it(`rechecks authority after ${interruption} recovery unlink and before parent fsync`, () => {
            const f = fixture();
            fs.writeFileSync(f.temporary,
                interruption === 'staged' ? Buffer.from('partial') : f.content,
                { mode: interruption === 'staged' ? 0o600 : 0o644 });
            fs.chmodSync(f.temporary, interruption === 'staged' ? 0o600 : 0o644);
            if (interruption === 'committed') fs.linkSync(f.temporary, f.target);
            const expected = inspectOperationBoundFrozenFile(operationInput(f));
            assertPostUnlinkAuthorityDrift(f, (assertTargetBoundOperation) =>
                repairOperationBoundFrozenFilePublication({
                    plan: f.plan,
                    entryIndex: 0,
                    assertTargetBoundOperation,
                    expected,
                }));
            const retry = inspectOperationBoundFrozenFile(operationInput(f));
            const outcome = interruption === 'staged' ? 'absent' : 'complete';
            assert.equal(retry.state, outcome);
            assert.equal(fs.existsSync(f.temporary), false);
            assert.equal(fs.existsSync(f.target), interruption === 'committed');
            assert.deepEqual(repairOperationBoundFrozenFilePublication({
                ...operationInput(f), expected: retry,
            }), { outcome, repaired: 'none' });
        });
    }

    it('fsyncs the parent even when recovery observes a stable outcome', () => {
        const f = fixture();
        const expected = inspectOperationBoundFrozenFile(operationInput(f));
        const mutable = createRequire(import.meta.url)('node:fs') as typeof fs;
        const original = mutable.fsyncSync;
        let directorySyncs = 0;
        mutable.fsyncSync = ((descriptor: number) => {
            if (fs.fstatSync(descriptor).isDirectory()) directorySyncs += 1;
            return original(descriptor);
        }) as typeof fs.fsyncSync;
        syncBuiltinESMExports();
        try {
            assert.deepEqual(repairOperationBoundFrozenFilePublication({
                ...operationInput(f), expected,
            }), { outcome: 'absent', repaired: 'none' });
        } finally {
            mutable.fsyncSync = original;
            syncBuiltinESMExports();
        }
        assert.ok(directorySyncs >= 1);
    });

    for (const interruption of ['staged', 'committed'] as const) {
        it(`requires a retry after ${interruption} unlink fsync failure`, () => {
            const f = fixture();
            fs.writeFileSync(f.temporary,
                interruption === 'staged' ? Buffer.from('partial') : f.content,
                { mode: interruption === 'staged' ? 0o600 : 0o644 });
            fs.chmodSync(f.temporary, interruption === 'staged' ? 0o600 : 0o644);
            if (interruption === 'committed') fs.linkSync(f.temporary, f.target);
            const expected = inspectOperationBoundFrozenFile(operationInput(f));
            const mutable = createRequire(import.meta.url)('node:fs') as typeof fs;
            const original = mutable.fsyncSync;
            let injected = false;
            mutable.fsyncSync = ((descriptor: number) => {
                if (!injected && !fs.existsSync(f.temporary)) {
                    injected = true;
                    throw new Error('injected post-unlink parent fsync failure');
                }
                return original(descriptor);
            }) as typeof fs.fsyncSync;
            syncBuiltinESMExports();
            try {
                assert.throws(() => repairOperationBoundFrozenFilePublication({
                    ...operationInput(f), expected,
                }), /injected post-unlink/i);
            } finally {
                mutable.fsyncSync = original;
                syncBuiltinESMExports();
            }
            assert.equal(injected, true);
            const retry = inspectOperationBoundFrozenFile(operationInput(f));
            const outcome = interruption === 'staged' ? 'absent' : 'complete';
            assert.equal(retry.state, outcome);
            assert.deepEqual(repairOperationBoundFrozenFilePublication({
                ...operationInput(f), expected: retry,
            }), { outcome, repaired: 'none' });
            assert.equal(fs.existsSync(f.temporary), false);
            assert.equal(fs.existsSync(f.target), interruption === 'committed');
        });
    }
});
