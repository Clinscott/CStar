import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { canonicalJson, sha256, type FrozenCouncilPacket } from
    '../../../src/core/council_autoresearch/contracts.js';
import {
    buildFrozenBundleEffectPlan,
    type FrozenBundleEffectPlan,
    type FrozenBundleOperationAuthority,
} from '../../../src/core/council_autoresearch/frozen_bundle_effect_plan.js';
import {
    inspectFrozenBundleOperation,
    prepareFrozenBundleOperation,
    recoverFrozenBundleOperation,
    writeFrozenBundleOperation,
} from '../../../src/core/council_autoresearch/frozen_bundle_operation.js';
import { freezeCouncilPacket } from '../../../src/core/council_autoresearch/packet.js';
import { atomicPrivateTemporaryPath } from
    '../../../src/core/council_autoresearch/repository_private_file.js';
import { bundleFixture, cleanup, temporary } from './test_helpers.js';

const operationId = '00000000-0000-4000-8000-000000000888';
let source: ReturnType<typeof bundleFixture>;
let packet: FrozenCouncilPacket;

interface OperationFixture {
    witness: string;
    destination: string;
    plan: FrozenBundleEffectPlan;
    authority: FrozenBundleOperationAuthority;
}

before(() => {
    source = bundleFixture();
    packet = freezeCouncilPacket(source.packetInput);
});

after(cleanup);

function operationFixture(label: string, prepare = true): OperationFixture {
    const destination = path.join(temporary(label), 'packet-inputs');
    const plan = buildFrozenBundleEffectPlan({
        packet,
        witnessRoot: source.bundle,
        destinationRoot: destination,
    });
    const authority = Object.freeze({
        owner_pid: process.pid,
        operation_id: operationId,
        bundle_plan_sha256: plan.bundle_plan_sha256,
        bundle_entry_count: plan.entry_count,
        bundle_total_bytes: plan.total_bytes,
    });
    const fixture = { witness: source.bundle, destination, plan, authority };
    if (prepare) prepareFrozenBundleOperation({ plan, witnessRoot: source.bundle });
    return fixture;
}

function bound(fixture: OperationFixture): () => FrozenBundleOperationAuthority {
    return () => fixture.authority;
}

function target(fixture: OperationFixture, index: number): string {
    return path.join(fixture.destination, fixture.plan.entries[index].path);
}

function temporaryTarget(fixture: OperationFixture, index: number): string {
    return atomicPrivateTemporaryPath(target(fixture, index), process.pid, operationId);
}

function witnessContent(fixture: OperationFixture, index: number): Buffer {
    return fs.readFileSync(path.join(fixture.witness, fixture.plan.entries[index].path));
}

function installComplete(fixture: OperationFixture, index: number): void {
    const entry = fixture.plan.entries[index];
    fs.writeFileSync(target(fixture, index), witnessContent(fixture, index), { mode: entry.mode });
    fs.chmodSync(target(fixture, index), entry.mode);
}

function installStaged(fixture: OperationFixture, index: number): void {
    const content = witnessContent(fixture, index);
    fs.writeFileSync(
        temporaryTarget(fixture, index),
        content.subarray(0, Math.max(1, Math.floor(content.length / 2))),
        { mode: 0o600 },
    );
    fs.chmodSync(temporaryTarget(fixture, index), 0o600);
}

function installCommitted(fixture: OperationFixture, index: number): void {
    const entry = fixture.plan.entries[index];
    fs.writeFileSync(temporaryTarget(fixture, index), witnessContent(fixture, index), {
        mode: entry.mode,
    });
    fs.chmodSync(temporaryTarget(fixture, index), entry.mode);
    fs.linkSync(temporaryTarget(fixture, index), target(fixture, index));
}

function operationInput(fixture: OperationFixture) {
    return { plan: fixture.plan, assertTargetBoundOperation: bound(fixture) };
}

function filesBelow(root: string): string[] {
    const files: string[] = [];
    const walk = (directory: string): void => {
        for (const name of fs.readdirSync(directory)) {
            const child = path.join(directory, name);
            if (fs.lstatSync(child).isDirectory()) walk(child);
            else files.push(path.relative(root, child));
        }
    };
    walk(root);
    return files.sort();
}

describe('bundle-wide operation-bound frozen publication', () => {
    it('prepares only the deterministic private empty tree and rejects overlap or preplants', () => {
        const fixture = operationFixture('cstar-bundle-operation-prepare-', false);
        assert.equal(fs.existsSync(fixture.destination), false);
        prepareFrozenBundleOperation({ plan: fixture.plan, witnessRoot: fixture.witness });
        assert.deepEqual(filesBelow(fixture.destination), []);
        const directories = [fixture.destination];
        for (const entry of fixture.plan.entries) {
            let directory = path.dirname(target(fixture, fixture.plan.entries.indexOf(entry)));
            while (directory !== fixture.destination) {
                directories.push(directory);
                directory = path.dirname(directory);
            }
        }
        for (const directory of new Set(directories)) {
            assert.equal(fs.statSync(directory).mode & 0o7777, 0o700);
        }
        assert.doesNotThrow(() => prepareFrozenBundleOperation({
            plan: fixture.plan,
            witnessRoot: fixture.witness,
        }));

        const planted = operationFixture('cstar-bundle-operation-preplant-', false);
        fs.mkdirSync(planted.destination, { mode: 0o700 });
        fs.writeFileSync(path.join(planted.destination, 'preplant'), 'untrusted');
        assert.throws(
            () => prepareFrozenBundleOperation({ plan: planted.plan, witnessRoot: planted.witness }),
            /not empty/i,
        );
        assert.deepEqual(fs.readdirSync(planted.destination), ['preplant']);

        const overlapPlan = buildFrozenBundleEffectPlan({
            packet,
            witnessRoot: source.bundle,
            destinationRoot: source.bundle,
        });
        assert.throws(
            () => prepareFrozenBundleOperation({ plan: overlapPlan, witnessRoot: source.bundle }),
            /must not overlap/i,
        );
        assert.throws(() => writeFrozenBundleOperation({
            ...operationInput(fixture), packet, witnessRoot: fixture.destination,
        }), /must not overlap/i);
        assert.deepEqual(filesBelow(fixture.destination), []);

        const retry = operationFixture('cstar-bundle-operation-prepare-fsync-', false);
        const mutable = createRequire(import.meta.url)('node:fs') as typeof fs;
        const original = mutable.fsyncSync;
        let injected = false;
        mutable.fsyncSync = ((descriptor: number) => {
            if (!injected && fs.fstatSync(descriptor).isDirectory()) {
                injected = true;
                throw new Error('injected preparation directory fsync failure');
            }
            return original(descriptor);
        }) as typeof fs.fsyncSync;
        syncBuiltinESMExports();
        try {
            assert.throws(() => prepareFrozenBundleOperation({
                plan: retry.plan, witnessRoot: retry.witness,
            }), /injected preparation directory fsync failure/i);
        } finally {
            mutable.fsyncSync = original;
            syncBuiltinESMExports();
        }
        assert.equal(injected, true);
        assert.doesNotThrow(() => prepareFrozenBundleOperation({
            plan: retry.plan, witnessRoot: retry.witness,
        }));
        assert.deepEqual(filesBelow(retry.destination), []);
    });

    it('rejects extras, foreign temporaries, symlinks, and special files', () => {
        const cases: Array<[string, (fixture: OperationFixture) => void, RegExp]> = [
            ['extra', (fixture) => {
                fs.writeFileSync(path.join(fixture.destination, 'extra'), 'x');
            }, /unexpected file/i],
            ['foreign', (fixture) => {
                fs.writeFileSync(
                    `${target(fixture, 0)}.tmp-${process.pid}-00000000-0000-4000-8000-000000000889`,
                    'x',
                    { mode: 0o600 },
                );
            }, /unexpected file/i],
            ['symlink', (fixture) => {
                fs.symlinkSync(fixture.witness, path.join(fixture.destination, 'redirect'));
            }, /symbolic link/i],
            ['special', (fixture) => {
                execFileSync('mkfifo', [path.join(fixture.destination, 'pipe')]);
            }, /special file/i],
        ];
        for (const [label, plant, expected] of cases) {
            const fixture = operationFixture(`cstar-bundle-operation-${label}-`);
            plant(fixture);
            assert.throws(() => inspectFrozenBundleOperation(operationInput(fixture)), expected);
        }
    });

    it('bounds the exact inventory before interpreting an overfull namespace', () => {
        const witness = temporary('cstar-bundle-operation-bound-witness-');
        const destination = path.join(temporary('cstar-bundle-operation-bound-target-'), 'frozen');
        const content = Buffer.from('bounded\n');
        fs.writeFileSync(path.join(witness, 'effect'), content, { mode: 0o644 });
        const entries = Object.freeze([Object.freeze({
            path: 'effect', sha256: sha256(content), bytes: content.length, mode: 0o644 as const,
        })]);
        const base = {
            packet_sha256: packet.packet_sha256,
            destination_root: destination,
            entry_count: 1,
            total_bytes: content.length,
            entries,
        };
        const plan = Object.freeze({
            ...base,
            bundle_plan_sha256: sha256(canonicalJson(base)),
        });
        const authority = Object.freeze({
            owner_pid: process.pid,
            operation_id: operationId,
            bundle_plan_sha256: plan.bundle_plan_sha256,
            bundle_entry_count: 1,
            bundle_total_bytes: content.length,
        });
        const fixture = { witness, destination, plan, authority };
        prepareFrozenBundleOperation({ plan, witnessRoot: witness });
        fs.writeFileSync(target(fixture, 0), content, { mode: 0o644 });
        fs.writeFileSync(temporaryTarget(fixture, 0), 'partial', { mode: 0o600 });
        fs.writeFileSync(path.join(destination, 'third'), 'excess');
        assert.throws(
            () => inspectFrozenBundleOperation(operationInput(fixture)),
            /exceeds 2 path nodes/i,
        );
    });

    it('accepts only a complete prefix, one interruption, and an absent suffix', () => {
        const gap = operationFixture('cstar-bundle-operation-gap-');
        installComplete(gap, 1);
        assert.throws(
            () => inspectFrozenBundleOperation(operationInput(gap)),
            /not a complete prefix/i,
        );

        const multiple = operationFixture('cstar-bundle-operation-multiple-');
        installStaged(multiple, 0);
        installStaged(multiple, 1);
        assert.throws(
            () => inspectFrozenBundleOperation(operationInput(multiple)),
            /multiple or out-of-order interrupted/i,
        );

        const allBeforeRepair = operationFixture('cstar-bundle-operation-snapshot-all-');
        installStaged(allBeforeRepair, 0);
        const last = allBeforeRepair.plan.entries.length - 1;
        fs.writeFileSync(target(allBeforeRepair, last), Buffer.alloc(
            allBeforeRepair.plan.entries[last].bytes,
            0x78,
        ), { mode: allBeforeRepair.plan.entries[last].mode });
        const stagedBytes = fs.readFileSync(temporaryTarget(allBeforeRepair, 0));
        assert.throws(() => recoverFrozenBundleOperation({
            ...operationInput(allBeforeRepair), packet,
        }), /does not match the exact effect entry/i);
        assert.deepEqual(fs.readFileSync(temporaryTarget(allBeforeRepair, 0)), stagedBytes);
        assert.equal(fs.existsSync(target(allBeforeRepair, 0)), false);
    });

    it('recovers staged and committed files without inventing an absent suffix', () => {
        const empty = operationFixture('cstar-bundle-operation-empty-recovery-');
        const emptyRecovery = recoverFrozenBundleOperation({ ...operationInput(empty), packet });
        assert.equal(emptyRecovery.inspection.state, 'absent');
        assert.deepEqual(emptyRecovery.repaired, []);
        assert.deepEqual(filesBelow(empty.destination), []);

        const staged = operationFixture('cstar-bundle-operation-staged-recovery-');
        installComplete(staged, 0);
        installStaged(staged, 1);
        const stagedRecovery = recoverFrozenBundleOperation({ ...operationInput(staged), packet });
        assert.deepEqual(stagedRecovery.repaired, [{
            entry_index: 1, repair: 'staged-removed',
        }]);
        assert.equal(stagedRecovery.inspection.first_incomplete_index, 1);
        assert.equal(fs.existsSync(temporaryTarget(staged, 1)), false);
        assert.equal(fs.existsSync(target(staged, 1)), false);

        const committed = operationFixture('cstar-bundle-operation-committed-recovery-');
        installComplete(committed, 0);
        installCommitted(committed, 1);
        const committedRecovery = recoverFrozenBundleOperation({
            ...operationInput(committed), packet,
        });
        assert.deepEqual(committedRecovery.repaired, [{
            entry_index: 1, repair: 'committed-normalized',
        }]);
        assert.equal(committedRecovery.inspection.first_incomplete_index, 2);
        assert.equal(fs.existsSync(temporaryTarget(committed, 1)), false);
        assert.equal(fs.existsSync(target(committed, 1)), true);
        assert.equal(fs.statSync(target(committed, 1)).nlink, 1);

        const finishing = operationFixture('cstar-bundle-operation-finish-recovery-');
        const last = finishing.plan.entry_count - 1;
        for (let index = 0; index < last; index += 1) installComplete(finishing, index);
        installCommitted(finishing, last);
        const finished = recoverFrozenBundleOperation({ ...operationInput(finishing), packet });
        assert.equal(finished.inspection.state, 'complete');
        assert.deepEqual(finished.repaired, [{
            entry_index: last, repair: 'committed-normalized',
        }]);
    });

    it('replays a stable prefix to a complete offline-proved bundle', () => {
        const fixture = operationFixture('cstar-bundle-operation-write-');
        installComplete(fixture, 0);
        installComplete(fixture, 1);
        const written = writeFrozenBundleOperation({
            ...operationInput(fixture), packet, witnessRoot: fixture.witness,
        });
        assert.equal(written.inspection.state, 'complete');
        assert.equal(written.created, fixture.plan.entry_count - 2);
        assert.equal(written.replayed, 2);
        const lostWitness = path.join(temporary('cstar-bundle-operation-lost-witness-'), 'gone');
        const replayed = writeFrozenBundleOperation({
            ...operationInput(fixture), packet, witnessRoot: lostWitness,
        });
        assert.equal(replayed.created, 0);
        assert.equal(replayed.replayed, fixture.plan.entry_count);
        assert.equal(replayed.inspection.first_incomplete_index, fixture.plan.entry_count);
    });

    it('observes authority drift before recovery mutation', () => {
        const fixture = operationFixture('cstar-bundle-operation-authority-drift-');
        installStaged(fixture, 0);
        const staged = temporaryTarget(fixture, 0);
        const before = fs.lstatSync(staged, { bigint: true });
        const bytes = fs.readFileSync(staged);
        const changed = Object.freeze({
            ...fixture.authority,
            operation_id: '00000000-0000-4000-8000-000000000890',
        });
        const mutable = createRequire(import.meta.url)('node:fs') as typeof fs;
        const original = mutable.openSync;
        let stagedOpens = 0;
        let armed = false;
        mutable.openSync = ((...args: Parameters<typeof fs.openSync>) => {
            const descriptor = original(...args);
            if (path.resolve(String(args[0])) === staged) {
                stagedOpens += 1;
                if (stagedOpens === 5) armed = true;
            }
            return descriptor;
        }) as typeof fs.openSync;
        syncBuiltinESMExports();
        try {
            assert.throws(() => recoverFrozenBundleOperation({
                plan: fixture.plan,
                packet,
                assertTargetBoundOperation: () => armed ? changed : fixture.authority,
            }), /authority changed/i);
        } finally {
            mutable.openSync = original;
            syncBuiltinESMExports();
        }
        assert.equal(armed, true);
        assert.equal(stagedOpens, 5);
        const after = fs.lstatSync(staged, { bigint: true });
        assert.equal(after.ino, before.ino);
        assert.equal(after.mtimeNs, before.mtimeNs);
        assert.deepEqual(fs.readFileSync(staged), bytes);
        assert.equal(fs.existsSync(target(fixture, 0)), false);
    });

    it('retries parent fsync after committed normalization durability failure', () => {
        const fixture = operationFixture('cstar-bundle-operation-fsync-retry-');
        installCommitted(fixture, 0);
        const temporary = temporaryTarget(fixture, 0);
        const mutable = createRequire(import.meta.url)('node:fs') as typeof fs;
        const original = mutable.fsyncSync;
        const retryParent = fs.statSync(path.dirname(target(fixture, 0)), { bigint: true });
        let injected = false;
        let retrying = false;
        let retryTargetParentSyncs = 0;
        mutable.fsyncSync = ((descriptor: number) => {
            if (!injected && !fs.existsSync(temporary)) {
                injected = true;
                throw new Error('injected bundle parent fsync failure');
            }
            const stat = fs.fstatSync(descriptor, { bigint: true });
            if (retrying && stat.isDirectory()
                && stat.dev === retryParent.dev && stat.ino === retryParent.ino) {
                retryTargetParentSyncs += 1;
            }
            return original(descriptor);
        }) as typeof fs.fsyncSync;
        syncBuiltinESMExports();
        try {
            assert.throws(() => recoverFrozenBundleOperation({
                ...operationInput(fixture), packet,
            }), /injected bundle parent fsync failure/i);
            assert.equal(fs.existsSync(temporary), false);
            assert.equal(fs.existsSync(target(fixture, 0)), true);
            retrying = true;
            const retried = recoverFrozenBundleOperation({ ...operationInput(fixture), packet });
            assert.equal(retried.inspection.first_incomplete_index, 1);
            assert.deepEqual(retried.repaired, []);
        } finally {
            mutable.fsyncSync = original;
            syncBuiltinESMExports();
        }
        assert.equal(injected, true);
        assert.ok(retryTargetParentSyncs > 0);
    });
});
