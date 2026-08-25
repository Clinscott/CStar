import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    computeNativeSwarmPacketSha256,
    NATIVE_SWARM_CONNECTION_ID,
    NATIVE_SWARM_PACKET_SCHEMA,
    validateNativeSwarmPacket,
} from '../../../.agents/skills/corvus-forge/scripts/validate_native_swarm_packet.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SCRIPT = path.join(ROOT,
    '.agents/skills/corvus-forge/scripts/validate_native_swarm_packet.mjs');
const temporaryRoots = [];

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-native-packet-'));
    temporaryRoots.push(root);
    for (const directory of ['src/a', 'src/b', 'tests', 'evidence']) {
        fs.mkdirSync(path.join(root, directory), { recursive: true });
    }
    const packet = {
        schema: NATIVE_SWARM_PACKET_SCHEMA,
        connection_id: NATIVE_SWARM_CONNECTION_ID,
        run_id: 'forge-run:packet-fixture',
        request_id: 'request-packet-fixture',
        decision_id: 'CSF-D008-R6',
        delta_set_id: 'CSF-D008-FNS-SET-02-DELTA-04',
        coordinator_task_id: 'coordinator-packet-fixture',
        source_identity: { repository: root, head: 'a'.repeat(40) },
        execution_root: root,
        evidence_root: path.join(root, 'evidence'),
        topology: {
            direct_workers: 2,
            nested_parent: false,
            descendants: 0,
            peer_messages: 0,
        },
        work_items: [
            {
                ordinal: 1,
                work_item_id: 'packet-worker-a',
                host_attempt_id: 'host-attempt:packet-worker-a-01',
                idempotency_key: 'packet-worker-a-key',
                objective: 'Write the first isolated output.',
                write_paths: [path.join(root, 'src/a')],
                test_paths: [path.join(root, 'tests/a.test.ts')],
                output_paths: [path.join(root, 'src/a/result.ts')],
                requested_identity: { model: 'gpt-5.6-sol', reasoning: 'max' },
                actual_identity: 'unreported',
                actual_identity_attested: false,
                expected_ms: 1_800_000,
                hard_lease_ms: 3_600_000,
                attempts: 1,
                retry_budget: 0,
                replay_budget: 0,
                replacement_budget: 0,
                fallback_budget: 0,
            },
            {
                ordinal: 2,
                work_item_id: 'packet-worker-b',
                host_attempt_id: 'host-attempt:packet-worker-b-01',
                idempotency_key: 'packet-worker-b-key',
                objective: 'Write the second isolated output.',
                write_paths: [path.join(root, 'src/b')],
                test_paths: [path.join(root, 'tests/b.test.ts')],
                output_paths: [path.join(root, 'src/b/result.ts')],
                requested_identity: { model: 'host-selected-terra', reasoning: 'high' },
                actual_identity: 'unreported',
                actual_identity_attested: false,
                expected_ms: 1_000,
                hard_lease_ms: 2_000,
                attempts: 1,
                retry_budget: 0,
                replay_budget: 0,
                replacement_budget: 0,
                fallback_budget: 0,
            },
        ],
        aggregator: {
            logical_item_id: 'packet-aggregator',
            host_attempt_id: 'host-attempt:packet-aggregator-01',
            requested_identity: { model: 'gpt-5.6-sol', reasoning: 'max' },
            actual_identity: 'unreported',
            actual_identity_attested: false,
            expected_ms: 300_000,
            hard_lease_ms: 900_000,
            read_only: true,
            source_writes: 0,
            descendants: 0,
            peer_messages: 0,
        },
        expected_outputs: [
            path.join(root, 'src/a/result.ts'), path.join(root, 'src/b/result.ts'),
        ],
        effect_exclusions: ['network', 'git', 'install'],
        canonical_inputs_sha256: 'b'.repeat(64),
        packet_sha256: '',
    };
    packet.packet_sha256 = computeNativeSwarmPacketSha256(packet);
    return { root, packet };
}

afterEach(() => {
    while (temporaryRoots.length) fs.rmSync(temporaryRoots.pop(), { recursive: true, force: true });
});

describe('native swarm host packet validator', () => {
    it('accepts selector-neutral immutable inputs and canonicalizes unordered arrays', () => {
        const { packet } = fixture();
        const validated = validateNativeSwarmPacket(packet);
        assert.equal(validated.packet_sha256, packet.packet_sha256);
        assert.deepEqual(validated.work_items.map((item) => item.requested_identity.model),
            ['gpt-5.6-sol', 'host-selected-terra']);
        assert.equal(validated.work_items.every((item) => item.actual_identity === 'unreported'), true);

        const shuffled = structuredClone(packet);
        shuffled.work_items.reverse();
        shuffled.expected_outputs.reverse();
        shuffled.effect_exclusions.reverse();
        assert.equal(computeNativeSwarmPacketSha256(shuffled), packet.packet_sha256);
        assert.equal(validateNativeSwarmPacket(shuffled).packet_sha256, packet.packet_sha256);
    });

    it('does not embed a Luna target policy and fails closed on packet self-attestation', () => {
        const { packet } = fixture();
        packet.work_items[0].requested_identity = { model: 'operator-selector-v9', reasoning: 'custom' };
        packet.packet_sha256 = computeNativeSwarmPacketSha256(packet);
        assert.equal(validateNativeSwarmPacket(packet).work_items[0].requested_identity.model,
            'operator-selector-v9');

        for (const drift of [
            { actual_identity: 'claimed-model', actual_identity_attested: false },
            { actual_identity: 'claimed-model', actual_identity_attested: true },
        ]) {
            const invalid = structuredClone(packet);
            Object.assign(invalid.work_items[0], drift);
            assert.throws(() => computeNativeSwarmPacketSha256(invalid),
                /forge_native_packet_actual_identity_invalid/u);
        }
    });

    it('rejects overlap, descendants, unassigned output, and unknown fields', () => {
        const { root, packet } = fixture();
        const overlap = structuredClone(packet);
        overlap.work_items[1].write_paths = [path.join(root, 'src/a/nested')];
        overlap.work_items[1].output_paths = [path.join(root, 'src/a/nested/result.ts')];
        overlap.expected_outputs[1] = overlap.work_items[1].output_paths[0];
        assert.throws(() => computeNativeSwarmPacketSha256(overlap), /write_overlap/u);

        const descendants = structuredClone(packet);
        descendants.topology.descendants = 1;
        assert.throws(() => computeNativeSwarmPacketSha256(descendants), /descendants_forbidden/u);

        const unassigned = structuredClone(packet);
        unassigned.expected_outputs = [unassigned.expected_outputs[0]];
        assert.throws(() => computeNativeSwarmPacketSha256(unassigned), /expected_outputs_mismatch/u);

        const unknown = { ...packet, provider: 'forbidden' };
        assert.throws(() => computeNativeSwarmPacketSha256(unknown), /packet_fields_invalid/u);
    });

    it('provides a strict no-network CLI validation surface', () => {
        const { root, packet } = fixture();
        const filename = path.join(root, 'packet.json');
        fs.writeFileSync(filename, `${JSON.stringify(packet)}\n`);
        const result = spawnSync(process.execPath, [SCRIPT, filename], {
            cwd: ROOT,
            encoding: 'utf8',
            env: { PATH: process.env.PATH },
        });
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout), {
            packet_sha256: packet.packet_sha256,
            schema: 'cstar.forge_native_swarm_packet_validation.v1',
            status: 'valid',
        });
        assert.equal(result.stderr, '');
    });
});
