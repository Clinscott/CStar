import fs from 'node:fs';
import path from 'node:path';

import { ARTIFACT_MANIFEST_MAX_ENTRIES } from './artifact_manifest.js';
import { canonicalJson, fail, fsyncDirectory, sha256 } from './contracts.js';
import {
    assertFrozenBundleEffectPlan,
    assertFrozenBundleOperationAuthority,
    type FrozenBundleEffectEntry,
    type FrozenBundleEffectPlan,
    type FrozenBundleOperationAuthority,
} from './frozen_bundle_effect_plan.js';
import {
    assertPrivateExistingFrozenChain, canonicalFrozenDirectory,
    capturePrivateFrozenDirectory, frozenTarget, snapshotContainedFrozenFile,
} from './frozen_bundle_fs.js';
import { atomicPrivateTemporaryPath, optionalStat, sameInode } from './repository_private_file.js';

const DIRECTORY_ENTRY_LIMIT = ARTIFACT_MANIFEST_MAX_ENTRIES * 2;
const STAT_KEYS = [
    'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
] as const;

export type FrozenOperationFileStat = Readonly<Pick<fs.BigIntStats, typeof STAT_KEYS[number]>>;
interface FrozenOperationArtifactSnapshot { readonly stat: FrozenOperationFileStat; readonly content: Buffer }

export type FrozenOperationFileSnapshot =
    | { readonly state: 'absent' }
    | { readonly state: 'staged'; readonly temporary: FrozenOperationArtifactSnapshot }
    | { readonly state: 'committed'; readonly target: FrozenOperationArtifactSnapshot;
        readonly temporary: FrozenOperationArtifactSnapshot }
    | { readonly state: 'complete'; readonly target: FrozenOperationArtifactSnapshot };

type AuthorityCallback = () => FrozenBundleOperationAuthority;

interface OperationInput { plan: FrozenBundleEffectPlan; entryIndex: number;
    assertTargetBoundOperation: AuthorityCallback }
interface OperationContext extends OperationInput {
    entry: FrozenBundleEffectEntry;
    root: string; target: string; temporary: string; parent: string;
    authority: FrozenBundleOperationAuthority;
    parentIdentity: ReturnType<typeof capturePrivateFrozenDirectory>;
}
interface OpenedFile { descriptor: number; stat: fs.BigIntStats; content: Buffer }

function copyStat(stat: fs.BigIntStats): FrozenOperationFileStat {
    return Object.freeze(Object.fromEntries(
        STAT_KEYS.map((key) => [key, stat[key]]),
    )) as unknown as FrozenOperationFileStat;
}

function sameStat(left: FrozenOperationFileStat, right: FrozenOperationFileStat): boolean {
    return STAT_KEYS.every((key) => left[key] === right[key]);
}

function assertSameStat(expected: FrozenOperationFileStat, actual: FrozenOperationFileStat, label: string): void {
    if (!sameStat(expected, actual)) fail(`${label} changed before operation-bound recovery`);
}

function selectAuthority(plan: FrozenBundleEffectPlan, callback: AuthorityCallback): FrozenBundleOperationAuthority {
    if (typeof callback !== 'function') fail('frozen bundle operation authority assertion is required');
    const selected = callback();
    assertFrozenBundleOperationAuthority(plan, selected);
    return Object.freeze({ ...selected });
}

function assertSameAuthority(context: OperationContext): void {
    const actual = context.assertTargetBoundOperation();
    assertFrozenBundleOperationAuthority(context.plan, actual);
    if (canonicalJson(actual) !== canonicalJson(context.authority)) {
        fail('frozen bundle operation authority changed');
    }
}

function operationContext(input: OperationInput): OperationContext {
    assertFrozenBundleEffectPlan(input.plan);
    if (!Number.isSafeInteger(input.entryIndex)
        || input.entryIndex < 0 || input.entryIndex >= input.plan.entries.length) {
        fail('frozen bundle operation entry index is invalid');
    }
    const root = canonicalFrozenDirectory(input.plan.destination_root, 'frozen bundle operation destination');
    if (root !== input.plan.destination_root) {
        fail('frozen bundle operation destination is not canonical');
    }
    capturePrivateFrozenDirectory(root, 'frozen bundle operation destination');
    const entry = input.plan.entries[input.entryIndex];
    const target = frozenTarget(root, entry.path, 'frozen bundle operation target');
    assertPrivateExistingFrozenChain(root, target);
    const parent = path.dirname(target);
    const parentIdentity = capturePrivateFrozenDirectory(parent, 'frozen bundle operation parent');
    const authority = selectAuthority(input.plan, input.assertTargetBoundOperation);
    return { plan: input.plan, entryIndex: input.entryIndex, entry, root, target,
        temporary: atomicPrivateTemporaryPath(target, authority.owner_pid, authority.operation_id),
        parent, authority, parentIdentity,
        assertTargetBoundOperation: input.assertTargetBoundOperation,
    };
}

function assertParentIdentity(context: OperationContext): void {
    const actual = capturePrivateFrozenDirectory(context.parent, 'frozen bundle operation parent');
    for (const key of ['dev', 'ino', 'mode', 'nlink', 'uid', 'gid'] as const) {
        if (actual[key] !== context.parentIdentity[key]) fail('frozen bundle operation parent changed');
    }
}

function assertNoForeignTemporary(context: OperationContext): void {
    assertParentIdentity(context);
    const escaped = path.basename(context.target).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
        `^${escaped}\\.tmp-[1-9][0-9]*-`
        + '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$',
    );
    const expected = path.basename(context.temporary);
    const directory = fs.opendirSync(context.parent);
    let count = 0;
    try {
        for (;;) {
            const entry = directory.readSync();
            if (entry === null) break;
            count += 1;
            if (count > DIRECTORY_ENTRY_LIMIT) fail('frozen bundle operation directory exceeds its entry limit');
            if (pattern.test(entry.name) && entry.name !== expected) fail(
                'frozen bundle operation found a foreign temporary artifact',
            );
        }
    } finally {
        directory.closeSync();
    }
}

function assertRawStat(stat: fs.BigIntStats, label: string, maximumBytes: number): void {
    const uid = process.getuid?.();
    if (uid === undefined || !stat.isFile() || stat.isSymbolicLink()
        || stat.uid !== BigInt(uid) || stat.size < 0n
        || stat.size > BigInt(maximumBytes)) {
        fail(`${label} must be an owned bounded regular file`);
    }
}

function assertDescriptorPathIdentity(descriptor: fs.BigIntStats, linked: fs.BigIntStats, label: string): void {
    for (const key of STAT_KEYS) {
        if (descriptor[key] !== linked[key]) fail(`${label} identity changed`);
    }
}

function openFile(file: string, label: string, maximumBytes: number): OpenedFile {
    if (typeof fs.constants.O_NOFOLLOW !== 'number'
        || typeof fs.constants.O_NONBLOCK !== 'number') {
        fail('frozen bundle operation requires O_NOFOLLOW and O_NONBLOCK support');
    }
    const descriptor = fs.openSync(file,
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
        const before = fs.fstatSync(descriptor, { bigint: true });
        const linked = fs.lstatSync(file, { bigint: true });
        assertRawStat(before, label, maximumBytes);
        assertRawStat(linked, label, maximumBytes);
        assertDescriptorPathIdentity(before, linked, label);
        const content = Buffer.allocUnsafe(Number(before.size));
        let offset = 0;
        while (offset < content.length) {
            const count = fs.readSync(descriptor, content, offset, content.length - offset, offset);
            if (count === 0) fail(`${label} changed while it was read`);
            offset += count;
        }
        const after = fs.fstatSync(descriptor, { bigint: true });
        const finalPath = fs.lstatSync(file, { bigint: true });
        assertDescriptorPathIdentity(before, after, label);
        assertDescriptorPathIdentity(after, finalPath, label);
        return { descriptor, stat: after, content };
    } catch (error) {
        fs.closeSync(descriptor);
        throw error;
    }
}

function optionalOpen(file: string, label: string, maximumBytes: number): OpenedFile | undefined {
    if (optionalStat(file) === undefined) return undefined;
    try {
        return openFile(file, label, maximumBytes);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            fail(`${label} changed while its namespace was inspected`);
        }
        throw error;
    }
}

function closeAll(opened: Array<OpenedFile | undefined>): void {
    let failure: unknown;
    for (const file of opened) {
        if (file === undefined) continue;
        try {
            fs.closeSync(file.descriptor);
        } catch (error) {
            failure ??= error;
        }
    }
    if (failure !== undefined) throw failure;
}

function assertExactTarget(opened: OpenedFile, entry: FrozenBundleEffectEntry): void {
    if (opened.stat.nlink !== 1n && opened.stat.nlink !== 2n) {
        fail('frozen bundle operation target has an invalid link count');
    }
    if ((Number(opened.stat.mode) & 0o7777) !== entry.mode
        || opened.content.length !== entry.bytes
        || sha256(opened.content) !== entry.sha256) {
        fail('frozen bundle operation target does not match the exact effect entry');
    }
}

function assertPlausibleStaged(opened: OpenedFile, entry: FrozenBundleEffectEntry): void {
    const mode = Number(opened.stat.mode) & 0o7777;
    const privateCreationMode = opened.stat.size === 0n
        ? (mode & ~0o600) === 0
        : mode === 0o600;
    const finalMode = mode === entry.mode
        && opened.content.length === entry.bytes
        && sha256(opened.content) === entry.sha256;
    if (opened.stat.nlink !== 1n || (!privateCreationMode && !finalMode)) {
        fail('frozen bundle staged temporary is not a plausible partial write');
    }
}

function snapshotNamespace(context: OperationContext): FrozenOperationFileSnapshot {
    const target = optionalOpen(context.target, 'frozen bundle operation target', context.entry.bytes);
    const temporary = optionalOpen(
        context.temporary, 'frozen bundle operation temporary', context.entry.bytes,
    );
    try {
        if (target === undefined && temporary === undefined) {
            return Object.freeze({ state: 'absent' });
        }
        if (target === undefined && temporary !== undefined) {
            assertPlausibleStaged(temporary, context.entry);
            return Object.freeze({ state: 'staged', temporary: Object.freeze({
                stat: copyStat(temporary.stat), content: Buffer.from(temporary.content),
            }) });
        }
        if (target !== undefined && temporary === undefined) {
            assertExactTarget(target, context.entry);
            if (target.stat.nlink !== 1n) fail('frozen bundle complete target has an unexplained hard link');
            return Object.freeze({ state: 'complete', target: Object.freeze({
                stat: copyStat(target.stat), content: Buffer.from(target.content),
            }) });
        }
        if (target === undefined || temporary === undefined
            || target.stat.nlink !== 2n || temporary.stat.nlink !== 2n
            || !sameInode(target.stat, temporary.stat)) {
            fail('frozen bundle operation publication state is ambiguous');
        }
        assertExactTarget(target, context.entry);
        assertDescriptorPathIdentity(target.stat, temporary.stat, 'frozen bundle committed alias');
        return Object.freeze({ state: 'committed',
            target: Object.freeze({ stat: copyStat(target.stat), content: Buffer.from(target.content) }),
            temporary: Object.freeze({
                stat: copyStat(temporary.stat), content: Buffer.from(temporary.content),
            }),
        });
    } finally {
        closeAll([target, temporary]);
    }
}

function assertSameSnapshot(expected: FrozenOperationFileSnapshot, actual: FrozenOperationFileSnapshot): void {
    if (!expected || typeof expected !== 'object' || expected.state !== actual.state) {
        fail('frozen bundle operation publication changed before recovery');
    }
    if (expected.state === 'staged' && actual.state === 'staged') {
        assertSameStat(expected.temporary.stat, actual.temporary.stat, 'frozen bundle staged temporary');
        if (!expected.temporary.content.equals(actual.temporary.content)) {
            fail('frozen bundle staged temporary changed before recovery');
        }
    } else if (expected.state === 'complete' && actual.state === 'complete') {
        assertSameStat(expected.target.stat, actual.target.stat, 'frozen bundle complete target');
        if (!expected.target.content.equals(actual.target.content)) {
            fail('frozen bundle complete target changed before recovery');
        }
    } else if (expected.state === 'committed' && actual.state === 'committed') {
        assertSameStat(expected.target.stat, actual.target.stat, 'frozen bundle committed target');
        assertSameStat(expected.temporary.stat, actual.temporary.stat, 'frozen bundle committed temporary');
        if (!expected.target.content.equals(actual.target.content)
            || !expected.temporary.content.equals(actual.temporary.content)) {
            fail('frozen bundle committed target changed before recovery');
        }
    }
}

function inspectContext(context: OperationContext): FrozenOperationFileSnapshot {
    assertSameAuthority(context);
    assertNoForeignTemporary(context);
    const before = snapshotNamespace(context);
    assertSameAuthority(context);
    assertNoForeignTemporary(context);
    const after = snapshotNamespace(context);
    assertSameAuthority(context);
    assertSameSnapshot(before, after);
    return after;
}

export function inspectOperationBoundFrozenFile(input: OperationInput): FrozenOperationFileSnapshot {
    return inspectContext(operationContext(input));
}

function stableOutcome(context: OperationContext, expected: FrozenOperationFileSnapshot): FrozenOperationFileSnapshot {
    assertSameAuthority(context);
    fsyncDirectory(context.parent);
    assertSameAuthority(context);
    assertNoForeignTemporary(context);
    const actual = snapshotNamespace(context);
    assertSameAuthority(context);
    assertSameSnapshot(expected, actual);
    return actual;
}

function assertWriteDescriptor(descriptor: number, context: OperationContext,
    content: Buffer, links: 1n | 2n): fs.BigIntStats {
    const stat = fs.fstatSync(descriptor, { bigint: true });
    const linked = fs.lstatSync(links === 1n ? context.temporary : context.target, { bigint: true });
    assertRawStat(stat, 'frozen bundle operation write', context.entry.bytes);
    assertDescriptorPathIdentity(stat, linked, 'frozen bundle operation write');
    if (stat.nlink !== links || stat.size !== BigInt(content.length)
        || (Number(stat.mode) & 0o7777) !== context.entry.mode) {
        fail('frozen bundle operation write changed before publication');
    }
    const actual = Buffer.allocUnsafe(content.length);
    let offset = 0;
    while (offset < actual.length) {
        const count = fs.readSync(descriptor, actual, offset, actual.length - offset, offset);
        if (count === 0) fail('frozen bundle operation write changed while verified');
        offset += count;
    }
    if (!actual.equals(content)) fail('frozen bundle operation write bytes changed');
    return stat;
}

export function writeOperationBoundFrozenFile(input: OperationInput & { witnessRoot: string }): {
    sha256: string; created: boolean;
} {
    const context = operationContext(input);
    const witnessRoot = canonicalFrozenDirectory(input.witnessRoot, 'frozen bundle operation witness');
    if (witnessRoot === context.root
        || witnessRoot.startsWith(`${context.root}${path.sep}`)
        || context.root.startsWith(`${witnessRoot}${path.sep}`)) {
        fail('frozen bundle operation witness and destination must not overlap');
    }
    const witness = snapshotContainedFrozenFile(witnessRoot, context.entry.path,
        'frozen bundle operation witness', context.entry.bytes);
    if (witness.rawMode !== context.entry.mode
        || witness.content.length !== context.entry.bytes
        || sha256(witness.content) !== context.entry.sha256) {
        fail('frozen bundle operation witness does not match the exact effect entry');
    }
    const initial = inspectContext(context);
    if (initial.state === 'complete') {
        stableOutcome(context, initial);
        return { sha256: context.entry.sha256, created: false };
    }
    if (initial.state !== 'absent') {
        fail('frozen bundle operation publication requires explicit recovery');
    }
    assertSameAuthority(context);
    assertNoForeignTemporary(context);
    const descriptor = fs.openSync(context.temporary,
        fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
        0o600);
    try {
        fs.fchmodSync(descriptor, 0o600);
        let offset = 0;
        while (offset < witness.content.length) {
            const count = fs.writeSync(descriptor, witness.content, offset,
                witness.content.length - offset, offset);
            if (count < 1) fail('frozen bundle operation write did not make progress');
            offset += count;
        }
        fs.fsyncSync(descriptor);
        fs.fchmodSync(descriptor, context.entry.mode);
        fs.fsyncSync(descriptor);
        assertWriteDescriptor(descriptor, context, witness.content, 1n);
        assertSameAuthority(context);
        assertNoForeignTemporary(context);
        fs.linkSync(context.temporary, context.target);
        fsyncDirectory(context.parent);
        assertWriteDescriptor(descriptor, context, witness.content, 2n);
        const alias = fs.lstatSync(context.temporary, { bigint: true });
        const target = fs.lstatSync(context.target, { bigint: true });
        assertDescriptorPathIdentity(alias, target, 'frozen bundle committed alias');
        assertSameAuthority(context);
        fs.unlinkSync(context.temporary);
        assertSameAuthority(context);
        fsyncDirectory(context.parent);
        const final = fs.fstatSync(descriptor, { bigint: true });
        const finalTarget = fs.lstatSync(context.target, { bigint: true });
        assertDescriptorPathIdentity(final, finalTarget, 'frozen bundle operation target');
        if (final.nlink !== 1n || optionalStat(context.temporary) !== undefined) {
            fail('frozen bundle operation temporary survived publication');
        }
    } finally {
        fs.closeSync(descriptor);
    }
    const complete = inspectContext(context);
    if (complete.state !== 'complete') fail('frozen bundle operation did not commit completely');
    stableOutcome(context, complete);
    return { sha256: context.entry.sha256, created: true };
}

function unlinkStagedTemporary(
    context: OperationContext,
    expected: FrozenOperationArtifactSnapshot,
): void {
    const opened = openFile(
        context.temporary,
        'frozen bundle staged temporary',
        context.entry.bytes,
    );
    try {
        assertSameStat(expected.stat, copyStat(opened.stat), 'frozen bundle staged temporary');
        if (!expected.content.equals(opened.content)) {
            fail('frozen bundle staged temporary bytes changed before removal');
        }
        if (opened.stat.nlink !== 1n) fail('frozen bundle staged temporary link count changed');
        assertSameAuthority(context);
        assertNoForeignTemporary(context);
        fs.unlinkSync(context.temporary);
        assertSameAuthority(context);
        fsyncDirectory(context.parent);
        const unlinked = fs.fstatSync(opened.descriptor, { bigint: true });
        if (!sameInode(opened.stat, unlinked) || unlinked.nlink !== 0n
            || optionalStat(context.temporary) !== undefined) {
            fail('frozen bundle staged temporary changed during removal');
        }
    } finally {
        fs.closeSync(opened.descriptor);
    }
}

function normalizeCommittedAlias(context: OperationContext,
    expected: Extract<FrozenOperationFileSnapshot, { state: 'committed' }>): void {
    const target = openFile(context.target, 'frozen bundle committed target', context.entry.bytes);
    const temporary = openFile(context.temporary,
        'frozen bundle committed temporary', context.entry.bytes);
    try {
        assertSameStat(expected.target.stat, copyStat(target.stat), 'frozen bundle committed target');
        assertSameStat(expected.temporary.stat, copyStat(temporary.stat),
            'frozen bundle committed temporary');
        assertExactTarget(target, context.entry);
        if (!sameInode(target.stat, temporary.stat)
            || target.stat.nlink !== 2n || temporary.stat.nlink !== 2n) {
            fail('frozen bundle committed alias changed before normalization');
        }
        assertSameAuthority(context);
        assertNoForeignTemporary(context);
        fs.unlinkSync(context.temporary);
        assertSameAuthority(context);
        fsyncDirectory(context.parent);
        const heldTarget = fs.fstatSync(target.descriptor, { bigint: true });
        const heldTemporary = fs.fstatSync(temporary.descriptor, { bigint: true });
        const linkedTarget = fs.lstatSync(context.target, { bigint: true });
        if (!sameInode(target.stat, heldTarget) || !sameInode(target.stat, heldTemporary)
            || !sameInode(target.stat, linkedTarget)
            || heldTarget.nlink !== 1n || heldTemporary.nlink !== 1n
            || linkedTarget.nlink !== 1n || optionalStat(context.temporary) !== undefined) {
            fail('frozen bundle committed alias changed during normalization');
        }
    } finally {
        closeAll([target, temporary]);
    }
}

export function repairOperationBoundFrozenFilePublication(input: OperationInput & {
    expected: FrozenOperationFileSnapshot;
}): { outcome: 'absent' | 'complete';
    repaired: 'none' | 'staged-removed' | 'committed-normalized' } {
    const context = operationContext(input);
    const current = inspectContext(context);
    assertSameSnapshot(input.expected, current);
    if (current.state === 'absent' || current.state === 'complete') {
        stableOutcome(context, current);
        return { outcome: current.state, repaired: 'none' };
    }
    if (current.state === 'staged') {
        unlinkStagedTemporary(context, current.temporary);
        assertSameAuthority(context);
        const absent = inspectContext(context);
        if (absent.state !== 'absent') fail('frozen bundle staged recovery did not reach absence');
        stableOutcome(context, absent);
        return { outcome: 'absent', repaired: 'staged-removed' };
    }
    normalizeCommittedAlias(context, current);
    assertSameAuthority(context);
    const complete = inspectContext(context);
    if (complete.state !== 'complete') fail('frozen bundle committed recovery did not reach completeness');
    stableOutcome(context, complete);
    return { outcome: 'complete', repaired: 'committed-normalized' };
}
