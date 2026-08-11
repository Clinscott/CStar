import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { FrozenCouncilPacket } from '../../../src/core/council_autoresearch/index.js';
import {
    canonicalJson,
    freezeCouncilPacket,
    sha256,
    stageFrozenPacketBundle,
} from '../../../src/core/council_autoresearch/index.js';
import {
    assertFrozenBundleEffectPlan,
    assertFrozenBundleOperationAuthority,
    buildFrozenBundleEffectPlan,
    type FrozenBundleEffectPlan,
    type FrozenBundleOperationAuthority,
} from '../../../src/core/council_autoresearch/frozen_bundle_effect_plan.js';
import { bundleFixture, cleanup, temporary } from './test_helpers.js';

let fixture: ReturnType<typeof bundleFixture>;
let packet: FrozenCouncilPacket;

before(() => {
    fixture = bundleFixture();
    packet = freezeCouncilPacket(fixture.packetInput);
});

after(cleanup);

function destination(label: string): string {
    return path.join(temporary(label), 'packet-inputs');
}

function copyWitness(label: string): string {
    const witness = path.join(temporary(label), 'bundle');
    fs.cpSync(fixture.bundle, witness, { recursive: true, preserveTimestamps: true });
    return witness;
}

function mutablePlan(plan: FrozenBundleEffectPlan): Record<string, unknown> {
    return structuredClone(plan) as unknown as Record<string, unknown>;
}

function rehash(value: Record<string, unknown>): void {
    const { bundle_plan_sha256: _claimed, ...base } = value;
    value.bundle_plan_sha256 = sha256(canonicalJson(base));
}

function freezePlan(value: Record<string, unknown>): Readonly<Record<string, unknown>> {
    const descriptor = Object.getOwnPropertyDescriptor(value, 'entries');
    if (descriptor && 'value' in descriptor && Array.isArray(descriptor.value)) {
        const entries = descriptor.value as unknown[];
        for (let index = 0; index < entries.length; index += 1) {
            const entry = Object.getOwnPropertyDescriptor(entries, String(index));
            if (entry && 'value' in entry && entry.value && typeof entry.value === 'object') {
                Object.freeze(entry.value);
            }
        }
        Object.freeze(entries);
    }
    return Object.freeze(value);
}

describe('Council autoresearch frozen bundle effect plans', () => {
    it('builds one deep-frozen exact plan without creating the destination', () => {
        const target = destination('cstar-frozen-effect-plan-');
        const first = buildFrozenBundleEffectPlan({
            packet,
            witnessRoot: fixture.bundle,
            destinationRoot: target,
        });
        const second = buildFrozenBundleEffectPlan({
            packet,
            witnessRoot: fixture.bundle,
            destinationRoot: target,
        });

        assert.deepEqual(first, second);
        assert.doesNotThrow(() => assertFrozenBundleEffectPlan(first));
        assert.equal(fs.existsSync(target), false);
        assert.equal('source_root' in first, false);
        assert.equal(first.destination_root, path.resolve(target));
        assert.equal(first.entry_count, first.entries.length);
        assert.ok(first.entry_count > 7);
        assert.equal(
            first.total_bytes,
            first.entries.reduce((total, entry) => total + entry.bytes, 0),
        );
        for (let index = 1; index < first.entries.length; index += 1) {
            assert.ok(Buffer.compare(
                Buffer.from(first.entries[index - 1].path, 'utf8'),
                Buffer.from(first.entries[index].path, 'utf8'),
            ) < 0);
        }
        const { bundle_plan_sha256: _digest, ...base } = first;
        assert.equal(first.bundle_plan_sha256, sha256(canonicalJson(base)));
        assert.equal(Object.isFrozen(first), true);
        assert.equal(Object.isFrozen(first.entries), true);
        assert.equal(first.entries.every((entry) => Object.isFrozen(entry)), true);
        assert.throws(
            () => (first.entries as Array<unknown>).push({}),
            /read only|extensible|frozen|object/i,
        );
    });

    it('treats an exact relocated source or completed destination as the same witness', () => {
        const target = destination('cstar-frozen-effect-relocated-');
        const sourcePlan = buildFrozenBundleEffectPlan({
            packet,
            witnessRoot: fixture.bundle,
            destinationRoot: target,
        });
        const relocated = copyWitness('cstar-frozen-effect-copy-');
        const copyPlan = buildFrozenBundleEffectPlan({
            packet,
            witnessRoot: relocated,
            destinationRoot: target,
        });
        assert.deepEqual(copyPlan, sourcePlan);

        stageFrozenPacketBundle({
            packet,
            sourceRoot: fixture.bundle,
            destinationRoot: target,
        });
        const durablePlan = buildFrozenBundleEffectPlan({
            packet,
            witnessRoot: target,
            destinationRoot: target,
        });
        assert.deepEqual(durablePlan, sourcePlan);

        const otherTargetPlan = buildFrozenBundleEffectPlan({
            packet,
            witnessRoot: target,
            destinationRoot: destination('cstar-frozen-effect-other-target-'),
        });
        assert.deepEqual(otherTargetPlan.entries, sourcePlan.entries);
        assert.notEqual(otherTargetPlan.bundle_plan_sha256, sourcePlan.bundle_plan_sha256);

        const otherPacket = freezeCouncilPacket({
            ...fixture.packetInput,
            seed: 'council-effect-plan-other-seed',
        });
        const otherPacketPlan = buildFrozenBundleEffectPlan({
            packet: otherPacket,
            witnessRoot: target,
            destinationRoot: target,
        });
        assert.notEqual(otherPacketPlan.packet_sha256, sourcePlan.packet_sha256);
        assert.deepEqual(otherPacketPlan.entries, sourcePlan.entries);
        assert.notEqual(otherPacketPlan.bundle_plan_sha256, sourcePlan.bundle_plan_sha256);
    });

    it('rejects noncanonical raw witness modes before creating the destination', () => {
        const witness = copyWitness('cstar-frozen-effect-mode-');
        const changed = path.join(witness, 'contract/content.txt');
        fs.chmodSync(changed, 0o4644);
        const target = destination('cstar-frozen-effect-mode-target-');
        assert.throws(
            () => buildFrozenBundleEffectPlan({
                packet,
                witnessRoot: witness,
                destinationRoot: target,
            }),
            /effect witness changed/i,
        );
        assert.equal(fs.existsSync(target), false);
    });

    it('rejects caller-owned packet mutation while witness entries are read', () => {
        const racedPacket = structuredClone(packet);
        const replacement = freezeCouncilPacket({
            ...fixture.packetInput,
            seed: 'council-effect-plan-raced-seed',
        });
        const mutable = createRequire(import.meta.url)('node:fs') as {
            readSync: typeof fs.readSync;
        };
        const original = mutable.readSync;
        let mutated = false;
        mutable.readSync = ((...args: Parameters<typeof fs.readSync>) => {
            if (!mutated) {
                mutated = true;
                Object.assign(racedPacket, structuredClone(replacement));
            }
            return original(...args);
        }) as typeof fs.readSync;
        syncBuiltinESMExports();
        try {
            assert.throws(
                () => buildFrozenBundleEffectPlan({
                    packet: racedPacket,
                    witnessRoot: fixture.bundle,
                    destinationRoot: destination('cstar-frozen-effect-race-'),
                }),
                /packet changed during planning/i,
            );
        } finally {
            mutable.readSync = original;
            syncBuiltinESMExports();
        }
        assert.equal(mutated, true);
    });

    it('fails closed for malformed plans, ordering drift, and untrusted destinations', () => {
        const plan = buildFrozenBundleEffectPlan({
            packet,
            witnessRoot: fixture.bundle,
            destinationRoot: destination('cstar-frozen-effect-validation-'),
        });

        const wrongDigest = mutablePlan(plan);
        wrongDigest.bundle_plan_sha256 = 'f'.repeat(64);
        assert.throws(
            () => assertFrozenBundleEffectPlan(freezePlan(wrongDigest)),
            /digest mismatch/i,
        );

        const wrongTotal = mutablePlan(plan);
        wrongTotal.total_bytes = Number(wrongTotal.total_bytes) + 1;
        rehash(wrongTotal);
        assert.throws(
            () => assertFrozenBundleEffectPlan(freezePlan(wrongTotal)),
            /total bytes/i,
        );

        const unsorted = mutablePlan(plan);
        const entries = unsorted.entries as Array<unknown>;
        [entries[0], entries[1]] = [entries[1], entries[0]];
        rehash(unsorted);
        assert.throws(
            () => assertFrozenBundleEffectPlan(freezePlan(unsorted)),
            /strict UTF-8 path order/i,
        );

        const excessiveNodes = mutablePlan(plan);
        excessiveNodes.entries = Array.from({ length: 2049 }, (_, index) => ({
            path: `node-${String(index).padStart(4, '0')}/file.txt`,
            sha256: 'a'.repeat(64),
            bytes: 1,
            mode: 0o644,
        }));
        excessiveNodes.entry_count = 2049;
        excessiveNodes.total_bytes = 2049;
        rehash(excessiveNodes);
        assert.throws(
            () => assertFrozenBundleEffectPlan(freezePlan(excessiveNodes)),
            /path-node resource bound/i,
        );

        const unsafeParent = temporary('cstar-frozen-effect-unsafe-');
        fs.chmodSync(unsafeParent, 0o777);
        assert.throws(
            () => buildFrozenBundleEffectPlan({
                packet,
                witnessRoot: fixture.bundle,
                destinationRoot: path.join(unsafeParent, 'packet-inputs'),
            }),
            /ancestor is renameable by another user/i,
        );
    });

    it('rejects accessor-backed plan data before reading it on every validation', () => {
        const plan = buildFrozenBundleEffectPlan({
            packet,
            witnessRoot: fixture.bundle,
            destinationRoot: destination('cstar-frozen-effect-accessor-'),
        });
        assert.throws(
            () => assertFrozenBundleEffectPlan(JSON.parse(JSON.stringify(plan))),
            /must be frozen/i,
        );

        const accessorPlan = mutablePlan(plan);
        let packetDigest = plan.packet_sha256;
        let planGetterReads = 0;
        Object.defineProperty(accessorPlan, 'packet_sha256', {
            enumerable: true,
            get: () => {
                planGetterReads += 1;
                return packetDigest;
            },
        });
        const accessorEntries = accessorPlan.entries as Array<Record<string, unknown>>;
        for (const entry of accessorEntries) Object.freeze(entry);
        Object.freeze(accessorEntries);
        Object.freeze(accessorPlan);
        assert.equal(Object.isFrozen(accessorPlan), true);
        assert.equal(accessorEntries.every((entry) => Object.isFrozen(entry)), true);
        assert.throws(
            () => assertFrozenBundleEffectPlan(accessorPlan),
            /packet_sha256.*data property/i,
        );
        packetDigest = 'f'.repeat(64);
        assert.throws(
            () => assertFrozenBundleEffectPlan(accessorPlan),
            /packet_sha256.*data property/i,
        );
        assert.equal(planGetterReads, 0);

        const indexedPlan = mutablePlan(plan);
        const indexedEntries = indexedPlan.entries as Array<Record<string, unknown>>;
        const firstEntry = indexedEntries[0];
        let indexGetterReads = 0;
        Object.defineProperty(indexedEntries, '0', {
            configurable: true,
            enumerable: true,
            get: () => {
                indexGetterReads += 1;
                return firstEntry;
            },
        });
        Object.freeze(firstEntry);
        freezePlan(indexedPlan);
        assert.throws(
            () => assertFrozenBundleEffectPlan(indexedPlan),
            /entries\[0\].*data property/i,
        );
        assert.equal(indexGetterReads, 0);

        const entryPlan = mutablePlan(plan);
        const first = (entryPlan.entries as Array<Record<string, unknown>>)[0];
        let entryGetterReads = 0;
        Object.defineProperty(first, 'sha256', {
            configurable: true,
            enumerable: true,
            get: () => {
                entryGetterReads += 1;
                return plan.entries[0].sha256;
            },
        });
        freezePlan(entryPlan);
        assert.throws(
            () => assertFrozenBundleEffectPlan(entryPlan),
            /entry 0\.sha256.*data property/i,
        );
        assert.equal(entryGetterReads, 0);

        let divergent = false;
        let proxyReads = 0;
        const proxiedPlan = new Proxy(plan, {
            get: (target, property, receiver) => {
                proxyReads += 1;
                if (divergent && property === 'bundle_plan_sha256') return 'f'.repeat(64);
                return Reflect.get(target, property, receiver);
            },
        });
        assert.equal(Object.isFrozen(proxiedPlan), true);
        assert.doesNotThrow(() => assertFrozenBundleEffectPlan(proxiedPlan));
        divergent = true;
        const proxyAuthority = Object.freeze({
            owner_pid: process.pid,
            operation_id: '00000000-0000-4000-8000-000000000124',
            bundle_plan_sha256: plan.bundle_plan_sha256,
            bundle_entry_count: plan.entry_count,
            bundle_total_bytes: plan.total_bytes,
        });
        assert.throws(
            () => assertFrozenBundleOperationAuthority(proxiedPlan, proxyAuthority),
            /proxy|read-only|non-configurable/i,
        );
        assert.ok(proxyReads > 0);
    });

    it('rechecks destination ancestry after a frozen plan was previously validated', () => {
        const parent = temporary('cstar-frozen-effect-trust-drift-');
        const plan = buildFrozenBundleEffectPlan({
            packet,
            witnessRoot: fixture.bundle,
            destinationRoot: path.join(parent, 'packet-inputs'),
        });
        assert.doesNotThrow(() => assertFrozenBundleEffectPlan(plan));
        fs.chmodSync(parent, 0o777);
        try {
            assert.throws(
                () => assertFrozenBundleEffectPlan(plan),
                /ancestor is renameable by another user/i,
            );
        } finally {
            fs.chmodSync(parent, 0o700);
        }
    });

    it('requires operation authority to bind the exact plan and resource summary', () => {
        const plan = buildFrozenBundleEffectPlan({
            packet,
            witnessRoot: fixture.bundle,
            destinationRoot: destination('cstar-frozen-effect-authority-'),
        });
        const authority: FrozenBundleOperationAuthority = Object.freeze({
            owner_pid: process.pid,
            operation_id: '00000000-0000-4000-8000-000000000123',
            bundle_plan_sha256: plan.bundle_plan_sha256,
            bundle_entry_count: plan.entry_count,
            bundle_total_bytes: plan.total_bytes,
        });
        assert.doesNotThrow(() => assertFrozenBundleOperationAuthority(plan, authority));
        assert.throws(
            () => assertFrozenBundleOperationAuthority(plan, Object.freeze({
                ...authority,
                bundle_entry_count: authority.bundle_entry_count - 1,
            })),
            /does not bind the exact effect plan/i,
        );
        assert.throws(
            () => assertFrozenBundleOperationAuthority(plan, Object.freeze({
                ...authority,
                operation_id: 'not-an-operation-id',
            })),
            /authority identity is invalid/i,
        );
        assert.throws(
            () => assertFrozenBundleOperationAuthority(plan, Object.freeze({
                ...authority,
                unexpected: true,
            })),
            /unexpected or missing fields/i,
        );
        const accessorAuthority = { ...authority } as Record<string, unknown>;
        let getterReads = 0;
        Object.defineProperty(accessorAuthority, 'operation_id', {
            enumerable: true,
            get: () => {
                getterReads += 1;
                return authority.operation_id;
            },
        });
        Object.freeze(accessorAuthority);
        assert.throws(
            () => assertFrozenBundleOperationAuthority(plan, accessorAuthority),
            /operation_id.*data property/i,
        );
        assert.equal(getterReads, 0);
    });
});
