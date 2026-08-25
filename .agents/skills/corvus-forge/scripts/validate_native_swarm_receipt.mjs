#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    canonicalAbsolutePath,
    canonicalJson,
    insidePath,
    sha256Bytes,
    sha256Canonical,
    validateNativeSwarmPacket,
} from './validate_native_swarm_packet.mjs';

export const NATIVE_SWARM_RECEIPT_SCHEMA = 'cstar.forge_native_swarm_host_receipt.v1';

const DIGEST = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/u;
const TOP_LEVEL_KEYS = [
    'aggregate_sha256', 'aggregator', 'candidate_digest', 'changed_files',
    'coordinator_task_id', 'decision_id', 'delta_set_id', 'packet_sha256',
    'receipt_sha256', 'request_id', 'run_id', 'schema', 'status', 'unresolved_gaps',
    'worker_receipts',
];
const WORKER_KEYS = [
    'actual_identity', 'actual_identity_attested', 'artifacts', 'changed_files',
    'checks', 'descendants', 'evidence_sha256', 'host_attempt_id', 'measurements',
    'ordinal', 'parent_task_id', 'requested_identity', 'role', 'status', 'task_id',
    'work_item_id',
];
const AGGREGATOR_KEYS = [
    'actual_identity', 'actual_identity_attested', 'aggregate_sha256', 'descendants',
    'host_attempt_id', 'logical_item_id', 'parent_task_id', 'peer_messages',
    'read_only', 'requested_identity', 'role', 'source_writes', 'status', 'task_id',
    'worker_evidence_sha256s',
];

function fail(code) {
    throw new Error(code);
}

function record(value, code) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
    return value;
}

function exactKeys(value, expected, code) {
    const actual = Object.keys(record(value, code)).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
        fail(code);
    }
}

function text(value, code, maximum = 65_536) {
    if (typeof value !== 'string' || value.length === 0 || value.length > maximum
        || value.trim() !== value || value.includes('\0')) fail(code);
    return value;
}

function id(value, code) {
    const candidate = text(value, code, 192);
    if (!ID.test(candidate)) fail(code);
    return candidate;
}

function digest(value, code) {
    if (typeof value !== 'string' || !DIGEST.test(value)) fail(code);
    return value;
}

function integer(value, code) {
    if (!Number.isSafeInteger(value) || value < 0) fail(code);
    return value;
}

function identity(value, code) {
    exactKeys(value, ['model', 'reasoning'], code);
    return {
        model: text(value.model, `${code}_model`, 256),
        reasoning: text(value.reasoning, `${code}_reasoning`, 64),
    };
}

function actualIdentity(value, attested, code) {
    const actual = text(value, code, 256);
    if ((actual === 'unreported') !== (attested === false)) fail(code);
    if (actual !== 'unreported' && attested !== true) fail(code);
    return { actual_identity: actual, actual_identity_attested: attested };
}

function sortedUnique(values, validate, code) {
    if (!Array.isArray(values)) fail(code);
    const normalized = values.map(validate);
    if (new Set(normalized).size !== normalized.length) fail(code);
    return normalized.sort((left, right) => left.localeCompare(right));
}

function normalizedFiles(values, validate, code) {
    if (!Array.isArray(values)) fail(code);
    const normalized = values.map(validate);
    if (new Set(normalized.map((entry) => entry.path)).size !== normalized.length) fail(code);
    return normalized.sort((left, right) => left.path.localeCompare(right.path));
}

function fileIdentity(value, allowedRoots, code) {
    exactKeys(value, ['byte_count', 'path', 'sha256'], `${code}_fields_invalid`);
    const filename = canonicalAbsolutePath(value.path, `${code}_path_invalid`);
    if (!allowedRoots.some((root) => insidePath(filename, root))) fail(`${code}_path_escape`);
    const expectedBytes = integer(value.byte_count, `${code}_byte_count_invalid`);
    const expectedHash = digest(value.sha256, `${code}_sha256_invalid`);
    const stat = fs.lstatSync(filename, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== expectedBytes) {
        fail(`${code}_file_invalid`);
    }
    const bytes = fs.readFileSync(filename);
    if (bytes.byteLength !== expectedBytes || sha256Bytes(bytes) !== expectedHash) {
        fail(`${code}_file_drift`);
    }
    return { path: filename, sha256: expectedHash, byte_count: expectedBytes };
}

function normalizeChecks(values) {
    if (!Array.isArray(values) || values.length === 0) fail('forge_native_receipt_checks_invalid');
    return values.map((value) => {
        exactKeys(value, ['command', 'evidence_sha256', 'status'],
            'forge_native_receipt_check_fields_invalid');
        if (value.status !== 'passed') fail('forge_native_receipt_check_not_passed');
        return {
            command: text(value.command, 'forge_native_receipt_check_command_invalid', 8192),
            status: 'passed',
            evidence_sha256: digest(value.evidence_sha256,
                'forge_native_receipt_check_evidence_invalid'),
        };
    });
}

function normalizeMeasurements(value) {
    const keys = ['attempts', 'fallbacks', 'lease_extensions', 'peer_messages', 'replacements',
        'replays', 'retries'];
    exactKeys(value, keys, 'forge_native_receipt_measurement_fields_invalid');
    const normalized = Object.fromEntries(keys.map((key) => [key, integer(value[key],
        `forge_native_receipt_measurement_${key}_invalid`)]));
    if (normalized.attempts !== 1 || keys.filter((key) => key !== 'attempts')
        .some((key) => normalized[key] !== 0)) fail('forge_native_receipt_attempt_budget_exceeded');
    return normalized;
}

function normalizeWorker(value, workItem, packet, verifyHash = true) {
    exactKeys(value, WORKER_KEYS, 'forge_native_receipt_worker_fields_invalid');
    if (value.ordinal !== workItem.ordinal || value.work_item_id !== workItem.work_item_id
        || value.host_attempt_id !== workItem.host_attempt_id) {
        fail('forge_native_receipt_worker_binding_invalid');
    }
    const requested = identity(value.requested_identity,
        'forge_native_receipt_worker_requested_identity');
    if (canonicalJson(requested) !== canonicalJson(workItem.requested_identity)) {
        fail('forge_native_receipt_requested_identity_drift');
    }
    const changedFiles = normalizedFiles(value.changed_files,
        (entry) => fileIdentity(entry, workItem.write_paths, 'forge_native_receipt_changed_file'),
        'forge_native_receipt_changed_files_invalid');
    const artifacts = normalizedFiles(value.artifacts,
        (entry) => fileIdentity(entry, [packet.evidence_root], 'forge_native_receipt_artifact'),
        'forge_native_receipt_artifacts_invalid');
    if (!Array.isArray(value.descendants) || value.descendants.length !== 0) {
        fail('forge_native_receipt_descendants_forbidden');
    }
    const normalized = {
        ordinal: workItem.ordinal,
        work_item_id: workItem.work_item_id,
        host_attempt_id: workItem.host_attempt_id,
        task_id: id(value.task_id, 'forge_native_receipt_task_id_invalid'),
        parent_task_id: id(value.parent_task_id, 'forge_native_receipt_parent_task_id_invalid'),
        role: value.role === 'leaf' ? 'leaf' : fail('forge_native_receipt_worker_role_invalid'),
        status: value.status === 'SUCCEEDED' ? 'SUCCEEDED'
            : fail('forge_native_receipt_worker_not_succeeded'),
        requested_identity: requested,
        ...actualIdentity(value.actual_identity, value.actual_identity_attested,
            'forge_native_receipt_actual_identity_invalid'),
        changed_files: changedFiles,
        checks: normalizeChecks(value.checks),
        artifacts,
        descendants: [],
        measurements: normalizeMeasurements(value.measurements),
        evidence_sha256: '',
    };
    const evidenceSha256 = sha256Canonical(normalized);
    if (verifyHash && digest(value.evidence_sha256, 'forge_native_receipt_worker_digest_invalid')
        !== evidenceSha256) fail('forge_native_receipt_worker_digest_mismatch');
    return { ...normalized, evidence_sha256: evidenceSha256 };
}

export function computeNativeWorkerEvidenceSha256(worker, packet, ordinal) {
    const validatedPacket = validateNativeSwarmPacket(packet);
    return normalizeWorker(worker, validatedPacket.work_items[ordinal - 1], validatedPacket, false)
        .evidence_sha256;
}

function normalizeAggregator(value, packet, workerEvidence, aggregateSha256, verifyHash) {
    exactKeys(value, AGGREGATOR_KEYS, 'forge_native_receipt_aggregator_fields_invalid');
    const requested = identity(value.requested_identity,
        'forge_native_receipt_aggregator_requested_identity');
    if (canonicalJson(requested) !== canonicalJson(packet.aggregator.requested_identity)) {
        fail('forge_native_receipt_aggregator_identity_drift');
    }
    if (!Array.isArray(value.worker_evidence_sha256s)
        || canonicalJson(value.worker_evidence_sha256s) !== canonicalJson(workerEvidence)) {
        fail('forge_native_receipt_aggregator_worker_binding_invalid');
    }
    if (!Array.isArray(value.descendants) || value.descendants.length !== 0) {
        fail('forge_native_receipt_aggregator_descendants_forbidden');
    }
    return {
        logical_item_id: value.logical_item_id === packet.aggregator.logical_item_id
            ? value.logical_item_id : fail('forge_native_receipt_aggregator_binding_invalid'),
        host_attempt_id: value.host_attempt_id === packet.aggregator.host_attempt_id
            ? value.host_attempt_id : fail('forge_native_receipt_aggregator_binding_invalid'),
        task_id: id(value.task_id, 'forge_native_receipt_aggregator_task_id_invalid'),
        parent_task_id: value.parent_task_id === packet.coordinator_task_id
            ? value.parent_task_id : fail('forge_native_receipt_aggregator_parent_invalid'),
        role: value.role === 'aggregator' ? 'aggregator'
            : fail('forge_native_receipt_aggregator_role_invalid'),
        status: value.status === 'DELIVERED_UNVERIFIED' ? 'DELIVERED_UNVERIFIED'
            : fail('forge_native_receipt_aggregator_status_invalid'),
        requested_identity: requested,
        ...actualIdentity(value.actual_identity, value.actual_identity_attested,
            'forge_native_receipt_aggregator_actual_identity_invalid'),
        read_only: value.read_only === true ? true : fail('forge_native_receipt_aggregator_not_read_only'),
        source_writes: value.source_writes === 0 ? 0 : fail('forge_native_receipt_aggregator_wrote_source'),
        descendants: [],
        peer_messages: value.peer_messages === 0 ? 0
            : fail('forge_native_receipt_aggregator_peer_messages_invalid'),
        worker_evidence_sha256s: workerEvidence,
        aggregate_sha256: !verifyHash || digest(value.aggregate_sha256,
            'forge_native_receipt_aggregator_digest_invalid') === aggregateSha256
            ? aggregateSha256 : fail('forge_native_receipt_aggregator_digest_mismatch'),
    };
}

function normalizeReceipt(input, packetInput, verifyHash) {
    const packet = validateNativeSwarmPacket(packetInput);
    exactKeys(input, TOP_LEVEL_KEYS, 'forge_native_receipt_fields_invalid');
    for (const [key, expected] of [
        ['packet_sha256', packet.packet_sha256], ['run_id', packet.run_id],
        ['request_id', packet.request_id], ['decision_id', packet.decision_id],
        ['delta_set_id', packet.delta_set_id], ['coordinator_task_id', packet.coordinator_task_id],
    ]) {
        if (input[key] !== expected) fail(`forge_native_receipt_${key}_binding_invalid`);
    }
    if (!Array.isArray(input.worker_receipts)
        || input.worker_receipts.length !== packet.work_items.length) {
        fail('forge_native_receipt_worker_count_invalid');
    }
    const workers = input.worker_receipts.map((worker, index) =>
        normalizeWorker(worker, packet.work_items[index], packet));
    if (workers.some((worker) => worker.parent_task_id !== packet.coordinator_task_id)) {
        fail('forge_native_receipt_worker_parent_invalid');
    }
    const taskIds = workers.map((worker) => worker.task_id);
    if (new Set(taskIds).size !== taskIds.length || taskIds.includes(packet.coordinator_task_id)) {
        fail('forge_native_receipt_task_graph_invalid');
    }
    const changedFiles = workers.flatMap((worker) => worker.changed_files)
        .sort((left, right) => left.path.localeCompare(right.path));
    if (new Set(changedFiles.map((entry) => entry.path)).size !== changedFiles.length
        || canonicalJson(input.changed_files) !== canonicalJson(changedFiles)) {
        fail('forge_native_receipt_changed_files_mismatch');
    }
    const evidencePaths = new Set(workers.flatMap((worker) => [
        ...worker.changed_files.map((entry) => entry.path),
        ...worker.artifacts.map((entry) => entry.path),
    ]));
    if (packet.expected_outputs.some((expected) => !evidencePaths.has(expected))) {
        fail('forge_native_receipt_expected_output_missing');
    }
    const unresolvedGaps = sortedUnique(input.unresolved_gaps,
        (entry) => text(entry, 'forge_native_receipt_gap_invalid', 256),
        'forge_native_receipt_gaps_invalid');
    const candidateDigest = sha256Canonical(changedFiles);
    if (digest(input.candidate_digest, 'forge_native_receipt_candidate_digest_invalid')
        !== candidateDigest) fail('forge_native_receipt_candidate_digest_mismatch');
    const workerEvidence = workers.map((worker) => worker.evidence_sha256);
    const aggregateCore = {
        packet_sha256: packet.packet_sha256,
        status: 'DELIVERED_UNVERIFIED',
        worker_evidence_sha256s: workerEvidence,
        changed_files: changedFiles,
        candidate_digest: candidateDigest,
        unresolved_gaps: unresolvedGaps,
    };
    const aggregateSha256 = sha256Canonical(aggregateCore);
    if (verifyHash && digest(input.aggregate_sha256, 'forge_native_receipt_aggregate_digest_invalid')
        !== aggregateSha256) fail('forge_native_receipt_aggregate_digest_mismatch');
    const aggregator = normalizeAggregator(input.aggregator, packet, workerEvidence,
        aggregateSha256, verifyHash);
    if (taskIds.includes(aggregator.task_id) || aggregator.task_id === packet.coordinator_task_id) {
        fail('forge_native_receipt_aggregator_not_separate');
    }
    const normalized = {
        schema: input.schema === NATIVE_SWARM_RECEIPT_SCHEMA ? NATIVE_SWARM_RECEIPT_SCHEMA
            : fail('forge_native_receipt_schema_invalid'),
        packet_sha256: packet.packet_sha256,
        run_id: packet.run_id,
        request_id: packet.request_id,
        decision_id: packet.decision_id,
        delta_set_id: packet.delta_set_id,
        coordinator_task_id: packet.coordinator_task_id,
        status: input.status === 'DELIVERED_UNVERIFIED' ? 'DELIVERED_UNVERIFIED'
            : fail('forge_native_receipt_status_invalid'),
        worker_receipts: workers,
        aggregator,
        changed_files: changedFiles,
        unresolved_gaps: unresolvedGaps,
        candidate_digest: candidateDigest,
        aggregate_sha256: aggregateSha256,
        receipt_sha256: '',
    };
    const receiptSha256 = sha256Canonical(normalized);
    if (verifyHash && digest(input.receipt_sha256, 'forge_native_receipt_digest_invalid')
        !== receiptSha256) fail('forge_native_receipt_digest_mismatch');
    return { ...normalized, receipt_sha256: receiptSha256 };
}

export function computeNativeSwarmAggregateSha256(receipt, packet) {
    return normalizeReceipt(receipt, packet, false).aggregate_sha256;
}

export function computeNativeSwarmReceiptSha256(receipt, packet) {
    return normalizeReceipt(receipt, packet, false).receipt_sha256;
}

export function validateNativeSwarmReceipt(receipt, packet) {
    return normalizeReceipt(receipt, packet, true);
}

function readJsonFile(filename, code) {
    const resolved = path.resolve(filename);
    const stat = fs.lstatSync(resolved, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 4 * 1024 * 1024) {
        fail(code);
    }
    return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function main(argv) {
    if (argv.length !== 2) fail('usage: validate_native_swarm_receipt.mjs <packet.json> <receipt.json>');
    const packet = readJsonFile(argv[0], 'forge_native_receipt_packet_file_invalid');
    const receipt = validateNativeSwarmReceipt(
        readJsonFile(argv[1], 'forge_native_receipt_file_invalid'), packet);
    process.stdout.write(`${canonicalJson({ schema: 'cstar.forge_native_swarm_receipt_validation.v1',
        status: 'valid', receipt_sha256: receipt.receipt_sha256 })}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}
