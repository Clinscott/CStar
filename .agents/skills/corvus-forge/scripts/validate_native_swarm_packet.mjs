#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NATIVE_SWARM_PACKET_SCHEMA = 'cstar.forge_native_swarm_host_packet.v1';
export const NATIVE_SWARM_CONNECTION_ID = 'forge-native-codex-swarm-v1';

const DIGEST = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/u;
const TOP_LEVEL_KEYS = [
    'aggregator', 'canonical_inputs_sha256', 'connection_id', 'coordinator_task_id',
    'decision_id', 'delta_set_id', 'effect_exclusions', 'evidence_root',
    'execution_root', 'expected_outputs', 'packet_sha256', 'request_id', 'run_id',
    'schema', 'source_identity', 'topology', 'work_items',
];
const WORK_ITEM_KEYS = [
    'actual_identity', 'actual_identity_attested', 'attempts', 'expected_ms',
    'fallback_budget', 'hard_lease_ms', 'host_attempt_id', 'idempotency_key',
    'objective', 'ordinal', 'output_paths', 'replay_budget', 'replacement_budget',
    'requested_identity', 'retry_budget', 'test_paths', 'work_item_id', 'write_paths',
];
const AGGREGATOR_KEYS = [
    'actual_identity', 'actual_identity_attested', 'descendants', 'expected_ms',
    'hard_lease_ms', 'host_attempt_id', 'logical_item_id', 'peer_messages',
    'read_only', 'requested_identity', 'source_writes',
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

function integer(value, code, minimum = 0) {
    if (!Number.isSafeInteger(value) || value < minimum) fail(code);
    return value;
}

function literal(value, expected, code) {
    if (value !== expected) fail(code);
    return value;
}

export function canonicalAbsolutePath(value, code = 'forge_native_packet_path_invalid') {
    const candidate = text(value, code, 4096);
    if (!path.isAbsolute(candidate) || path.resolve(candidate) !== candidate
        || candidate.split(path.sep).some((segment) => segment === '.' || segment === '..')) fail(code);
    return candidate;
}

export function insidePath(candidate, parent) {
    const relative = path.relative(parent, candidate);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relative));
}

function pathOverlap(left, right) {
    return insidePath(left.toLowerCase(), right.toLowerCase())
        || insidePath(right.toLowerCase(), left.toLowerCase());
}

function sortedUnique(values, validate, code, allowEmpty = true) {
    if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) fail(code);
    const normalized = values.map(validate);
    if (new Set(normalized).size !== normalized.length) fail(code);
    return normalized.sort((left, right) => left.localeCompare(right));
}

function identity(value, code, actualRequired = false) {
    exactKeys(value, ['model', 'reasoning'], code);
    const normalized = {
        model: text(value.model, `${code}_model`, 256),
        reasoning: text(value.reasoning, `${code}_reasoning`, 64),
    };
    if (actualRequired && normalized.model === 'unreported') fail(`${code}_model`);
    return normalized;
}

function unreportedIdentity(value, attested, code) {
    if (value !== 'unreported' || attested !== false) fail(code);
    return { actual_identity: 'unreported', actual_identity_attested: false };
}

function normalizeWorkItem(value, executionRoot) {
    exactKeys(value, WORK_ITEM_KEYS, 'forge_native_packet_work_item_fields_invalid');
    const writePaths = sortedUnique(value.write_paths,
        (entry) => canonicalAbsolutePath(entry), 'forge_native_packet_write_paths_invalid', false);
    const testPaths = sortedUnique(value.test_paths,
        (entry) => canonicalAbsolutePath(entry), 'forge_native_packet_test_paths_invalid', false);
    const outputPaths = sortedUnique(value.output_paths,
        (entry) => canonicalAbsolutePath(entry), 'forge_native_packet_output_paths_invalid');
    for (const candidate of [...writePaths, ...testPaths, ...outputPaths]) {
        if (!insidePath(candidate, executionRoot)) fail('forge_native_packet_path_escape');
    }
    if (outputPaths.some((candidate) => !writePaths.some((owned) => insidePath(candidate, owned)))) {
        fail('forge_native_packet_output_unowned');
    }
    const expectedMs = integer(value.expected_ms, 'forge_native_packet_expected_ms_invalid', 1);
    const hardLeaseMs = integer(value.hard_lease_ms, 'forge_native_packet_hard_lease_ms_invalid', 1);
    if (hardLeaseMs < expectedMs) fail('forge_native_packet_lease_order_invalid');
    return {
        ordinal: integer(value.ordinal, 'forge_native_packet_ordinal_invalid', 1),
        work_item_id: id(value.work_item_id, 'forge_native_packet_work_item_id_invalid'),
        host_attempt_id: id(value.host_attempt_id, 'forge_native_packet_host_attempt_id_invalid'),
        idempotency_key: id(value.idempotency_key, 'forge_native_packet_idempotency_key_invalid'),
        objective: text(value.objective, 'forge_native_packet_objective_invalid'),
        write_paths: writePaths,
        test_paths: testPaths,
        output_paths: outputPaths,
        requested_identity: identity(value.requested_identity, 'forge_native_packet_requested_identity'),
        ...unreportedIdentity(value.actual_identity, value.actual_identity_attested,
            'forge_native_packet_actual_identity_invalid'),
        expected_ms: expectedMs,
        hard_lease_ms: hardLeaseMs,
        attempts: literal(value.attempts, 1, 'forge_native_packet_attempt_count_invalid'),
        retry_budget: literal(value.retry_budget, 0, 'forge_native_packet_retry_budget_invalid'),
        replay_budget: literal(value.replay_budget, 0, 'forge_native_packet_replay_budget_invalid'),
        replacement_budget: literal(value.replacement_budget, 0,
            'forge_native_packet_replacement_budget_invalid'),
        fallback_budget: literal(value.fallback_budget, 0, 'forge_native_packet_fallback_budget_invalid'),
    };
}

function normalizeAggregator(value) {
    exactKeys(value, AGGREGATOR_KEYS, 'forge_native_packet_aggregator_fields_invalid');
    const expectedMs = integer(value.expected_ms, 'forge_native_packet_aggregator_expected_invalid', 1);
    const hardLeaseMs = integer(value.hard_lease_ms, 'forge_native_packet_aggregator_lease_invalid', 1);
    if (hardLeaseMs < expectedMs) fail('forge_native_packet_aggregator_lease_order_invalid');
    return {
        logical_item_id: id(value.logical_item_id, 'forge_native_packet_aggregator_id_invalid'),
        host_attempt_id: id(value.host_attempt_id, 'forge_native_packet_aggregator_attempt_invalid'),
        requested_identity: identity(value.requested_identity,
            'forge_native_packet_aggregator_requested_identity'),
        ...unreportedIdentity(value.actual_identity, value.actual_identity_attested,
            'forge_native_packet_aggregator_actual_identity_invalid'),
        expected_ms: expectedMs,
        hard_lease_ms: hardLeaseMs,
        read_only: literal(value.read_only, true, 'forge_native_packet_aggregator_not_read_only'),
        source_writes: literal(value.source_writes, 0, 'forge_native_packet_aggregator_writes_invalid'),
        descendants: literal(value.descendants, 0, 'forge_native_packet_aggregator_descendants_invalid'),
        peer_messages: literal(value.peer_messages, 0,
            'forge_native_packet_aggregator_peer_messages_invalid'),
    };
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, stableValue(item)]));
    }
    return value;
}

export function canonicalJson(value) {
    return JSON.stringify(stableValue(value));
}

export function sha256Canonical(value) {
    return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

export function sha256Bytes(value) {
    return createHash('sha256').update(value).digest('hex');
}

function normalizePacket(input, verifyHash) {
    exactKeys(input, TOP_LEVEL_KEYS, 'forge_native_packet_fields_invalid');
    const executionRoot = canonicalAbsolutePath(input.execution_root,
        'forge_native_packet_execution_root_invalid');
    const evidenceRoot = canonicalAbsolutePath(input.evidence_root,
        'forge_native_packet_evidence_root_invalid');
    exactKeys(input.source_identity, ['head', 'repository'],
        'forge_native_packet_source_identity_fields_invalid');
    const sourceHead = text(input.source_identity.head, 'forge_native_packet_source_head_invalid', 64);
    if (!/^[a-f0-9]{40,64}$/u.test(sourceHead)) fail('forge_native_packet_source_head_invalid');
    exactKeys(input.topology,
        ['descendants', 'direct_workers', 'nested_parent', 'peer_messages'],
        'forge_native_packet_topology_fields_invalid');
    if (!Array.isArray(input.work_items) || input.work_items.length < 1 || input.work_items.length > 3) {
        fail('forge_native_packet_worker_count_invalid');
    }
    const workItems = input.work_items.map((item) => normalizeWorkItem(item, executionRoot))
        .sort((left, right) => left.ordinal - right.ordinal);
    if (workItems.some((item, index) => item.ordinal !== index + 1)) {
        fail('forge_native_packet_worker_order_invalid');
    }
    for (const field of ['work_item_id', 'host_attempt_id', 'idempotency_key']) {
        if (new Set(workItems.map((item) => item[field])).size !== workItems.length) {
            fail(`forge_native_packet_duplicate_${field}`);
        }
    }
    const owned = workItems.flatMap((item) => item.write_paths);
    if (owned.some((entry, index) => owned.slice(0, index).some((prior) => pathOverlap(entry, prior)))) {
        fail('forge_native_packet_write_overlap');
    }
    const outputPaths = workItems.flatMap((item) => item.output_paths).sort((a, b) => a.localeCompare(b));
    const expectedOutputs = sortedUnique(input.expected_outputs,
        (entry) => canonicalAbsolutePath(entry), 'forge_native_packet_expected_outputs_invalid');
    if (canonicalJson(outputPaths) !== canonicalJson(expectedOutputs)) {
        fail('forge_native_packet_expected_outputs_mismatch');
    }
    const normalized = {
        schema: literal(input.schema, NATIVE_SWARM_PACKET_SCHEMA, 'forge_native_packet_schema_invalid'),
        connection_id: literal(input.connection_id, NATIVE_SWARM_CONNECTION_ID,
            'forge_native_packet_connection_invalid'),
        run_id: id(input.run_id, 'forge_native_packet_run_id_invalid'),
        request_id: id(input.request_id, 'forge_native_packet_request_id_invalid'),
        decision_id: id(input.decision_id, 'forge_native_packet_decision_id_invalid'),
        delta_set_id: id(input.delta_set_id, 'forge_native_packet_delta_set_id_invalid'),
        coordinator_task_id: id(input.coordinator_task_id,
            'forge_native_packet_coordinator_task_id_invalid'),
        source_identity: {
            repository: canonicalAbsolutePath(input.source_identity.repository,
                'forge_native_packet_source_repository_invalid'),
            head: sourceHead,
        },
        execution_root: executionRoot,
        evidence_root: evidenceRoot,
        topology: {
            direct_workers: literal(input.topology.direct_workers, workItems.length,
                'forge_native_packet_topology_worker_count_invalid'),
            nested_parent: literal(input.topology.nested_parent, false,
                'forge_native_packet_nested_parent_forbidden'),
            descendants: literal(input.topology.descendants, 0,
                'forge_native_packet_descendants_forbidden'),
            peer_messages: literal(input.topology.peer_messages, 0,
                'forge_native_packet_peer_messages_forbidden'),
        },
        work_items: workItems,
        aggregator: normalizeAggregator(input.aggregator),
        expected_outputs: expectedOutputs,
        effect_exclusions: sortedUnique(input.effect_exclusions,
            (entry) => text(entry, 'forge_native_packet_effect_invalid', 256),
            'forge_native_packet_effects_invalid', false),
        canonical_inputs_sha256: digest(input.canonical_inputs_sha256,
            'forge_native_packet_canonical_inputs_invalid'),
        packet_sha256: '',
    };
    const packetSha256 = sha256Canonical(normalized);
    if (verifyHash && digest(input.packet_sha256, 'forge_native_packet_digest_invalid') !== packetSha256) {
        fail('forge_native_packet_digest_mismatch');
    }
    return { ...normalized, packet_sha256: packetSha256 };
}

export function computeNativeSwarmPacketSha256(packet) {
    return normalizePacket(packet, false).packet_sha256;
}

export function validateNativeSwarmPacket(packet) {
    return normalizePacket(packet, true);
}

function readJsonFile(filename) {
    const resolved = path.resolve(filename);
    const stat = fs.lstatSync(resolved, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 1024 * 1024) {
        fail('forge_native_packet_file_invalid');
    }
    return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function main(argv) {
    if (argv.length !== 1) fail('usage: validate_native_swarm_packet.mjs <packet.json>');
    const packet = validateNativeSwarmPacket(readJsonFile(argv[0]));
    process.stdout.write(`${canonicalJson({ schema: 'cstar.forge_native_swarm_packet_validation.v1',
        status: 'valid', packet_sha256: packet.packet_sha256 })}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}
