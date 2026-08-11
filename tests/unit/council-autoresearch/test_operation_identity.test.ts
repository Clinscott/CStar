import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    assertRepositoryOperationOwner,
    currentOperationOwner,
    operationOwnerDefinitelyDead,
} from '../../../src/core/council_autoresearch/index.js';

function differentDigest(value: string): string {
    return `${value[0] === '0' ? '1' : '0'}${value.slice(1)}`;
}

describe('Council autoresearch Linux operation identity', () => {
    it('binds the exact current host, boot, PID namespace, and process start', () => {
        const previousTitle = process.title;
        try {
            process.title = 'cstar (identity)';
            const owner = currentOperationOwner();
            assert.deepEqual(Object.keys(owner).sort(), [
                'boot_id_sha256', 'hostname', 'machine_id_sha256', 'pid',
                'pid_namespace_sha256', 'process_start_ticks',
            ]);
            assert.ok(Number.isSafeInteger(owner.pid) && owner.pid > 0);
            assert.match(owner.machine_id_sha256, /^[a-f0-9]{64}$/);
            assert.match(owner.boot_id_sha256, /^[a-f0-9]{64}$/);
            assert.match(owner.pid_namespace_sha256, /^[a-f0-9]{64}$/);
            assert.match(owner.process_start_ticks, /^[1-9][0-9]*$/);
            assert.doesNotThrow(() => assertRepositoryOperationOwner(owner));
            assert.equal(operationOwnerDefinitelyDead(owner), false);
        } finally {
            process.title = previousTitle;
        }
    });

    it('classifies absent, reused, and prior-boot owners as definitely dead', () => {
        const owner = currentOperationOwner();
        assert.equal(operationOwnerDefinitelyDead({
            ...owner,
            process_start_ticks: (BigInt(owner.process_start_ticks) + 1n).toString(),
        }), true);
        assert.equal(operationOwnerDefinitelyDead({ ...owner, pid: 2_147_483_647 }), true);
        assert.equal(operationOwnerDefinitelyDead({
            ...owner,
            boot_id_sha256: differentDigest(owner.boot_id_sha256),
        }), true);
    });

    it('fails closed for cross-host, cross-session, and malformed identities', () => {
        const owner = currentOperationOwner();
        assert.throws(() => operationOwnerDefinitelyDead({
            ...owner, hostname: `${owner.hostname}-other`,
        }), /cross-host/i);
        assert.throws(() => operationOwnerDefinitelyDead({
            ...owner, machine_id_sha256: differentDigest(owner.machine_id_sha256),
        }), /cross-host/i);
        assert.throws(() => operationOwnerDefinitelyDead({
            ...owner, pid_namespace_sha256: differentDigest(owner.pid_namespace_sha256),
        }), /cross-session/i);
        assert.throws(
            () => assertRepositoryOperationOwner({ ...owner, extra: true }),
            /unexpected or missing fields/i,
        );
        assert.throws(
            () => assertRepositoryOperationOwner({ ...owner, process_start_ticks: '01' }),
            /invalid/i,
        );
        assert.throws(
            () => assertRepositoryOperationOwner({
                ...owner, boot_id_sha256: `A${owner.boot_id_sha256.slice(1)}`,
            }),
            /lowercase SHA-256/i,
        );
    });
});
