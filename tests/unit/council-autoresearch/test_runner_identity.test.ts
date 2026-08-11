import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    type ArtifactManifest,
    attestRunnerCheckout,
    verifyExecutingRunnerPublication,
    verifyRunnerCheckoutLocally,
    verifyRunnerCheckoutPublication,
} from '../../../src/core/council_autoresearch/index.js';
import { bundleFixture, cleanup, git } from './test_helpers.js';

type SpawnSync = typeof import('node:child_process').spawnSync;

afterEach(cleanup);

function runnerManifest(fixture: ReturnType<typeof bundleFixture>): ArtifactManifest {
    return JSON.parse(fs.readFileSync(path.join(
        fixture.bundle,
        fixture.packetInput.runnerPublication.manifest.path,
    ), 'utf8')) as ArtifactManifest;
}

function interceptRemoteVerification(onRemote: () => void): () => void {
    const mutable = createRequire(import.meta.url)('node:child_process') as {
        spawnSync: SpawnSync;
    };
    const original = mutable.spawnSync;
    mutable.spawnSync = ((
        command: Parameters<SpawnSync>[0],
        args?: Parameters<SpawnSync>[1],
        options?: Parameters<SpawnSync>[2],
    ) => {
        if (command === '/usr/bin/git' && args?.includes('ls-remote')) onRemote();
        return original(command, args, options);
    }) as SpawnSync;
    syncBuiltinESMExports();
    return () => {
        mutable.spawnSync = original;
        syncBuiltinESMExports();
    };
}

describe('Council autoresearch runner checkout identity', () => {
    it('binds the exact checkout, checkpoint, and bundle with an offline recheck', () => {
        const fixture = bundleFixture();
        const manifest = runnerManifest(fixture);
        const binding = fixture.packetInput.runnerPublication;
        const local = attestRunnerCheckout(fixture.packetInput.runnerPublicationRepoRoot);
        assert.equal(local.head, binding.checkpoint.commit);
        assert.deepEqual(local.required_files, binding.checkpoint.required_files);

        let remoteAttempted = false;
        const restore = interceptRemoteVerification(() => {
            remoteAttempted = true;
            throw new Error('offline verification attempted network access');
        });
        try {
            assert.doesNotThrow(() => verifyRunnerCheckoutLocally({
                binding,
                bundleManifest: manifest,
                executionRepoRoot: fixture.packetInput.runnerPublicationRepoRoot,
            }));
        } finally {
            restore();
        }
        assert.equal(remoteAttempted, false);
        assert.doesNotThrow(() => verifyRunnerCheckoutPublication({
            binding,
            bundleManifest: manifest,
            executionRepoRoot: fixture.packetInput.runnerPublicationRepoRoot,
            publicationRepoRoot: fixture.packetInput.runnerPublicationRepoRoot,
        }));

        fs.writeFileSync(path.join(
            fixture.packetInput.runnerPublicationRepoRoot,
            'src/core/council_autoresearch/package.json',
        ), '{"type":"commonjs"}\n');
        assert.throws(() => verifyRunnerCheckoutLocally({
            binding,
            bundleManifest: manifest,
            executionRepoRoot: fixture.packetInput.runnerPublicationRepoRoot,
        }), /resolution control file is forbidden/i);
    });

    it('rejects bundle drift and a different same-tree checkout HEAD', () => {
        const fixture = bundleFixture();
        const manifest = runnerManifest(fixture);
        const binding = fixture.packetInput.runnerPublication;
        const repo = fixture.packetInput.runnerPublicationRepoRoot;
        const drifted = structuredClone(manifest);
        drifted.entries[0].bytes += 1;
        assert.throws(() => verifyRunnerCheckoutLocally({
            binding,
            bundleManifest: drifted,
            executionRepoRoot: repo,
        }), /checkpoint and bundle do not bind/i);

        const differentHead = git(repo, [
            'commit-tree', `${binding.checkpoint.commit}^{tree}`,
            '-p', binding.checkpoint.commit,
            '-m', 'same tree, different identity',
        ]);
        git(repo, ['update-ref', 'HEAD', differentHead, binding.checkpoint.commit]);
        assert.throws(() => verifyRunnerCheckoutLocally({
            binding,
            bundleManifest: manifest,
            executionRepoRoot: repo,
        }), /checkpoint and bundle do not bind/i);
    });

    it('rejects remote ref drift while the attested local checkout stays pinned', () => {
        const fixture = bundleFixture();
        const manifest = runnerManifest(fixture);
        const binding = fixture.packetInput.runnerPublication;
        const repo = fixture.packetInput.runnerPublicationRepoRoot;
        const remoteHead = git(repo, [
            'commit-tree', `${binding.checkpoint.commit}^{tree}`,
            '-p', binding.checkpoint.commit,
            '-m', 'advance remote only',
        ]);
        git(repo, ['push', 'origin', `${remoteHead}:refs/heads/${binding.checkpoint.branch}`]);

        assert.throws(() => verifyRunnerCheckoutPublication({
            binding,
            bundleManifest: manifest,
            executionRepoRoot: repo,
            publicationRepoRoot: repo,
        }), /remote branch does not resolve to the required commit/i);
        assert.equal(git(repo, ['rev-parse', 'HEAD']), binding.checkpoint.commit);
    });

    it('re-attests locally after remote verification and rejects a caller-spoofed root', () => {
        const fixture = bundleFixture();
        const manifest = runnerManifest(fixture);
        const binding = fixture.packetInput.runnerPublication;
        const repo = fixture.packetInput.runnerPublicationRepoRoot;
        const driftTarget = path.join(repo, 'package.json');
        let remoteCalls = 0;
        const restore = interceptRemoteVerification(() => {
            remoteCalls += 1;
            fs.appendFileSync(driftTarget, '\n');
        });
        try {
            assert.throws(() => verifyRunnerCheckoutPublication({
                binding,
                bundleManifest: manifest,
                executionRepoRoot: repo,
                publicationRepoRoot: repo,
            }), /worktree|raw worktree bytes differ from HEAD/i);
        } finally {
            restore();
        }
        assert.equal(remoteCalls, 1);

        assert.throws(() => verifyExecutingRunnerPublication({
            binding,
            bundleManifest: manifest,
            publicationRepoRoot: repo,
        }), /not the executing checkout/i);
    });
});
