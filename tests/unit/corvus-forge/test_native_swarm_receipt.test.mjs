import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    computeNativeSwarmPacketSha256,
    NATIVE_SWARM_CONNECTION_ID,
    NATIVE_SWARM_PACKET_SCHEMA,
    sha256Canonical,
} from '../../../.agents/skills/corvus-forge/scripts/validate_native_swarm_packet.mjs';
import {
    computeNativeSwarmAggregateSha256,
    computeNativeSwarmReceiptSha256,
    computeNativeWorkerEvidenceSha256,
    NATIVE_SWARM_RECEIPT_SCHEMA,
    validateNativeSwarmReceipt,
} from '../../../.agents/skills/corvus-forge/scripts/validate_native_swarm_receipt.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SCRIPT = path.join(ROOT,
    '.agents/skills/corvus-forge/scripts/validate_native_swarm_receipt.mjs');
const temporaryRoots = [];

function fileIdentity(filename) {
    const bytes = fs.readFileSync(filename);
    return {
        path: filename,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        byte_count: bytes.byteLength,
    };
}

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-native-receipt-'));
    temporaryRoots.push(root);
    for (const directory of ['src/a', 'src/b', 'tests', 'evidence']) {
        fs.mkdirSync(path.join(root, directory), { recursive: true });
    }
    const outputA = path.join(root, 'src/a/result.ts');
    const outputB = path.join(root, 'src/b/result.ts');
    fs.writeFileSync(outputA, 'export const a = 1;\n');
    fs.writeFileSync(outputB, 'export const b = 2;\n');
    const artifactA = path.join(root, 'evidence/a.log');
    const artifactB = path.join(root, 'evidence/b.log');
    fs.writeFileSync(artifactA, 'worker a passed\n');
    fs.writeFileSync(artifactB, 'worker b passed\n');
    const packet = {
        schema: NATIVE_SWARM_PACKET_SCHEMA,
        connection_id: NATIVE_SWARM_CONNECTION_ID,
        run_id: 'forge-run:receipt-fixture',
        request_id: 'request-receipt-fixture',
        decision_id: 'CSF-D008-R6',
        delta_set_id: 'CSF-D008-FNS-SET-02-DELTA-04',
        coordinator_task_id: 'coordinator-receipt-fixture',
        source_identity: { repository: root, head: 'a'.repeat(40) },
        execution_root: root,
        evidence_root: path.join(root, 'evidence'),
        topology: { direct_workers: 2, nested_parent: false, descendants: 0, peer_messages: 0 },
        work_items: [
            {
                ordinal: 1, work_item_id: 'receipt-worker-a',
                host_attempt_id: 'host-attempt:receipt-worker-a-01',
                idempotency_key: 'receipt-worker-a-key', objective: 'Write A.',
                write_paths: [path.join(root, 'src/a')],
                test_paths: [path.join(root, 'tests/a.test.ts')], output_paths: [outputA],
                requested_identity: { model: 'gpt-5.6-sol', reasoning: 'max' },
                actual_identity: 'unreported', actual_identity_attested: false,
                expected_ms: 1_000, hard_lease_ms: 2_000, attempts: 1,
                retry_budget: 0, replay_budget: 0, replacement_budget: 0, fallback_budget: 0,
            },
            {
                ordinal: 2, work_item_id: 'receipt-worker-b',
                host_attempt_id: 'host-attempt:receipt-worker-b-01',
                idempotency_key: 'receipt-worker-b-key', objective: 'Write B.',
                write_paths: [path.join(root, 'src/b')],
                test_paths: [path.join(root, 'tests/b.test.ts')], output_paths: [outputB],
                requested_identity: { model: 'host-selector-terra', reasoning: 'high' },
                actual_identity: 'unreported', actual_identity_attested: false,
                expected_ms: 1_000, hard_lease_ms: 2_000, attempts: 1,
                retry_budget: 0, replay_budget: 0, replacement_budget: 0, fallback_budget: 0,
            },
        ],
        aggregator: {
            logical_item_id: 'receipt-aggregator',
            host_attempt_id: 'host-attempt:receipt-aggregator-01',
            requested_identity: { model: 'gpt-5.6-sol', reasoning: 'max' },
            actual_identity: 'unreported', actual_identity_attested: false,
            expected_ms: 1_000, hard_lease_ms: 2_000, read_only: true,
            source_writes: 0, descendants: 0, peer_messages: 0,
        },
        expected_outputs: [outputA, outputB], effect_exclusions: ['git', 'network'],
        canonical_inputs_sha256: 'b'.repeat(64), packet_sha256: '',
    };
    packet.packet_sha256 = computeNativeSwarmPacketSha256(packet);
    const makeWorker = (ordinal, output, artifact, actualIdentity, attested) => {
        const work = packet.work_items[ordinal - 1];
        const worker = {
            ordinal, work_item_id: work.work_item_id, host_attempt_id: work.host_attempt_id,
            task_id: `host-task-receipt-worker-${ordinal}`,
            parent_task_id: packet.coordinator_task_id, role: 'leaf', status: 'SUCCEEDED',
            requested_identity: work.requested_identity,
            actual_identity: actualIdentity, actual_identity_attested: attested,
            changed_files: [fileIdentity(output)],
            checks: [{ command: `focused worker ${ordinal}`, status: 'passed',
                evidence_sha256: String(ordinal).repeat(64) }],
            artifacts: [fileIdentity(artifact)], descendants: [],
            measurements: { attempts: 1, retries: 0, replays: 0, replacements: 0,
                fallbacks: 0, peer_messages: 0, lease_extensions: 0 },
            evidence_sha256: '',
        };
        worker.evidence_sha256 = computeNativeWorkerEvidenceSha256(worker, packet, ordinal);
        return worker;
    };
    const workers = [
        makeWorker(1, outputA, artifactA, 'unreported', false),
        makeWorker(2, outputB, artifactB, 'host-attested:model-v2', true),
    ];
    const changedFiles = workers.flatMap((worker) => worker.changed_files)
        .sort((left, right) => left.path.localeCompare(right.path));
    const receipt = {
        schema: NATIVE_SWARM_RECEIPT_SCHEMA,
        packet_sha256: packet.packet_sha256, run_id: packet.run_id, request_id: packet.request_id,
        decision_id: packet.decision_id, delta_set_id: packet.delta_set_id,
        coordinator_task_id: packet.coordinator_task_id, status: 'DELIVERED_UNVERIFIED',
        worker_receipts: workers,
        aggregator: {
            logical_item_id: packet.aggregator.logical_item_id,
            host_attempt_id: packet.aggregator.host_attempt_id,
            task_id: 'host-task-receipt-aggregator', parent_task_id: packet.coordinator_task_id,
            role: 'aggregator', status: 'DELIVERED_UNVERIFIED',
            requested_identity: packet.aggregator.requested_identity,
            actual_identity: 'unreported', actual_identity_attested: false,
            read_only: true, source_writes: 0, descendants: [], peer_messages: 0,
            worker_evidence_sha256s: workers.map((worker) => worker.evidence_sha256),
            aggregate_sha256: '',
        },
        changed_files: changedFiles, unresolved_gaps: [],
        candidate_digest: sha256Canonical(changedFiles), aggregate_sha256: '', receipt_sha256: '',
    };
    receipt.aggregate_sha256 = computeNativeSwarmAggregateSha256(receipt, packet);
    receipt.aggregator.aggregate_sha256 = receipt.aggregate_sha256;
    receipt.receipt_sha256 = computeNativeSwarmReceiptSha256(receipt, packet);
    return { root, packet, receipt, outputA };
}

afterEach(() => {
    while (temporaryRoots.length) fs.rmSync(temporaryRoots.pop(), { recursive: true, force: true });
});

describe('native swarm host receipt validator', () => {
    it('binds two direct workers, selector inputs, host attestation, and a separate read-only aggregator', () => {
        const { packet, receipt } = fixture();
        const validated = validateNativeSwarmReceipt(receipt, packet);
        assert.equal(validated.status, 'DELIVERED_UNVERIFIED');
        assert.deepEqual(validated.worker_receipts.map((worker) => worker.parent_task_id),
            [packet.coordinator_task_id, packet.coordinator_task_id]);
        assert.notEqual(validated.aggregator.task_id, validated.worker_receipts[0].task_id);
        assert.equal(validated.worker_receipts[0].actual_identity, 'unreported');
        assert.equal(validated.worker_receipts[1].actual_identity_attested, true);
        assert.equal(validated.aggregator.source_writes, 0);
    });

    it('rejects requested-selector drift and unattested actual identity claims', () => {
        const { packet, receipt } = fixture();
        const selectorDrift = structuredClone(receipt);
        selectorDrift.worker_receipts[0].requested_identity.model = 'different-selector';
        assert.throws(() => validateNativeSwarmReceipt(selectorDrift, packet), /requested_identity_drift/u);

        const unattested = structuredClone(receipt);
        unattested.worker_receipts[1].actual_identity_attested = false;
        assert.throws(() => validateNativeSwarmReceipt(unattested, packet), /actual_identity_invalid/u);

        const falseAttestation = structuredClone(receipt);
        falseAttestation.worker_receipts[0].actual_identity_attested = true;
        assert.throws(() => validateNativeSwarmReceipt(falseAttestation, packet), /actual_identity_invalid/u);
    });

    it('rejects byte drift, nested ancestry, duplicate tasks, and aggregator writes', () => {
        const { packet, receipt, outputA } = fixture();
        fs.appendFileSync(outputA, 'drift\n');
        assert.throws(() => validateNativeSwarmReceipt(receipt, packet), /file_invalid|file_drift/u);
        fs.writeFileSync(outputA, 'export const a = 1;\n');

        const nested = structuredClone(receipt);
        nested.worker_receipts[0].parent_task_id = nested.worker_receipts[1].task_id;
        nested.worker_receipts[0].evidence_sha256 = computeNativeWorkerEvidenceSha256(
            nested.worker_receipts[0], packet, 1);
        assert.throws(() => validateNativeSwarmReceipt(nested, packet), /worker_parent_invalid/u);

        const duplicate = structuredClone(receipt);
        duplicate.worker_receipts[1].task_id = duplicate.worker_receipts[0].task_id;
        duplicate.worker_receipts[1].evidence_sha256 = computeNativeWorkerEvidenceSha256(
            duplicate.worker_receipts[1], packet, 2);
        assert.throws(() => validateNativeSwarmReceipt(duplicate, packet), /task_graph_invalid/u);

        const write = structuredClone(receipt);
        write.aggregator.source_writes = 1;
        assert.throws(() => validateNativeSwarmReceipt(write, packet), /aggregator_wrote_source/u);
    });

    it('provides a strict CLI that binds the packet and terminal receipt', () => {
        const { root, packet, receipt } = fixture();
        const packetPath = path.join(root, 'packet.json');
        const receiptPath = path.join(root, 'receipt.json');
        fs.writeFileSync(packetPath, `${JSON.stringify(packet)}\n`);
        fs.writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`);
        const result = spawnSync(process.execPath, [SCRIPT, packetPath, receiptPath], {
            cwd: ROOT, encoding: 'utf8', env: { PATH: process.env.PATH },
        });
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout), {
            receipt_sha256: receipt.receipt_sha256,
            schema: 'cstar.forge_native_swarm_receipt_validation.v1',
            status: 'valid',
        });
        assert.equal(result.stderr, '');
    });
});
