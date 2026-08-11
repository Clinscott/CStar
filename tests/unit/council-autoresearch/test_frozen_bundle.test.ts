import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { ArtifactManifest, FrozenCouncilPacket } from '../../../src/core/council_autoresearch/index.js';
import {
    buildArtifactManifest,
    canonicalJson,
    freezeCouncilPacket,
    sha256,
    sha256File,
    stageFrozenFile,
    stageFrozenPacketBundle,
    verifyFrozenPacketBundle,
} from '../../../src/core/council_autoresearch/index.js';
import { bundleFixture, cleanup, temporary, writeJson } from './test_helpers.js';

type SpawnSync = typeof import('node:child_process').spawnSync;

let fixture: ReturnType<typeof bundleFixture>;
let packet: FrozenCouncilPacket;

before(() => {
    fixture = bundleFixture();
    packet = freezeCouncilPacket(fixture.packetInput);
});

after(cleanup);

function copySource(label: string): string {
    const source = path.join(temporary(label), 'source');
    fs.cpSync(fixture.bundle, source, { recursive: true, preserveTimestamps: true });
    return source;
}

function destination(label: string): string {
    return path.join(temporary(label), 'frozen');
}

function rehashPacket(input: FrozenCouncilPacket): FrozenCouncilPacket {
    const value = structuredClone(input);
    value.experiment_sha256 = sha256(canonicalJson({
        source_head: value.source_head,
        source_manifest_sha256: value.source_manifest_sha256,
        contract_manifest: value.contract_manifest.sha256,
        variants: [value.variants.A.sha256, value.variants.B.sha256].sort(),
        rubric_manifest: value.rubric_manifest.sha256,
        evidence_manifest: value.evidence_manifest.sha256,
    }));
    const { packet_sha256: _claimed, ...base } = value;
    value.packet_sha256 = sha256(canonicalJson(base));
    return value;
}

function interceptRemoteReads(): { calls: () => number; restore: () => void } {
    const mutable = createRequire(import.meta.url)('node:child_process') as { spawnSync: SpawnSync };
    const original = mutable.spawnSync;
    let calls = 0;
    mutable.spawnSync = ((command, args, options) => {
        if (command === '/usr/bin/git' && args?.includes('ls-remote')) {
            calls += 1;
            throw new Error('frozen bundle staging attempted a remote read');
        }
        return original(command, args, options);
    }) as SpawnSync;
    syncBuiltinESMExports();
    return {
        calls: () => calls,
        restore: () => {
            mutable.spawnSync = original;
            syncBuiltinESMExports();
        },
    };
}

describe('Council autoresearch frozen packet bundle', () => {
    it('stages the exact seven-manifest closure, replays exactly, and verifies offline', () => {
        const source = copySource('cstar-frozen-source-');
        const frozen = destination('cstar-frozen-destination-');
        const interception = interceptRemoteReads();
        try {
            stageFrozenPacketBundle({ packet, sourceRoot: source, destinationRoot: frozen });
            stageFrozenPacketBundle({ packet, sourceRoot: source, destinationRoot: frozen });
            verifyFrozenPacketBundle({ packet, bundleRoot: frozen });
        } finally {
            interception.restore();
        }
        assert.equal(interception.calls(), 0);
        assert.equal(fs.statSync(frozen).mode & 0o777, 0o700);
        assert.equal(fs.statSync(path.join(frozen, packet.contract_manifest.path)).mode & 0o777, 0o644);
        fs.rmSync(source, { recursive: true });
        assert.doesNotThrow(() => verifyFrozenPacketBundle({ packet, bundleRoot: frozen }));
    });

    it('completes an exact partial prefix and preserves conflicts or extras', () => {
        const source = copySource('cstar-frozen-partial-source-');
        const frozen = destination('cstar-frozen-partial-destination-');
        const relativePath = 'variant-a/content.txt';
        const content = fs.readFileSync(path.join(source, relativePath));
        const first = stageFrozenFile({
            sourceRoot: source,
            destinationRoot: frozen,
            relativePath,
            expected: { sha256: sha256(content), bytes: content.length, mode: 0o644 },
        });
        assert.equal(first.created, true);
        fs.chmodSync(path.join(frozen, relativePath), 0o4644);
        assert.throws(
            () => stageFrozenFile({
                sourceRoot: source,
                destinationRoot: frozen,
                relativePath,
                expected: { sha256: sha256(content), bytes: content.length, mode: 0o644 },
            }),
            /does not match the frozen expectation/i,
        );
        fs.chmodSync(path.join(frozen, relativePath), 0o644);
        stageFrozenPacketBundle({ packet, sourceRoot: source, destinationRoot: frozen });
        verifyFrozenPacketBundle({ packet, bundleRoot: frozen });
        const stagedVariant = path.join(frozen, relativePath);
        fs.chmodSync(stagedVariant, 0o600);
        assert.throws(
            () => verifyFrozenPacketBundle({ packet, bundleRoot: frozen }),
            /does not match the frozen expectation/i,
        );
        fs.chmodSync(stagedVariant, 0o644);
        fs.chmodSync(stagedVariant, 0o4644);
        assert.equal(fs.statSync(stagedVariant).mode & 0o7777, 0o4644);
        assert.throws(
            () => verifyFrozenPacketBundle({ packet, bundleRoot: frozen }),
            /does not match the frozen expectation/i,
        );
        fs.chmodSync(stagedVariant, 0o644);

        const conflict = destination('cstar-frozen-conflict-');
        const conflictFile = path.join(conflict, relativePath);
        fs.mkdirSync(path.dirname(conflictFile), { recursive: true, mode: 0o700 });
        fs.writeFileSync(conflictFile, 'preplanted conflict\n', { mode: 0o644 });
        assert.throws(
            () => stageFrozenPacketBundle({ packet, sourceRoot: source, destinationRoot: conflict }),
            /does not match the frozen expectation/i,
        );
        assert.equal(fs.readFileSync(conflictFile, 'utf8'), 'preplanted conflict\n');
        assert.equal(fs.existsSync(path.join(conflict, packet.contract_manifest.path)), false);

        const extra = destination('cstar-frozen-extra-');
        fs.mkdirSync(extra, { recursive: true, mode: 0o700 });
        fs.writeFileSync(path.join(extra, 'unexpected.txt'), 'extra\n', { mode: 0o644 });
        assert.throws(
            () => stageFrozenPacketBundle({ packet, sourceRoot: source, destinationRoot: extra }),
            /unexpected file/i,
        );
    });

    it('rejects outer, inner, entry, semantic-role, and case-collision drift', () => {
        const outer = copySource('cstar-frozen-outer-drift-');
        fs.appendFileSync(path.join(outer, packet.contract_manifest.path), '\n');
        assert.throws(
            () => stageFrozenPacketBundle({
                packet, sourceRoot: outer, destinationRoot: destination('cstar-frozen-outer-out-'),
            }),
            /contract_manifest file hash mismatch/i,
        );

        const inner = copySource('cstar-frozen-inner-drift-');
        const manifestFile = path.join(inner, packet.contract_manifest.path);
        const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as ArtifactManifest;
        manifest.entries[0].bytes += 1;
        writeJson(manifestFile, manifest);
        const innerPacket = structuredClone(packet);
        innerPacket.contract_manifest.sha256 = sha256File(manifestFile);
        assert.throws(
            () => stageFrozenPacketBundle({
                packet: rehashPacket(innerPacket),
                sourceRoot: inner,
                destinationRoot: destination('cstar-frozen-inner-out-'),
            }),
            /manifest is invalid/i,
        );

        const entry = copySource('cstar-frozen-entry-drift-');
        fs.appendFileSync(path.join(entry, 'contract/content.txt'), 'changed\n');
        assert.throws(
            () => stageFrozenPacketBundle({
                packet, sourceRoot: entry, destinationRoot: destination('cstar-frozen-entry-out-'),
            }),
            /manifest is invalid/i,
        );

        const overlapPacket = structuredClone(packet);
        overlapPacket.variants.B = { ...overlapPacket.variants.A };
        assert.throws(
            () => stageFrozenPacketBundle({
                packet: rehashPacket(overlapPacket),
                sourceRoot: copySource('cstar-frozen-overlap-source-'),
                destinationRoot: destination('cstar-frozen-overlap-out-'),
            }),
            /semantic roles overlap/i,
        );

        const collision = copySource('cstar-frozen-case-source-');
        fs.mkdirSync(path.join(collision, 'Variant-A'));
        fs.writeFileSync(path.join(collision, 'Variant-A/content.txt'), 'different role\n');
        const variantBManifest = buildArtifactManifest({
            root: collision,
            rootLabel: 'variant-b',
            includedPaths: ['Variant-A'],
        });
        const variantBManifestFile = path.join(collision, packet.variants.B.path);
        writeJson(variantBManifestFile, variantBManifest);
        const collisionPacket = structuredClone(packet);
        collisionPacket.variants.B.sha256 = sha256File(variantBManifestFile);
        assert.throws(
            () => stageFrozenPacketBundle({
                packet: rehashPacket(collisionPacket),
                sourceRoot: collision,
                destinationRoot: destination('cstar-frozen-case-out-'),
            }),
            /path or case collision/i,
        );

        const empty = copySource('cstar-frozen-empty-path-');
        fs.mkdirSync(path.join(empty, 'empty'));
        const emptyManifestFile = path.join(empty, packet.contract_manifest.path);
        writeJson(emptyManifestFile, buildArtifactManifest({
            root: empty,
            rootLabel: 'contract',
            includedPaths: ['contract', 'empty'],
        }));
        const emptyPacket = structuredClone(packet);
        emptyPacket.contract_manifest.sha256 = sha256File(emptyManifestFile);
        const emptyDestination = destination('cstar-frozen-empty-out-');
        assert.throws(
            () => stageFrozenPacketBundle({
                packet: rehashPacket(emptyPacket), sourceRoot: empty, destinationRoot: emptyDestination,
            }),
            /empty included path/i,
        );
        assert.equal(fs.existsSync(emptyDestination), false);

        const deepPacket = structuredClone(packet);
        deepPacket.contract_manifest.path = `${'deep/'.repeat(33)}manifest.json`;
        const deepDestination = destination('cstar-frozen-deep-out-');
        assert.throws(
            () => stageFrozenPacketBundle({
                packet: rehashPacket(deepPacket),
                sourceRoot: copySource('cstar-frozen-deep-source-'),
                destinationRoot: deepDestination,
            }),
            /bounded canonical relative path/i,
        );
        assert.equal(fs.existsSync(deepDestination), false);
    });

    it('rejects links, private-destination violations, and overlapping roots', () => {
        const hardlinked = copySource('cstar-frozen-hardlink-source-');
        const contract = path.join(hardlinked, 'contract/content.txt');
        const alias = path.join(hardlinked, 'contract/alias.txt');
        fs.linkSync(contract, alias);
        assert.throws(
            () => stageFrozenPacketBundle({
                packet,
                sourceRoot: hardlinked,
                destinationRoot: destination('cstar-frozen-hardlink-out-'),
            }),
            /hard-link|single-link|manifest is invalid/i,
        );

        const symlinked = copySource('cstar-frozen-symlink-source-');
        fs.renameSync(path.join(symlinked, 'variant-a'), path.join(symlinked, 'variant-a-real'));
        fs.symlinkSync('variant-a-real', path.join(symlinked, 'variant-a'), 'dir');
        assert.throws(
            () => stageFrozenPacketBundle({
                packet,
                sourceRoot: symlinked,
                destinationRoot: destination('cstar-frozen-symlink-out-'),
            }),
            /symbolic link|manifest is invalid/i,
        );

        const fifoSource = copySource('cstar-frozen-fifo-source-');
        const fifoManifest = path.join(fifoSource, packet.contract_manifest.path);
        fs.unlinkSync(fifoManifest);
        assert.equal(spawnSync('/usr/bin/mkfifo', [fifoManifest]).status, 0);
        assert.throws(
            () => stageFrozenPacketBundle({
                packet,
                sourceRoot: fifoSource,
                destinationRoot: destination('cstar-frozen-fifo-source-out-'),
            }),
            /exact 1-link regular file/i,
        );

        const source = copySource('cstar-frozen-destination-source-');
        const publicDestination = destination('cstar-frozen-public-out-');
        fs.mkdirSync(publicDestination, { mode: 0o755 });
        assert.throws(
            () => stageFrozenPacketBundle({
                packet, sourceRoot: source, destinationRoot: publicDestination,
            }),
            /private real directory/i,
        );

        const nested = path.join(source, 'nested-frozen');
        assert.throws(
            () => stageFrozenPacketBundle({ packet, sourceRoot: source, destinationRoot: nested }),
            /must not overlap/i,
        );
        assert.equal(fs.existsSync(nested), false);

        const reverseRoot = temporary('cstar-frozen-reverse-overlap-');
        const reverseSource = path.join(reverseRoot, 'source');
        fs.cpSync(fixture.bundle, reverseSource, { recursive: true, preserveTimestamps: true });
        assert.throws(
            () => stageFrozenPacketBundle({
                packet, sourceRoot: reverseSource, destinationRoot: reverseRoot,
            }),
            /must not overlap/i,
        );

        const unsafeParent = temporary('cstar-frozen-unsafe-parent-');
        fs.chmodSync(unsafeParent, 0o777);
        const privatelyModeled = path.join(unsafeParent, 'frozen');
        fs.mkdirSync(privatelyModeled, { mode: 0o700 });
        assert.throws(
            () => stageFrozenPacketBundle({
                packet, sourceRoot: source, destinationRoot: privatelyModeled,
            }),
            /ancestor is renameable by another user/i,
        );

        const relocated = destination('cstar-frozen-relocated-');
        stageFrozenPacketBundle({ packet, sourceRoot: source, destinationRoot: relocated });
        const unsafeVerifyParent = temporary('cstar-frozen-unsafe-verify-');
        fs.chmodSync(unsafeVerifyParent, 0o777);
        const unsafeRelocated = path.join(unsafeVerifyParent, 'frozen');
        fs.renameSync(relocated, unsafeRelocated);
        assert.throws(
            () => verifyFrozenPacketBundle({ packet, bundleRoot: unsafeRelocated }),
            /ancestor is renameable by another user/i,
        );

        const redirectedDestination = destination('cstar-frozen-redirected-out-');
        const outside = temporary('cstar-frozen-redirected-outside-');
        fs.mkdirSync(redirectedDestination, { mode: 0o700 });
        fs.symlinkSync(outside, path.join(redirectedDestination, 'manifests'), 'dir');
        const outsideTarget = path.join(outside, path.basename(packet.contract_manifest.path));
        const outsideAlias = `${outsideTarget}.tmp-${process.pid}-${randomUUID()}`;
        fs.writeFileSync(outsideTarget, 'outside target\n', { mode: 0o644 });
        fs.linkSync(outsideTarget, outsideAlias);
        assert.throws(
            () => stageFrozenPacketBundle({
                packet, sourceRoot: source, destinationRoot: redirectedDestination,
            }),
            /real directory|symbolic-link/i,
        );
        assert.equal(fs.existsSync(outsideTarget), true);
        assert.equal(fs.existsSync(outsideAlias), true);
        assert.equal(fs.statSync(outsideTarget).nlink, 2);

        const specialDestination = destination('cstar-frozen-special-out-');
        fs.mkdirSync(specialDestination, { mode: 0o700 });
        const special = path.join(specialDestination, 'unexpected-fifo');
        assert.equal(spawnSync('/usr/bin/mkfifo', [special]).status, 0);
        assert.throws(
            () => stageFrozenPacketBundle({
                packet, sourceRoot: source, destinationRoot: specialDestination,
            }),
            /special file/i,
        );
    });

    it('repairs only a committed immutable alias and detects parent-chain drift', () => {
        const source = copySource('cstar-frozen-repair-source-');
        const frozen = destination('cstar-frozen-repair-out-');
        stageFrozenPacketBundle({ packet, sourceRoot: source, destinationRoot: frozen });
        const target = path.join(frozen, packet.contract_manifest.path);
        const alias = `${target}.tmp-${process.pid}-${randomUUID()}`;
        fs.linkSync(target, alias);
        const unexpected = path.join(frozen, 'unexpected-before-repair.txt');
        fs.writeFileSync(unexpected, 'unexpected\n', { mode: 0o644 });
        assert.throws(
            () => stageFrozenPacketBundle({ packet, sourceRoot: source, destinationRoot: frozen }),
            /unexpected file/i,
        );
        assert.equal(fs.existsSync(alias), true);
        assert.equal(fs.statSync(target).nlink, 2);
        fs.unlinkSync(unexpected);
        stageFrozenPacketBundle({ packet, sourceRoot: source, destinationRoot: frozen });
        assert.equal(fs.existsSync(alias), false);
        verifyFrozenPacketBundle({ packet, bundleRoot: frozen });

        const wrong = destination('cstar-frozen-wrong-alias-');
        const wrongTarget = path.join(wrong, packet.contract_manifest.path);
        const wrongAlias = `${wrongTarget}.tmp-${process.pid}-${randomUUID()}`;
        fs.mkdirSync(path.dirname(wrongTarget), { recursive: true, mode: 0o700 });
        fs.writeFileSync(wrongTarget, 'wrong bytes\n', { mode: 0o644 });
        fs.linkSync(wrongTarget, wrongAlias);
        assert.throws(
            () => stageFrozenPacketBundle({ packet, sourceRoot: source, destinationRoot: wrong }),
            /does not match the frozen expectation/i,
        );
        assert.equal(fs.existsSync(wrongAlias), true);
        assert.equal(fs.statSync(wrongTarget).nlink, 2);

        const modeSource = copySource('cstar-frozen-source-mode-');
        fs.chmodSync(path.join(modeSource, 'contract/content.txt'), 0o600);
        assert.throws(
            () => stageFrozenPacketBundle({
                packet,
                sourceRoot: modeSource,
                destinationRoot: destination('cstar-frozen-source-mode-out-'),
            }),
            /does not match the frozen expectation/i,
        );

        const orphanSource = copySource('cstar-frozen-orphan-source-');
        const orphan = destination('cstar-frozen-orphan-out-');
        const orphanFile = path.join(
            orphan,
            `${packet.contract_manifest.path}.tmp-${process.pid}-${randomUUID()}`,
        );
        fs.mkdirSync(path.dirname(orphanFile), { recursive: true, mode: 0o700 });
        fs.writeFileSync(orphanFile, 'orphan\n', { mode: 0o644 });
        assert.throws(
            () => stageFrozenPacketBundle({ packet, sourceRoot: orphanSource, destinationRoot: orphan }),
            /unexpected file/i,
        );

        const raced = copySource('cstar-frozen-race-source-');
        const raceDestination = destination('cstar-frozen-race-out-');
        const mutableFs = createRequire(import.meta.url)('node:fs') as {
            readSync: typeof fs.readSync;
        };
        const originalReadSync = mutableFs.readSync;
        let mutated = false;
        mutableFs.readSync = ((...args: Parameters<typeof fs.readSync>) => {
            const openedPath = fs.readlinkSync(`/proc/self/fd/${String(args[0])}`);
            if (!mutated && openedPath.startsWith(`${path.join(raced, 'manifests')}${path.sep}`)) {
                mutated = true;
                const manifests = path.join(raced, 'manifests');
                const displaced = path.join(raced, 'manifests-displaced');
                fs.renameSync(manifests, displaced);
                fs.mkdirSync(manifests, { mode: 0o700 });
                for (const name of fs.readdirSync(displaced)) {
                    fs.renameSync(path.join(displaced, name), path.join(manifests, name));
                }
            }
            return originalReadSync(...args);
        }) as typeof fs.readSync;
        syncBuiltinESMExports();
        let raceError: unknown;
        try {
            try {
                stageFrozenPacketBundle({
                    packet,
                    sourceRoot: raced,
                    destinationRoot: raceDestination,
                });
            } catch (error) {
                raceError = error;
            }
        } finally {
            mutableFs.readSync = originalReadSync;
            syncBuiltinESMExports();
        }
        assert.equal(mutated, true);
        assert.match(String(raceError), /changed while it was (?:being )?read/i);
    });
});
