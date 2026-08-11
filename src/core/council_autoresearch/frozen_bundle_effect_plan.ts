import path from 'node:path';

import {
    ARTIFACT_MANIFEST_MAX_ENTRIES,
    ARTIFACT_MANIFEST_MAX_FILE_BYTES,
    ARTIFACT_MANIFEST_MAX_TOTAL_BYTES,
} from './artifact_manifest.js';
import type { FrozenCouncilPacket } from './contracts.js';
import {
    assertExactObjectKeys,
    assertSha256,
    canonicalJson,
    fail,
    sha256,
} from './contracts.js';
import { frozenPacketBundleEntries } from './frozen_bundle.js';
import {
    assertTrustedFrozenDestination,
    canonicalFrozenDirectory,
    canonicalFrozenPath,
    compareFrozenPaths,
    snapshotContainedFrozenFile,
} from './frozen_bundle_fs.js';
import { verifyFrozenPacketStructure } from './packet.js';
import { UUID_V4_PATTERN } from './repository_lease_contract.js';

export interface FrozenBundleEffectEntry {
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
    readonly mode: 0o644 | 0o755;
}

export interface FrozenBundleEffectPlan {
    readonly packet_sha256: string;
    readonly destination_root: string;
    readonly entry_count: number;
    readonly total_bytes: number;
    readonly entries: readonly FrozenBundleEffectEntry[];
    readonly bundle_plan_sha256: string;
}

export interface FrozenBundleOperationAuthority {
    readonly owner_pid: number;
    readonly operation_id: string;
    readonly bundle_plan_sha256: string;
    readonly bundle_entry_count: number;
    readonly bundle_total_bytes: number;
}

type FrozenBundleEffectPlanBase = Omit<FrozenBundleEffectPlan, 'bundle_plan_sha256'>;

const planKeys = Object.freeze([
    'packet_sha256', 'destination_root', 'entry_count', 'total_bytes', 'entries',
    'bundle_plan_sha256',
] as const);
const entryKeys = Object.freeze(['path', 'sha256', 'bytes', 'mode'] as const);
const authorityKeys = Object.freeze([
    'owner_pid', 'operation_id', 'bundle_plan_sha256',
    'bundle_entry_count', 'bundle_total_bytes',
] as const);

function ownDataFields(
    value: unknown,
    keys: readonly string[],
    label: string,
): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || !Object.isFrozen(value)) {
        fail(`${label} must be frozen`);
    }
    assertExactObjectKeys(value, keys, label);
    const fields: Record<string, unknown> = {};
    for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
            fail(`${label}.${key} must be an own enumerable data property`);
        }
        fields[key] = descriptor.value;
    }
    return fields;
}

function denseDataArray(value: unknown, label: string): unknown[] {
    if (!Array.isArray(value) || !Object.isFrozen(value)) {
        fail(`${label} must be a frozen array`);
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (!lengthDescriptor || !('value' in lengthDescriptor)
        || !Number.isSafeInteger(lengthDescriptor.value)
        || lengthDescriptor.value < 1
        || lengthDescriptor.value > ARTIFACT_MANIFEST_MAX_ENTRIES) {
        fail('frozen bundle effect entries are invalid');
    }
    const length = lengthDescriptor.value as number;
    const keys = Object.keys(value);
    if (keys.length !== length
        || keys.some((key, index) => key !== String(index))) {
        fail(`${label} must contain only dense array indices`);
    }
    const entries: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
            fail(`${label}[${index}] must be an own enumerable data property`);
        }
        entries.push(descriptor.value);
    }
    return entries;
}

function canonicalDestinationRoot(input: string): string {
    if (typeof input !== 'string' || /[\r\n\0]/.test(input)
        || Buffer.byteLength(input, 'utf8') > 4096) {
        fail('frozen bundle effect destination root is invalid');
    }
    const destination = path.resolve(input);
    assertTrustedFrozenDestination(destination);
    return destination;
}

function assertDestinationRoot(value: unknown): asserts value is string {
    if (typeof value !== 'string' || !path.isAbsolute(value)
        || path.resolve(value) !== value || /[\r\n\0]/.test(value)
        || Buffer.byteLength(value, 'utf8') > 4096) {
        fail('frozen bundle effect destination root is invalid');
    }
    assertTrustedFrozenDestination(value);
}

function assertEffectEntry(
    value: unknown,
    index: number,
): FrozenBundleEffectEntry {
    const label = `frozen bundle effect entry ${index}`;
    const fields = ownDataFields(value, entryKeys, label);
    const entryPath = fields.path;
    const entrySha256 = fields.sha256;
    const entryBytes = fields.bytes;
    const entryMode = fields.mode;
    const canonicalEntryPath = canonicalFrozenPath(entryPath, `${label}.path`);
    assertSha256(entrySha256, `${label}.sha256`);
    if (!Number.isSafeInteger(entryBytes) || (entryBytes as number) < 0
        || (entryBytes as number) > ARTIFACT_MANIFEST_MAX_FILE_BYTES) {
        fail(`${label}.bytes is invalid`);
    }
    if (entryMode !== 0o644 && entryMode !== 0o755) {
        fail(`${label}.mode must be canonical 0644 or 0755`);
    }
    return {
        path: canonicalEntryPath,
        sha256: entrySha256,
        bytes: entryBytes as number,
        mode: entryMode,
    };
}

function assertEntryInventory(entries: unknown): FrozenBundleEffectEntry[] {
    const values = denseDataArray(entries, 'frozen bundle effect entries');
    const validated: FrozenBundleEffectEntry[] = [];
    const nodes = new Map<string, { path: string; kind: 'file' | 'directory' }>();
    for (let index = 0; index < values.length; index += 1) {
        const entry = assertEffectEntry(values[index], index);
        if (index > 0 && compareFrozenPaths(validated[index - 1].path, entry.path) >= 0) {
            fail('frozen bundle effect entries are not in strict UTF-8 path order');
        }
        const segments = entry.path.split('/');
        for (let part = 0; part < segments.length; part += 1) {
            const prefix = segments.slice(0, part + 1).join('/');
            const kind = part === segments.length - 1 ? 'file' : 'directory';
            const key = prefix.normalize('NFC').toLocaleLowerCase('en-US');
            const existing = nodes.get(key);
            if (existing && existing.path !== prefix) {
                fail('frozen bundle effect entries contain a path or case collision');
            }
            if (existing && existing.kind !== kind) {
                fail('frozen bundle effect entries contain a path/ancestor conflict');
            }
            if (existing && kind === 'file') {
                fail('frozen bundle effect entries contain a duplicate path');
            }
            if (!existing && nodes.size >= ARTIFACT_MANIFEST_MAX_ENTRIES) {
                fail('frozen bundle effect entries exceed the path-node resource bound');
            }
            nodes.set(key, { path: prefix, kind });
        }
        validated.push(entry);
    }
    return validated;
}

export function assertFrozenBundleEffectPlan(
    value: unknown,
): asserts value is FrozenBundleEffectPlan {
    const fields = ownDataFields(value, planKeys, 'frozen bundle effect plan');
    const packetSha256 = fields.packet_sha256;
    const destinationRoot = fields.destination_root;
    const entries = assertEntryInventory(fields.entries);
    const entryCount = fields.entry_count;
    const claimedTotalBytes = fields.total_bytes;
    const claimedPlanSha256 = fields.bundle_plan_sha256;
    assertSha256(packetSha256, 'frozen bundle effect packet digest');
    assertDestinationRoot(destinationRoot);
    if (!Number.isSafeInteger(entryCount)
        || entryCount !== entries.length) {
        fail('frozen bundle effect entry count is invalid');
    }
    let totalBytes = 0;
    for (const entry of entries) {
        if (totalBytes > ARTIFACT_MANIFEST_MAX_TOTAL_BYTES - entry.bytes) {
            fail('frozen bundle effect total bytes exceed the resource bound');
        }
        totalBytes += entry.bytes;
    }
    if (totalBytes < 1 || claimedTotalBytes !== totalBytes
        || totalBytes > ARTIFACT_MANIFEST_MAX_TOTAL_BYTES) {
        fail('frozen bundle effect total bytes are invalid');
    }
    assertSha256(claimedPlanSha256, 'frozen bundle effect plan digest');
    const base: FrozenBundleEffectPlanBase = {
        packet_sha256: packetSha256,
        destination_root: destinationRoot,
        entry_count: entryCount as number,
        total_bytes: claimedTotalBytes as number,
        entries,
    };
    if (sha256(canonicalJson(base)) !== claimedPlanSha256) {
        fail('frozen bundle effect plan digest mismatch');
    }
}

export function buildFrozenBundleEffectPlan(input: {
    packet: FrozenCouncilPacket;
    witnessRoot: string;
    destinationRoot: string;
}): FrozenBundleEffectPlan {
    const packetSha256 = input.packet.packet_sha256;
    verifyFrozenPacketStructure(input.packet);
    if (input.packet.packet_sha256 !== packetSha256) {
        fail('frozen bundle effect packet changed during planning');
    }
    const witnessRoot = canonicalFrozenDirectory(input.witnessRoot, 'frozen bundle effect witness');
    const destinationRoot = canonicalDestinationRoot(input.destinationRoot);
    const entries = frozenPacketBundleEntries(input.packet, witnessRoot).map((entry) => {
        const snapshot = snapshotContainedFrozenFile(
            witnessRoot,
            entry.path,
            `frozen bundle effect witness ${entry.path}`,
        );
        if (snapshot.rawMode !== entry.mode || snapshot.content.length !== entry.bytes
            || sha256(snapshot.content) !== entry.sha256) {
            fail(`frozen bundle effect witness changed at ${entry.path}`);
        }
        return Object.freeze({ ...entry });
    });
    verifyFrozenPacketStructure(input.packet);
    if (input.packet.packet_sha256 !== packetSha256) {
        fail('frozen bundle effect packet changed during planning');
    }
    const frozenEntries = Object.freeze(entries);
    const base: FrozenBundleEffectPlanBase = {
        packet_sha256: packetSha256,
        destination_root: destinationRoot,
        entry_count: frozenEntries.length,
        total_bytes: frozenEntries.reduce((total, entry) => total + entry.bytes, 0),
        entries: frozenEntries,
    };
    const plan = Object.freeze({
        ...base,
        bundle_plan_sha256: sha256(canonicalJson(base)),
    });
    assertFrozenBundleEffectPlan(plan);
    return plan;
}

export function assertFrozenBundleOperationAuthority(
    plan: FrozenBundleEffectPlan,
    value: unknown,
): asserts value is FrozenBundleOperationAuthority {
    assertFrozenBundleEffectPlan(plan);
    const fields = ownDataFields(value, authorityKeys, 'frozen bundle operation authority');
    const ownerPid = fields.owner_pid;
    const operationId = fields.operation_id;
    const bundlePlanSha256 = fields.bundle_plan_sha256;
    const bundleEntryCount = fields.bundle_entry_count;
    const bundleTotalBytes = fields.bundle_total_bytes;
    if (!Number.isSafeInteger(ownerPid) || (ownerPid as number) < 1
        || typeof operationId !== 'string' || !UUID_V4_PATTERN.test(operationId)) {
        fail('frozen bundle operation authority identity is invalid');
    }
    assertSha256(bundlePlanSha256, 'frozen bundle operation plan digest');
    if (bundlePlanSha256 !== plan.bundle_plan_sha256
        || bundleEntryCount !== plan.entry_count
        || bundleTotalBytes !== plan.total_bytes) {
        fail('frozen bundle operation authority does not bind the exact effect plan');
    }
}
