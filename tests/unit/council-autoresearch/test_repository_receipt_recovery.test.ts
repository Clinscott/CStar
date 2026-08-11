import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { sha256 } from '../../../src/core/council_autoresearch/index.js';
import {
    recoverRepositoryReceiptAliases,
    type RepositoryReceiptRecoveryAuthority,
    type RepositoryReceiptRecoveryTarget,
} from '../../../src/core/council_autoresearch/repository_receipt_recovery.js';
import {
    atomicPrivateTemporaryPath,
    repairAtomicPrivateFilePublication,
} from '../../../src/core/council_autoresearch/repository_private_file.js';
import { cleanup, temporary } from './test_helpers.js';

afterEach(cleanup);

const operationId = '00000000-0000-4000-8000-000000000123';

type Role = 'claim' | 'body' | 'seal';
type State = 'absent' | 'staged' | 'committed' | 'complete';

interface Fixture {
    directory: string;
    targets: Record<Role, RepositoryReceiptRecoveryTarget>;
    temporary: Record<Role, string>;
    content: Record<Role, Buffer>;
    authority: RepositoryReceiptRecoveryAuthority;
}

function fixture(): Fixture {
    const directory = temporary('cstar-council-receipt-recovery-');
    const content = {
        claim: Buffer.from('{"claim":true}\n'),
        body: Buffer.from('{"body":true}\n'),
        seal: Buffer.from('{"seal":true}\n'),
    };
    const targets = Object.fromEntries(
        (['claim', 'body', 'seal'] as const).map((role) => {
            const file = path.join(directory, `${role}.json`);
            return [role, {
                file,
                directory,
                label: `test receipt ${role}`,
            }];
        }),
    ) as Record<Role, RepositoryReceiptRecoveryTarget>;
    const temporaryPaths = Object.fromEntries(
        (['claim', 'body', 'seal'] as const).map((role) => [
            role,
            atomicPrivateTemporaryPath(targets[role].file, process.pid, operationId),
        ]),
    ) as Record<Role, string>;
    return {
        directory,
        targets,
        temporary: temporaryPaths,
        content,
        authority: {
            owner_pid: process.pid,
            operation_id: operationId,
            body_sha256: sha256(content.body),
            seal_sha256: sha256(content.seal),
            claim_sha256: sha256(content.claim),
        },
    };
}

function install(f: Fixture, role: Role, state: State): void {
    if (state === 'absent') return;
    const selected = state === 'complete' ? f.targets[role].file : f.temporary[role];
    fs.writeFileSync(selected, f.content[role], { mode: 0o600 });
    fs.chmodSync(selected, 0o600);
    if (state === 'committed') fs.linkSync(selected, f.targets[role].file);
}

function stat(file: string): fs.BigIntStats | undefined {
    try {
        return fs.lstatSync(file, { bigint: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
    }
}

function snapshot(files: string[]): Array<{
    file: string;
    content?: Buffer;
    stat?: fs.BigIntStats;
}> {
    return files.map((file) => ({
        file,
        content: stat(file) === undefined ? undefined : fs.readFileSync(file),
        stat: stat(file),
    }));
}

function assertSnapshot(expected: ReturnType<typeof snapshot>): void {
    for (const item of expected) {
        const actual = stat(item.file);
        assert.equal(actual === undefined, item.stat === undefined, item.file);
        if (item.stat === undefined || actual === undefined) continue;
        assert.deepEqual(fs.readFileSync(item.file), item.content, item.file);
        for (const key of [
            'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
        ] as const) assert.equal(actual[key], item.stat[key], `${item.file}:${key}`);
    }
}

function recover(f: Fixture, observe = () => undefined, includeClaim = true) {
    return recoverRepositoryReceiptAliases({
        ...(includeClaim ? { claim: f.targets.claim } : {}),
        body: f.targets.body,
        seal: f.targets.seal,
        assertDeadTargetBoundOperation: () => {
            observe();
            return includeClaim
                ? f.authority
                : Object.fromEntries(Object.entries(f.authority).filter(
                    ([key]) => key !== 'claim_sha256',
                )) as unknown as RepositoryReceiptRecoveryAuthority;
        },
    });
}

describe('Council autoresearch operation-bound receipt alias recovery', () => {
    for (const scenario of [
        { role: 'body', state: 'staged', before: {}, outcome: 'absent' },
        { role: 'body', state: 'committed', before: {}, outcome: 'body-only' },
        { role: 'claim', state: 'staged', before: { body: 'complete' }, outcome: 'body-only' },
        {
            role: 'claim', state: 'committed',
            before: { body: 'complete' }, outcome: 'body-with-claim',
        },
        {
            role: 'seal', state: 'staged',
            before: { body: 'complete', claim: 'complete' }, outcome: 'body-with-claim',
        },
        {
            role: 'seal', state: 'committed',
            before: { body: 'complete', claim: 'complete' }, outcome: 'sealed',
        },
    ] as const) {
        it(`normalizes an exact ${scenario.state} ${scenario.role} publication`, () => {
            const f = fixture();
            for (const [role, state] of Object.entries(scenario.before)) {
                install(f, role as Role, state as State);
            }
            install(f, scenario.role, scenario.state);
            const targetBefore = stat(f.targets[scenario.role].file);
            const namespaceBefore = snapshot(
                fs.readdirSync(f.directory).map((name) => path.join(f.directory, name)),
            );
            let assertions = 0;
            const result = recover(f, () => { assertions += 1; });
            assert.deepEqual(result, { outcome: scenario.outcome, repaired: [scenario.role] });
            assert.ok(assertions >= 4);
            assert.equal(fs.existsSync(f.temporary[scenario.role]), false);
            if (scenario.state === 'staged') {
                assert.equal(fs.existsSync(f.targets[scenario.role].file), false);
            } else {
                const targetAfter = fs.lstatSync(f.targets[scenario.role].file, { bigint: true });
                assert.equal(targetAfter.ino, targetBefore?.ino);
                assert.equal(targetAfter.dev, targetBefore?.dev);
                assert.equal(targetAfter.nlink, 1n);
                assert.deepEqual(fs.readFileSync(f.targets[scenario.role].file), f.content[scenario.role]);
            }
            for (const prior of namespaceBefore) {
                if (prior.file !== f.temporary[scenario.role]
                    && prior.file !== f.targets[scenario.role].file) {
                    assertSnapshot([prior]);
                }
            }
        });
    }

    for (const scenario of [
        { name: 'wrong-digest', error: /operation-bound digest/i },
        { name: 'foreign-temporary', error: /foreign temporary/i },
        { name: 'claim-without-body', error: /claim crossed an incomplete body/i },
        { name: 'seal-without-claim', error: /seal crossed an incomplete prerequisite/i },
        { name: 'ambiguous-mode', error: /publication state is ambiguous/i },
    ] as const) {
        it(`fails closed for ${scenario.name.replaceAll('-', ' ')}`, () => {
            const f = fixture();
            if (scenario.name === 'wrong-digest') {
                install(f, 'body', 'complete');
                f.authority = { ...f.authority, body_sha256: 'f'.repeat(64) };
            } else if (scenario.name === 'foreign-temporary') {
                fs.writeFileSync(
                    `${f.targets.body.file}.tmp-${process.pid}-00000000-0000-4000-8000-000000000999`,
                    f.content.body,
                    { mode: 0o600 },
                );
            } else if (scenario.name === 'claim-without-body') {
                install(f, 'claim', 'complete');
            } else if (scenario.name === 'seal-without-claim') {
                install(f, 'body', 'complete');
                install(f, 'seal', 'complete');
            } else {
                install(f, 'body', 'complete');
                fs.chmodSync(f.targets.body.file, 0o644);
            }
            const files = fs.readdirSync(f.directory).map((name) => path.join(f.directory, name));
            const before = snapshot(files);
            assert.throws(
                () => recover(f),
                scenario.error,
            );
            assertSnapshot(before);
            assert.deepEqual(
                fs.readdirSync(f.directory).map((name) => path.join(f.directory, name)).sort(),
                files.sort(),
            );
        });
    }

    it('rechecks the exact dead operation before unlinking an alias', () => {
        const f = fixture();
        install(f, 'body', 'committed');
        const files = [
            f.targets.body.file, f.temporary.body,
        ];
        const before = snapshot(files);
        let assertions = 0;
        assert.throws(() => recover(f, () => {
            assertions += 1;
            if (assertions === 3) {
                f.authority.body_sha256 = 'a'.repeat(64);
            }
        }), /operation authority changed/i);
        assert.equal(assertions, 3);
        assertSnapshot(before);
    });

    it('supports body and seal recovery without an experiment claim', () => {
        const f = fixture();
        install(f, 'body', 'complete');
        install(f, 'seal', 'committed');
        const sealInode = fs.lstatSync(f.targets.seal.file, { bigint: true }).ino;
        assert.deepEqual(recover(f, () => undefined, false), {
            outcome: 'sealed', repaired: ['seal'],
        });
        assert.equal(fs.lstatSync(f.targets.seal.file, { bigint: true }).ino, sealInode);
        assert.equal(fs.lstatSync(f.targets.seal.file).nlink, 1);
    });

    it('normalizes a claim in a separate private directory', () => {
        const f = fixture();
        const claimDirectory = temporary('cstar-council-experiment-recovery-');
        f.targets.claim = {
            ...f.targets.claim,
            directory: claimDirectory,
            file: path.join(claimDirectory, 'experiment.json'),
        };
        f.temporary.claim = atomicPrivateTemporaryPath(
            f.targets.claim.file,
            process.pid,
            operationId,
        );
        install(f, 'body', 'complete');
        install(f, 'claim', 'committed');
        assert.deepEqual(recover(f), {
            outcome: 'body-with-claim', repaired: ['claim'],
        });
        assert.equal(fs.existsSync(f.temporary.claim), false);
        assert.deepEqual(fs.readFileSync(f.targets.claim.file), f.content.claim);
    });

    for (const scenario of [
        { name: 'absent', states: {}, outcome: 'absent', claim: false },
        { name: 'body-only', states: { body: 'complete' }, outcome: 'body-only', claim: false },
        {
            name: 'body-with-claim', states: { body: 'complete', claim: 'complete' },
            outcome: 'body-with-claim', claim: true,
        },
        {
            name: 'sealed',
            states: { body: 'complete', claim: 'complete', seal: 'complete' },
            outcome: 'sealed', claim: true,
        },
    ] as const) {
        it(`preserves a stable ${scenario.name} namespace exactly`, () => {
            const f = fixture();
            for (const [role, state] of Object.entries(scenario.states)) {
                install(f, role as Role, state as State);
            }
            const files = fs.readdirSync(f.directory).map((name) => path.join(f.directory, name));
            const before = snapshot(files);
            assert.deepEqual(recover(f, () => undefined, scenario.claim), {
                outcome: scenario.outcome,
                repaired: [],
            });
            assertSnapshot(before);
            assert.deepEqual(
                fs.readdirSync(f.directory).map((name) => path.join(f.directory, name)).sort(),
                files.sort(),
            );
        });
    }

    it('rejects a cross-role target and derived-temporary collision without mutation', () => {
        const f = fixture();
        f.targets.claim = {
            ...f.targets.claim,
            file: f.temporary.body,
        };
        const before = snapshot([]);
        assert.throws(() => recover(f), /target and temporary paths must be distinct/i);
        assertSnapshot(before);
        assert.deepEqual(fs.readdirSync(f.directory), []);
    });

    it('rejects an expected alias replaced by a same-byte complete inode', () => {
        const f = fixture();
        install(f, 'body', 'committed');
        const expected = {
            content: Buffer.from(f.content.body),
            stat: fs.lstatSync(f.targets.body.file, { bigint: true }),
        };
        fs.unlinkSync(f.targets.body.file);
        fs.unlinkSync(f.temporary.body);
        fs.writeFileSync(f.targets.body.file, f.content.body, { mode: 0o600 });
        assert.throws(() => repairAtomicPrivateFilePublication({
            file: f.targets.body.file,
            temporary: f.temporary.body,
            commonDirectory: f.directory,
            label: 'test receipt body',
            expected,
        }), /publication changed before recovery/i);
    });

    it('rejects an expected staged inode that disappears before repair', () => {
        const f = fixture();
        install(f, 'body', 'staged');
        const expected = {
            content: Buffer.from(f.content.body),
            stat: fs.lstatSync(f.temporary.body, { bigint: true }),
        };
        fs.unlinkSync(f.temporary.body);
        assert.throws(() => repairAtomicPrivateFilePublication({
            file: f.targets.body.file,
            temporary: f.temporary.body,
            commonDirectory: f.directory,
            label: 'test receipt body',
            expected,
        }), /publication changed before recovery/i);
    });

    it('re-fsyncs a stable target directory after an interrupted unlink sync', () => {
        const f = fixture();
        install(f, 'body', 'committed');
        const mutable = createRequire(import.meta.url)('node:fs') as {
            fsyncSync: typeof fs.fsyncSync;
        };
        const original = mutable.fsyncSync;
        let injected = false;
        let retrying = false;
        let retrySyncs = 0;
        mutable.fsyncSync = ((descriptor) => {
            if (!injected && !fs.existsSync(f.temporary.body)) {
                injected = true;
                throw new Error('injected directory fsync failure');
            }
            if (retrying) retrySyncs += 1;
            return original(descriptor);
        }) as typeof fs.fsyncSync;
        syncBuiltinESMExports();
        try {
            assert.throws(
                () => recover(f, () => undefined, false),
                /durability is uncertain after unlink/i,
            );
            retrying = true;
            assert.deepEqual(recover(f, () => undefined, false), {
                outcome: 'body-only', repaired: [],
            });
        } finally {
            mutable.fsyncSync = original;
            syncBuiltinESMExports();
        }
        assert.equal(injected, true);
        assert.ok(retrySyncs >= 1);
        assert.equal(fs.existsSync(f.temporary.body), false);
    });
});
