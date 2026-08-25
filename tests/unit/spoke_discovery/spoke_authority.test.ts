import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    establishAuthority,
    verifyMountToken,
    IDENTITY_FILE,
    SPOKE_AUTHORITY_WRITE_RETIRED,
} from '../../../src/node/core/spokes/spoke_authority.ts';
import { SPOKE_PROFILE_DIR } from '../../../src/node/core/spokes/spoke_projector.ts';

function root(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'spoke-authority-'));
}

function writeIdentity(spokeRoot: string, token: string): string {
    const dir = path.join(spokeRoot, SPOKE_PROFILE_DIR);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, IDENTITY_FILE);
    fs.writeFileSync(file, JSON.stringify({ mount_token: token }), { mode: 0o600 });
    return file;
}

test('establishAuthority fails before writing contract files', () => {
    const spokeRoot = root();
    try {
        assert.throws(
            () => establishAuthority({
                slug: 'synthetic',
                rootPath: spokeRoot,
                hubRepoId: 'repo:synthetic',
                hubRoot: '/tmp/hub',
                hubKernelVersion: 'test',
                trustLevel: 'trusted',
                writePolicy: 'read_write',
            }),
            new RegExp(SPOKE_AUTHORITY_WRITE_RETIRED),
        );
        assert.strictEqual(fs.existsSync(path.join(spokeRoot, SPOKE_PROFILE_DIR)), false);
    } finally {
        fs.rmSync(spokeRoot, { recursive: true, force: true });
    }
});

test('verifyMountToken reports only value-free binding verdicts', () => {
    const spokeRoot = root();
    const secret = 'synthetic-secret-token';
    try {
        writeIdentity(spokeRoot, secret);
        const ok = verifyMountToken(spokeRoot, secret);
        const mismatch = verifyMountToken(spokeRoot, 'different-token');
        const hallMissing = verifyMountToken(spokeRoot, null);
        assert.strictEqual(ok.verdict, 'ok');
        assert.strictEqual(mismatch.verdict, 'mismatch');
        assert.strictEqual(hallMissing.verdict, 'hall_missing');
        for (const result of [ok, mismatch, hallMissing]) {
            assert.doesNotMatch(JSON.stringify(result), /synthetic-secret-token|different-token/);
            assert.doesNotMatch(JSON.stringify(result), new RegExp(spokeRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        }
    } finally {
        fs.rmSync(spokeRoot, { recursive: true, force: true });
    }
});

test('verifyMountToken distinguishes absent legacy bindings without accepting them', () => {
    const spokeRoot = root();
    try {
        assert.strictEqual(verifyMountToken(spokeRoot, null).verdict, 'unproven');
        assert.strictEqual(verifyMountToken(spokeRoot, 'hall-token').verdict, 'identity_missing');
    } finally {
        fs.rmSync(spokeRoot, { recursive: true, force: true });
    }
});

test('verifyMountToken rejects symlink and hardlink identity files', () => {
    for (const kind of ['symlink', 'hardlink'] as const) {
        const spokeRoot = root();
        const outside = path.join(spokeRoot, 'outside.json');
        const identity = path.join(spokeRoot, SPOKE_PROFILE_DIR, IDENTITY_FILE);
        try {
            fs.mkdirSync(path.dirname(identity), { recursive: true });
            fs.writeFileSync(outside, JSON.stringify({ mount_token: 'token' }));
            if (kind === 'symlink') fs.symlinkSync(outside, identity);
            else fs.linkSync(outside, identity);
            assert.strictEqual(verifyMountToken(spokeRoot, 'token').verdict, 'identity_invalid');
        } finally {
            fs.rmSync(spokeRoot, { recursive: true, force: true });
        }
    }
});

test('verifyMountToken rejects private home roots before an identity read', () => {
    const result = verifyMountToken(path.join(os.homedir(), '.hermes'), 'synthetic');
    assert.strictEqual(result.verdict, 'unsafe_root');
    assert.strictEqual(result.identity_present, false);
});
