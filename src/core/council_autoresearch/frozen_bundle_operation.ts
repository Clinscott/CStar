import fs from 'node:fs';
import path from 'node:path';

import type { FrozenCouncilPacket } from './contracts.js';
import { canonicalJson, fail, fsyncDirectory } from './contracts.js';
import {
    assertFrozenBundleEffectPlan,
    assertFrozenBundleOperationAuthority,
    buildFrozenBundleEffectPlan,
    type FrozenBundleEffectPlan,
    type FrozenBundleOperationAuthority,
} from './frozen_bundle_effect_plan.js';
import {
    verifyFrozenPacketBundle,
} from './frozen_bundle.js';
import {
    assertFrozenDirectoriesUnchanged,
    boundedFrozenDirectoryNames,
    canonicalFrozenDirectory,
    capturePrivateFrozenDirectory,
    compareFrozenPaths,
    createPrivateFrozenDestination,
    ensurePrivateFrozenChain,
    frozenTarget,
} from './frozen_bundle_fs.js';
import {
    inspectOperationBoundFrozenFile,
    repairOperationBoundFrozenFilePublication,
    writeOperationBoundFrozenFile,
    type FrozenOperationFileSnapshot,
} from './frozen_operation_file.js';
import { verifyFrozenPacketStructure } from './packet.js';
import { atomicPrivateTemporaryPath } from './repository_private_file.js';

type AuthorityCallback = () => FrozenBundleOperationAuthority;
type InterruptedState = 'staged' | 'committed';

interface BundleOperationInput {
    plan: FrozenBundleEffectPlan;
    assertTargetBoundOperation: AuthorityCallback;
}

export interface FrozenBundleOperationInspection {
    readonly state: 'absent' | 'partial' | 'complete';
    readonly first_incomplete_index: number;
    readonly interrupted?: { readonly entry_index: number; readonly state: InterruptedState };
    readonly snapshots: readonly FrozenOperationFileSnapshot[];
}

export interface FrozenBundleOperationRepair {
    readonly entry_index: number;
    readonly repair: 'staged-removed' | 'committed-normalized';
}

function planDirectories(plan: FrozenBundleEffectPlan): string[] {
    const directories = new Set<string>();
    for (const entry of plan.entries) {
        const segments = entry.path.split('/');
        for (let index = 1; index < segments.length; index += 1) {
            directories.add(segments.slice(0, index).join('/'));
        }
    }
    return [...directories].sort(compareFrozenPaths);
}

function rootsOverlap(left: string, right: string): boolean {
    return left === right || left.startsWith(`${right}${path.sep}`)
        || right.startsWith(`${left}${path.sep}`);
}

function assertPreparedDirectoryTree(
    plan: FrozenBundleEffectPlan,
    requireComplete: boolean,
): void {
    const root = canonicalFrozenDirectory(
        plan.destination_root,
        'frozen bundle operation destination',
    );
    capturePrivateFrozenDirectory(root, 'frozen bundle operation destination');
    const expected = new Set(planDirectories(plan));
    const seen = new Set<string>();
    const budget = { nodes: 0 };
    const walk = (directory: string, relative: string): void => {
        const before = capturePrivateFrozenDirectory(
            directory,
            'frozen bundle operation preparation directory',
        );
        for (const name of boundedFrozenDirectoryNames(directory, budget, expected.size)) {
            const childRelative = relative ? `${relative}/${name}` : name;
            const child = path.join(directory, name);
            const stat = fs.lstatSync(child);
            if (stat.isSymbolicLink() || !stat.isDirectory()) {
                fail(`frozen bundle operation preparation tree is not empty: ${childRelative}`);
            }
            if (!expected.has(childRelative)) {
                fail(`frozen bundle operation preparation tree contains an unexpected directory: ${childRelative}`);
            }
            seen.add(childRelative);
            walk(child, childRelative);
        }
        assertFrozenDirectoriesUnchanged(
            [before],
            [capturePrivateFrozenDirectory(
                directory,
                'frozen bundle operation preparation directory',
            )],
            'frozen bundle operation preparation directory',
        );
    };
    walk(root, '');
    if (requireComplete && seen.size !== expected.size) {
        fail('frozen bundle operation prepared directory tree is incomplete');
    }
}

export function prepareFrozenBundleOperation(input: {
    plan: FrozenBundleEffectPlan;
    witnessRoot: string;
}): void {
    assertFrozenBundleEffectPlan(input.plan);
    const witness = canonicalFrozenDirectory(input.witnessRoot, 'frozen bundle operation witness');
    if (rootsOverlap(witness, input.plan.destination_root)) {
        fail('frozen bundle operation witness and destination must not overlap');
    }
    if (fs.existsSync(input.plan.destination_root)) {
        assertPreparedDirectoryTree(input.plan, false);
    }
    const root = createPrivateFrozenDestination(
        input.plan.destination_root,
        'frozen bundle operation destination',
        witness,
    );
    for (const entry of input.plan.entries) {
        ensurePrivateFrozenChain(root, frozenTarget(
            root,
            entry.path,
            'frozen bundle operation preparation target',
        ));
    }
    for (const relative of planDirectories(input.plan)) {
        const directory = frozenTarget(root, `${relative}/placeholder`,
            'frozen bundle operation prepared directory');
        const prepared = capturePrivateFrozenDirectory(
            path.dirname(directory),
            'frozen bundle operation prepared directory',
        );
        fsyncDirectory(prepared.path);
    }
    fsyncDirectory(root);
    assertPreparedDirectoryTree(input.plan, true);
}

function selectAuthority(input: BundleOperationInput): {
    authority: FrozenBundleOperationAuthority;
    stable: AuthorityCallback;
} {
    if (typeof input.assertTargetBoundOperation !== 'function') {
        fail('frozen bundle operation authority assertion is required');
    }
    const selected = input.assertTargetBoundOperation();
    assertFrozenBundleOperationAuthority(input.plan, selected);
    const authority = Object.freeze({ ...selected });
    const stable = (): FrozenBundleOperationAuthority => {
        const actual = input.assertTargetBoundOperation();
        assertFrozenBundleOperationAuthority(input.plan, actual);
        if (canonicalJson(actual) !== canonicalJson(authority)) {
            fail('frozen bundle operation authority changed');
        }
        return actual;
    };
    stable();
    return { authority, stable };
}

function exactInventory(
    plan: FrozenBundleEffectPlan,
    authority: FrozenBundleOperationAuthority,
): void {
    const root = canonicalFrozenDirectory(plan.destination_root, 'frozen bundle operation destination');
    const directories = new Set(planDirectories(plan));
    const files = new Set<string>();
    for (const entry of plan.entries) {
        if (files.has(entry.path) || directories.has(entry.path)) {
            fail('frozen bundle operation plan contains a namespace collision');
        }
        files.add(entry.path);
        const target = frozenTarget(root, entry.path, 'frozen bundle operation inventory target');
        const temporary = atomicPrivateTemporaryPath(
            target,
            authority.owner_pid,
            authority.operation_id,
        );
        const relativeTemporary = path.relative(root, temporary).split(path.sep).join('/');
        if (files.has(relativeTemporary) || directories.has(relativeTemporary)) {
            fail('frozen bundle operation temporary collides with the effect plan');
        }
        files.add(relativeTemporary);
    }
    const maximumNodes = directories.size + files.size;
    const budget = { nodes: 0 };
    const seenDirectories = new Set<string>();
    const walk = (directory: string, relative: string): void => {
        const before = capturePrivateFrozenDirectory(directory, 'frozen bundle operation inventory directory');
        for (const name of boundedFrozenDirectoryNames(directory, budget, maximumNodes)) {
            const childRelative = relative ? `${relative}/${name}` : name;
            const child = path.join(directory, name);
            const stat = fs.lstatSync(child);
            if (stat.isSymbolicLink()) {
                fail(`frozen bundle operation inventory contains a symbolic link: ${childRelative}`);
            }
            if (stat.isDirectory()) {
                if (!directories.has(childRelative)) {
                    fail(`frozen bundle operation inventory contains an unexpected directory: ${childRelative}`);
                }
                seenDirectories.add(childRelative);
                walk(child, childRelative);
            } else if (stat.isFile()) {
                if (!files.has(childRelative)) {
                    fail(`frozen bundle operation inventory contains an unexpected file: ${childRelative}`);
                }
            } else {
                fail(`frozen bundle operation inventory contains a special file: ${childRelative}`);
            }
        }
        assertFrozenDirectoriesUnchanged(
            [before],
            [capturePrivateFrozenDirectory(directory, 'frozen bundle operation inventory directory')],
            'frozen bundle operation inventory directory',
        );
    };
    walk(root, '');
    if (seenDirectories.size !== directories.size) {
        fail('frozen bundle operation deterministic directory tree is incomplete');
    }
}

function classifySnapshots(
    snapshots: readonly FrozenOperationFileSnapshot[],
): Omit<FrozenBundleOperationInspection, 'snapshots'> {
    let suffix = false;
    let firstIncomplete = snapshots.length;
    let interrupted: FrozenBundleOperationInspection['interrupted'];
    for (let index = 0; index < snapshots.length; index += 1) {
        const state = snapshots[index].state;
        if (state === 'complete') {
            if (suffix) fail('frozen bundle operation state is not a complete prefix');
            continue;
        }
        if (firstIncomplete === snapshots.length) firstIncomplete = index;
        if (state === 'staged' || state === 'committed') {
            if (suffix || interrupted !== undefined) {
                fail('frozen bundle operation contains multiple or out-of-order interrupted files');
            }
            interrupted = Object.freeze({ entry_index: index, state });
        }
        suffix = true;
    }
    const state = firstIncomplete === snapshots.length
        ? 'complete'
        : firstIncomplete === 0 && snapshots.every((snapshot) => snapshot.state === 'absent')
            ? 'absent'
            : 'partial';
    return { state, first_incomplete_index: firstIncomplete, ...(interrupted ? { interrupted } : {}) };
}

function inspectWithAuthority(
    input: BundleOperationInput,
    selected: ReturnType<typeof selectAuthority>,
): FrozenBundleOperationInspection {
    selected.stable();
    exactInventory(input.plan, selected.authority);
    const snapshots = input.plan.entries.map((_entry, entryIndex) =>
        inspectOperationBoundFrozenFile({
            plan: input.plan,
            entryIndex,
            assertTargetBoundOperation: selected.stable,
        }));
    selected.stable();
    exactInventory(input.plan, selected.authority);
    selected.stable();
    return Object.freeze({
        ...classifySnapshots(snapshots),
        snapshots: Object.freeze(snapshots),
    });
}

export function inspectFrozenBundleOperation(
    input: BundleOperationInput,
): FrozenBundleOperationInspection {
    assertFrozenBundleEffectPlan(input.plan);
    return inspectWithAuthority(input, selectAuthority(input));
}

function assertPacketBindsPlan(packet: FrozenCouncilPacket, plan: FrozenBundleEffectPlan): void {
    verifyFrozenPacketStructure(packet);
    if (packet.packet_sha256 !== plan.packet_sha256) {
        fail('frozen bundle operation packet does not bind the effect plan');
    }
}

function proveComplete(
    packet: FrozenCouncilPacket,
    plan: FrozenBundleEffectPlan,
): void {
    assertPacketBindsPlan(packet, plan);
    verifyFrozenPacketBundle({ packet, bundleRoot: plan.destination_root });
    const reproved = buildFrozenBundleEffectPlan({
        packet,
        witnessRoot: plan.destination_root,
        destinationRoot: plan.destination_root,
    });
    if (canonicalJson(reproved) !== canonicalJson(plan)) {
        fail('frozen bundle operation complete inventory does not re-prove the effect plan');
    }
    assertPacketBindsPlan(packet, plan);
}

export function recoverFrozenBundleOperation(input: BundleOperationInput & {
    packet: FrozenCouncilPacket;
}): { inspection: FrozenBundleOperationInspection;
    repaired: readonly FrozenBundleOperationRepair[] } {
    assertFrozenBundleEffectPlan(input.plan);
    assertPacketBindsPlan(input.packet, input.plan);
    const selected = selectAuthority(input);
    const before = inspectWithAuthority(input, selected);
    const repaired: FrozenBundleOperationRepair[] = [];
    for (let entryIndex = 0; entryIndex < input.plan.entries.length; entryIndex += 1) {
        selected.stable();
        const result = repairOperationBoundFrozenFilePublication({
            plan: input.plan,
            entryIndex,
            expected: before.snapshots[entryIndex],
            assertTargetBoundOperation: selected.stable,
        });
        selected.stable();
        if (result.repaired !== 'none') {
            repaired.push(Object.freeze({ entry_index: entryIndex, repair: result.repaired }));
        }
    }
    const expectedRepairs = before.interrupted ? 1 : 0;
    if (repaired.length !== expectedRepairs
        || (before.interrupted
            && repaired[0]?.entry_index !== before.interrupted.entry_index)) {
        fail('frozen bundle operation interrupted file was not repaired exactly once in order');
    }
    const inspection = inspectWithAuthority(input, selected);
    if (inspection.state === 'complete') proveComplete(input.packet, input.plan);
    return Object.freeze({ inspection, repaired: Object.freeze(repaired) });
}

export function writeFrozenBundleOperation(input: BundleOperationInput & {
    packet: FrozenCouncilPacket;
    witnessRoot: string;
}): { inspection: FrozenBundleOperationInspection; created: number; replayed: number } {
    assertFrozenBundleEffectPlan(input.plan);
    assertPacketBindsPlan(input.packet, input.plan);
    const selected = selectAuthority(input);
    const before = inspectWithAuthority(input, selected);
    if (before.state === 'complete') {
        proveComplete(input.packet, input.plan);
        return Object.freeze({
            inspection: before,
            created: 0,
            replayed: input.plan.entry_count,
        });
    }
    if (before.interrupted) {
        fail('frozen bundle operation write requires explicit interrupted-file recovery');
    }
    let created = 0;
    let replayed = 0;
    for (let entryIndex = 0; entryIndex < input.plan.entries.length; entryIndex += 1) {
        const result = writeOperationBoundFrozenFile({
            plan: input.plan,
            entryIndex,
            witnessRoot: input.witnessRoot,
            assertTargetBoundOperation: selected.stable,
        });
        if (result.created) created += 1;
        else replayed += 1;
    }
    const inspection = inspectWithAuthority(input, selected);
    if (inspection.state !== 'complete') {
        fail('frozen bundle operation write did not complete the exact inventory');
    }
    proveComplete(input.packet, input.plan);
    return Object.freeze({ inspection, created, replayed });
}
