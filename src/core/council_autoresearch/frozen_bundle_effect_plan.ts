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
const validatedPlans = new WeakSet<object>();

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
): asserts value is FrozenBundleEffectEntry {
    const label = `frozen bundle effect entry ${index}`;
    assertExactObjectKeys(value, entryKeys, label);
    const entry = value as FrozenBundleEffectEntry;
    canonicalFrozenPath(entry.path, `${label}.path`);
    assertSha256(entry.sha256, `${label}.sha256`);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0
        || entry.bytes > ARTIFACT_MANIFEST_MAX_FILE_BYTES) {
        fail(`${label}.bytes is invalid`);
    }
    if (entry.mode !== 0o644 && entry.mode !== 0o755) {
        fail(`${label}.mode must be canonical 0644 or 0755`);
    }
}

function assertEntryInventory(entries: unknown): asserts entries is readonly FrozenBundleEffectEntry[] {
    if (!Array.isArray(entries) || entries.length < 1
        || entries.length > ARTIFACT_MANIFEST_MAX_ENTRIES) {
        fail('frozen bundle effect entries are invalid');
    }
    const nodes = new Map<string, { path: string; kind: 'file' | 'directory' }>();
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        assertEffectEntry(entry, index);
        if (index > 0 && compareFrozenPaths(entries[index - 1].path, entry.path) >= 0) {
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
    }
}

function planBase(plan: FrozenBundleEffectPlan): FrozenBundleEffectPlanBase {
    return {
        packet_sha256: plan.packet_sha256,
        destination_root: plan.destination_root,
        entry_count: plan.entry_count,
        total_bytes: plan.total_bytes,
        entries: plan.entries,
    };
}

function deeplyFrozen(plan: FrozenBundleEffectPlan): boolean {
    return Object.isFrozen(plan) && Object.isFrozen(plan.entries)
        && plan.entries.every((entry) => Object.isFrozen(entry));
}

export function assertFrozenBundleEffectPlan(
    value: unknown,
): asserts value is FrozenBundleEffectPlan {
    if (value && typeof value === 'object' && validatedPlans.has(value)) {
        assertDestinationRoot((value as FrozenBundleEffectPlan).destination_root);
        return;
    }
    assertExactObjectKeys(value, planKeys, 'frozen bundle effect plan');
    const plan = value as FrozenBundleEffectPlan;
    assertSha256(plan.packet_sha256, 'frozen bundle effect packet digest');
    assertDestinationRoot(plan.destination_root);
    assertEntryInventory(plan.entries);
    if (!Number.isSafeInteger(plan.entry_count)
        || plan.entry_count !== plan.entries.length) {
        fail('frozen bundle effect entry count is invalid');
    }
    let totalBytes = 0;
    for (const entry of plan.entries) {
        if (totalBytes > ARTIFACT_MANIFEST_MAX_TOTAL_BYTES - entry.bytes) {
            fail('frozen bundle effect total bytes exceed the resource bound');
        }
        totalBytes += entry.bytes;
    }
    if (totalBytes < 1 || plan.total_bytes !== totalBytes
        || plan.total_bytes > ARTIFACT_MANIFEST_MAX_TOTAL_BYTES) {
        fail('frozen bundle effect total bytes are invalid');
    }
    assertSha256(plan.bundle_plan_sha256, 'frozen bundle effect plan digest');
    if (sha256(canonicalJson(planBase(plan))) !== plan.bundle_plan_sha256) {
        fail('frozen bundle effect plan digest mismatch');
    }
    if (deeplyFrozen(plan)) validatedPlans.add(plan);
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
    assertExactObjectKeys(value, authorityKeys, 'frozen bundle operation authority');
    const authority = value as FrozenBundleOperationAuthority;
    if (!Number.isSafeInteger(authority.owner_pid) || authority.owner_pid < 1
        || !UUID_V4_PATTERN.test(authority.operation_id)) {
        fail('frozen bundle operation authority identity is invalid');
    }
    assertSha256(authority.bundle_plan_sha256, 'frozen bundle operation plan digest');
    if (authority.bundle_plan_sha256 !== plan.bundle_plan_sha256
        || authority.bundle_entry_count !== plan.entry_count
        || authority.bundle_total_bytes !== plan.total_bytes) {
        fail('frozen bundle operation authority does not bind the exact effect plan');
    }
}
