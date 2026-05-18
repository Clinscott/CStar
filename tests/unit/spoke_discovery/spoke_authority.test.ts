import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
    establishAuthority,
    verifyMountToken,
    SPOKE_CONTRACT_VERSION,
    IDENTITY_FILE,
    CSTAR_CONTRACT_FILE,
    CAPABILITIES_FILE,
    INTAKE_FILE,
    HUB_ACK_FILE,
    type SpokeIdentity,
    type SpokeHubAck,
} from '../../../src/node/core/spokes/spoke_authority.ts';
import {
    projectSpoke,
    SPOKE_PROFILE_DIR,
} from '../../../src/node/core/spokes/spoke_projector.ts';

function mkdtemp(prefix: string): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

function readJson<T>(file: string): T {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
}

const HUB_KERNEL = '0.0.0-test';

test('establishAuthority writes all five contract files into <spoke>/.cstar/', () => {
    const root = mkdtemp('auth-basic');
    try {
        const r = establishAuthority({
            slug: 'demo',
            rootPath: root,
            hubRepoId: 'repo:hub',
            hubRoot: '/tmp/hub',
            hubKernelVersion: HUB_KERNEL,
            trustLevel: 'trusted',
            writePolicy: 'read_write',
        });
        const dir = path.join(root, SPOKE_PROFILE_DIR);
        for (const fn of [IDENTITY_FILE, CSTAR_CONTRACT_FILE, CAPABILITIES_FILE, INTAKE_FILE, HUB_ACK_FILE]) {
            assert.ok(fs.existsSync(path.join(dir, fn)), `missing ${fn}`);
        }
        const identity = readJson<SpokeIdentity>(r.files.identity);
        assert.strictEqual(identity.schema, 'cstar.spoke.identity');
        assert.strictEqual(identity.contract_version, SPOKE_CONTRACT_VERSION);
        assert.strictEqual(identity.slug, 'demo');
        assert.strictEqual(identity.hub_repo_id, 'repo:hub');
        assert.match(identity.mount_token, /^[0-9a-f-]{36}$/);
        assert.strictEqual(r.rotated, true, 'fresh mount must rotate (mint a new token)');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('establishAuthority preserves mount_token when re-run on the same spoke', () => {
    const root = mkdtemp('auth-preserve');
    try {
        const first = establishAuthority({
            slug: 'demo',
            rootPath: root,
            hubRepoId: 'repo:hub',
            hubRoot: '/tmp/hub',
            hubKernelVersion: HUB_KERNEL,
            trustLevel: 'trusted',
            writePolicy: 'read_write',
        });
        const second = establishAuthority({
            slug: 'demo',
            rootPath: root,
            hubRepoId: 'repo:hub',
            hubRoot: '/tmp/hub',
            hubKernelVersion: HUB_KERNEL,
            trustLevel: 'trusted',
            writePolicy: 'read_write',
        });
        assert.strictEqual(first.identity.mount_token, second.identity.mount_token);
        assert.strictEqual(second.rotated, false);
        assert.strictEqual(second.identity.registered_at, first.identity.registered_at, 'registered_at must be preserved');
        assert.notStrictEqual(second.identity.last_renewed_at, undefined);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('establishAuthority rehydrates mount_token from existingHallToken when IDENTITY.json is absent', () => {
    const root = mkdtemp('auth-rehydrate');
    try {
        const hallToken = '11111111-2222-3333-4444-555555555555';
        const r = establishAuthority({
            slug: 'demo',
            rootPath: root,
            hubRepoId: 'repo:hub',
            hubRoot: '/tmp/hub',
            hubKernelVersion: HUB_KERNEL,
            trustLevel: 'trusted',
            writePolicy: 'read_write',
            existingHallToken: hallToken,
        });
        assert.strictEqual(r.identity.mount_token, hallToken);
        assert.strictEqual(r.rotated, false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('establishAuthority rotates mount_token when rotateToken=true', () => {
    const root = mkdtemp('auth-rotate');
    try {
        const first = establishAuthority({
            slug: 'demo',
            rootPath: root,
            hubRepoId: 'repo:hub',
            hubRoot: '/tmp/hub',
            hubKernelVersion: HUB_KERNEL,
            trustLevel: 'trusted',
            writePolicy: 'read_write',
            now: new Date('2026-01-01T00:00:00Z'),
        });
        const second = establishAuthority({
            slug: 'demo',
            rootPath: root,
            hubRepoId: 'repo:hub',
            hubRoot: '/tmp/hub',
            hubKernelVersion: HUB_KERNEL,
            trustLevel: 'trusted',
            writePolicy: 'read_write',
            rotateToken: true,
            now: new Date('2026-02-01T00:00:00Z'),
        });
        assert.notStrictEqual(first.identity.mount_token, second.identity.mount_token);
        assert.strictEqual(second.rotated, true);
        assert.notStrictEqual(second.identity.registered_at, first.identity.registered_at, 'rotation resets registered_at');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('HUB_ACK contract_sha256 matches the on-disk contract files', () => {
    const root = mkdtemp('auth-huback');
    try {
        const r = establishAuthority({
            slug: 'demo',
            rootPath: root,
            hubRepoId: 'repo:hub',
            hubRoot: '/tmp/hub',
            hubKernelVersion: HUB_KERNEL,
            trustLevel: 'trusted',
            writePolicy: 'read_write',
        });
        const ack = readJson<SpokeHubAck>(r.files.hub_ack);
        const sha = (file: string): string => crypto.createHash('sha256').update(fs.readFileSync(file, 'utf-8'), 'utf-8').digest('hex');
        assert.strictEqual(ack.contract_sha256.identity, sha(r.files.identity));
        assert.strictEqual(ack.contract_sha256.cstar_contract, sha(r.files.cstar_contract));
        assert.strictEqual(ack.contract_sha256.capabilities, sha(r.files.capabilities));
        assert.strictEqual(ack.contract_sha256.intake, sha(r.files.intake));
        assert.strictEqual(ack.mount_token, r.identity.mount_token);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('INTAKE.md content reflects write_policy and trust_level', () => {
    const root1 = mkdtemp('auth-intake-rw');
    const root2 = mkdtemp('auth-intake-ro');
    const root3 = mkdtemp('auth-intake-q');
    try {
        const rw = establishAuthority({ slug: 'a', rootPath: root1, hubRepoId: 'r', hubRoot: '/h', hubKernelVersion: HUB_KERNEL, trustLevel: 'trusted', writePolicy: 'read_write' });
        const ro = establishAuthority({ slug: 'a', rootPath: root2, hubRepoId: 'r', hubRoot: '/h', hubKernelVersion: HUB_KERNEL, trustLevel: 'trusted', writePolicy: 'read_only' });
        const q = establishAuthority({ slug: 'a', rootPath: root3, hubRepoId: 'r', hubRoot: '/h', hubKernelVersion: HUB_KERNEL, trustLevel: 'quarantined', writePolicy: 'read_write' });
        const rwIntake = fs.readFileSync(rw.files.intake, 'utf-8');
        const roIntake = fs.readFileSync(ro.files.intake, 'utf-8');
        const qIntake = fs.readFileSync(q.files.intake, 'utf-8');
        assert.match(rwIntake, /READ-WRITE/);
        assert.match(rwIntake, /Sterling Mandate/);
        assert.match(roIntake, /READ-ONLY/);
        assert.doesNotMatch(roIntake, /Sterling Mandate/);
        assert.match(qIntake, /QUARANTINED/);
    } finally {
        fs.rmSync(root1, { recursive: true, force: true });
        fs.rmSync(root2, { recursive: true, force: true });
        fs.rmSync(root3, { recursive: true, force: true });
    }
});

test('CAPABILITIES.md enumerates the projection capabilities', () => {
    const root = mkdtemp('auth-caps');
    try {
        // Seed a skill so the projector finds a capability.
        fs.mkdirSync(path.join(root, '.agents', 'skills', 'echo'), { recursive: true });
        fs.writeFileSync(path.join(root, '.agents', 'skills', 'echo', 'SKILL.md'), `---
name: echo
description: Echo input back
tier: SKILL
risk: low
---
# Echo`);
        const projectionResult = projectSpoke({ slug: 'caps', rootPath: root });
        const r = establishAuthority({
            slug: 'caps',
            rootPath: root,
            hubRepoId: 'repo:hub',
            hubRoot: '/tmp/hub',
            hubKernelVersion: HUB_KERNEL,
            trustLevel: 'trusted',
            writePolicy: 'read_write',
            projection: projectionResult.projection,
        });
        const caps = fs.readFileSync(r.files.capabilities, 'utf-8');
        assert.match(caps, /caps:echo/);
        assert.match(caps, /Echo input back/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('verifyMountToken — ok when both sides match', () => {
    const root = mkdtemp('verify-ok');
    try {
        const r = establishAuthority({
            slug: 'demo', rootPath: root, hubRepoId: 'r', hubRoot: '/h',
            hubKernelVersion: HUB_KERNEL, trustLevel: 'trusted', writePolicy: 'read_write',
        });
        const v = verifyMountToken(root, r.identity.mount_token);
        assert.strictEqual(v.verdict, 'ok');
        assert.strictEqual(v.identity_token, r.identity.mount_token);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('verifyMountToken — mismatch when tokens differ', () => {
    const root = mkdtemp('verify-mismatch');
    try {
        establishAuthority({
            slug: 'demo', rootPath: root, hubRepoId: 'r', hubRoot: '/h',
            hubKernelVersion: HUB_KERNEL, trustLevel: 'trusted', writePolicy: 'read_write',
        });
        const v = verifyMountToken(root, '00000000-0000-0000-0000-000000000000');
        assert.strictEqual(v.verdict, 'mismatch');
        assert.match(v.reason, /drift/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('verifyMountToken — identity_missing when IDENTITY.json absent but Hall has token', () => {
    const root = mkdtemp('verify-id-missing');
    try {
        const v = verifyMountToken(root, 'some-hall-token');
        assert.strictEqual(v.verdict, 'identity_missing');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('verifyMountToken — hall_missing when IDENTITY.json present but Hall has no token', () => {
    const root = mkdtemp('verify-hall-missing');
    try {
        establishAuthority({
            slug: 'demo', rootPath: root, hubRepoId: 'r', hubRoot: '/h',
            hubKernelVersion: HUB_KERNEL, trustLevel: 'trusted', writePolicy: 'read_write',
        });
        const v = verifyMountToken(root, null);
        assert.strictEqual(v.verdict, 'hall_missing');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('verifyMountToken — unproven when both sides absent (legacy tolerance)', () => {
    const root = mkdtemp('verify-unproven');
    try {
        const v = verifyMountToken(root, null);
        assert.strictEqual(v.verdict, 'unproven');
        assert.match(v.reason, /backward compatibility/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('verifyMountToken — also unproven when Hall token is empty string', () => {
    const root = mkdtemp('verify-empty');
    try {
        const v = verifyMountToken(root, '');
        assert.strictEqual(v.verdict, 'unproven');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('establishAuthority throws when spoke root is not a directory', () => {
    const root = mkdtemp('auth-bad');
    try {
        const bogus = path.join(root, 'does-not-exist');
        assert.throws(() => establishAuthority({
            slug: 'x',
            rootPath: bogus,
            hubRepoId: 'r',
            hubRoot: '/h',
            hubKernelVersion: HUB_KERNEL,
            trustLevel: 'trusted',
            writePolicy: 'read_write',
        }), /not a directory/i);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('establishAuthority throws on corrupted IDENTITY.json (not silent regen)', () => {
    const root = mkdtemp('auth-corrupt');
    try {
        const dir = path.join(root, SPOKE_PROFILE_DIR);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, IDENTITY_FILE), '{ this is not valid json', 'utf-8');
        assert.throws(() => establishAuthority({
            slug: 'corrupt',
            rootPath: root,
            hubRepoId: 'repo:hub',
            hubRoot: '/tmp/hub',
            hubKernelVersion: HUB_KERNEL,
            trustLevel: 'trusted',
            writePolicy: 'read_write',
        }), /IDENTITY\.json.*not valid JSON/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('establishAuthority throws when IDENTITY.json is a JSON non-object (array)', () => {
    const root = mkdtemp('auth-shape');
    try {
        const dir = path.join(root, SPOKE_PROFILE_DIR);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, IDENTITY_FILE), '[1, 2, 3]', 'utf-8');
        assert.throws(() => establishAuthority({
            slug: 'shape',
            rootPath: root,
            hubRepoId: 'repo:hub',
            hubRoot: '/tmp/hub',
            hubKernelVersion: HUB_KERNEL,
            trustLevel: 'trusted',
            writePolicy: 'read_write',
        }), /must be a JSON object/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
