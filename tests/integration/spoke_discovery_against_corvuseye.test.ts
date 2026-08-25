import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    walkSpokeSkillsForRecords,
    walkSpokeJournalForRecord,
} from '../../src/node/core/spokes/spoke_capability_walker.js';
import type { HallMountedSpokeRecord } from '../../src/types/hall.js';

/**
 * BEAD-CSTAR-SPOKE-DISCOVERY-001 — F3 integration.
 *
 * The canonical checks use an isolated CorvusEye-shaped fixture so CI always
 * exercises the end-to-end walker contract. A separate smoke test may read the
 * real spoke only when the operator supplies both the opt-in flag and its
 * current mount token.
 */

const CORVUSEYE_ROOT = '/home/morderith/Corvus/CorvusEye';
const LIVE_MOUNT_TOKEN = process.env.CSTAR_TEST_CORVUSEYE_MOUNT_TOKEN?.trim();
const LIVE_INTEGRATION_ENABLED = process.env.CSTAR_RUN_LIVE_SPOKE_INTEGRATION === '1'
    && Boolean(LIVE_MOUNT_TOKEN);

function corvusEyeSpoke(root: string, mountToken: string): HallMountedSpokeRecord {
    return {
        spoke_id: 'spoke-corvuseye',
        repo_id: `repo:${root}`,
        slug: 'corvuseye',
        kind: 'spoke',
        root_path: root,
        mount_status: 'active',
        trust_level: 'trusted',
        write_policy: 'read_write',
        projection_status: 'projected',
        metadata: { authority: { mount_token: mountToken } },
        created_at: 0,
        updated_at: 0,
    } as unknown as HallMountedSpokeRecord;
}

function writeFixtureFile(root: string, relativePath: string, content: string): void {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, 'utf8');
}

function makeSyntheticCorvusEye(): {
    spoke: HallMountedSpokeRecord;
    cleanup: () => void;
} {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-corvuseye-integration-'));
    const mountToken = 'synthetic-corvuseye-mount-token';

    writeFixtureFile(root, '.cstar/IDENTITY.json', JSON.stringify({ mount_token: mountToken }));
    writeFixtureFile(
        root,
        '.agents/skills/usb-forge-contract-verify/SKILL.md',
        [
            '---',
            'name: usb-forge-contract-verify',
            'description: Verify the synthetic three-Engram Forge contract.',
            'tier: SKILL',
            'risk: low',
            '---',
            '',
            '# USB Forge Contract Verify',
            '',
            '## LOGIC PROTOCOL',
            '',
            'Synthetic integration evidence only.',
            '',
        ].join('\n'),
    );
    writeFixtureFile(root, '.agent/memory.md', '# CorvusEye Memory\n\nSynthetic integration fixture.\n');
    writeFixtureFile(root, 'tasks.md', '# Active Tasks\n\n- [ ] verify synthetic Forge contract\n');
    writeFixtureFile(
        root,
        'wireframe.md',
        '# CorvusEye Wireframe\n\n## Prominent Functions\n\n- `usb_forge::ForgeShot::build(...)` — builds a shot\n',
    );
    writeFixtureFile(root, 'DEV_JOURNAL.md', '# Dev Journal\n\n## 2026-07-14\nSynthetic fixture created.\n');

    return {
        spoke: corvusEyeSpoke(root, mountToken),
        cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
    };
}

function withSyntheticCorvusEye(run: (spoke: HallMountedSpokeRecord) => void): void {
    const fixture = makeSyntheticCorvusEye();
    try {
        run(fixture.spoke);
    } finally {
        fixture.cleanup();
    }
}

test('integration: synthetic CorvusEye skill surfaces with validated metadata', () => {
    withSyntheticCorvusEye((spoke) => {
        const out = walkSpokeSkillsForRecords([spoke]);
        const found = out.find((skill) => skill.id === 'corvuseye:usb-forge-contract-verify');
        assert.ok(found);
        assert.equal(found.validation, 'ok');
        assert.equal(found.tier, 'SKILL');
        assert.equal(found.risk, 'low');
        assert.equal(found.spoke_slug, 'corvuseye');
        assert.equal(found.bare_id, 'usb-forge-contract-verify');
        assert.match(found.description, /three-Engram/);
    });
});

test('integration: synthetic CorvusEye reports all four journal files', () => {
    withSyntheticCorvusEye((spoke) => {
        const report = walkSpokeJournalForRecord(spoke);
        assert.equal(report.validation, 'ok');
        assert.equal(report.spoke, 'corvuseye');
        assert.equal(report.files.memory_md.present, true);
        assert.equal(report.files.tasks_md.present, true);
        assert.equal(report.files.wireframe_md.present, true);
        assert.equal(report.files.dev_journal_md.present, true);
    });
});

test('integration: synthetic CorvusEye prefers singular .agent memory', () => {
    withSyntheticCorvusEye((spoke) => {
        const report = walkSpokeJournalForRecord(spoke);
        assert.equal(report.files.memory_md.path, '.agent/memory.md');
        assert.equal(report.files.memory_md.validation, 'ok');
    });
});

test('integration: synthetic CorvusEye exposes its Forge function', () => {
    withSyntheticCorvusEye((spoke) => {
        const functions = walkSpokeJournalForRecord(spoke).files.wireframe_md.prominent_functions ?? [];
        assert.ok(functions.some((value) => /usb_forge::ForgeShot::build/.test(value)));
    });
});

test('integration: synthetic CorvusEye exposes an open-task count', () => {
    withSyntheticCorvusEye((spoke) => {
        assert.equal(walkSpokeJournalForRecord(spoke).files.tasks_md.open_tasks, 1);
    });
});

test('integration: synthetic CorvusEye returns skill documentation verbatim', () => {
    withSyntheticCorvusEye((spoke) => {
        const found = walkSpokeSkillsForRecords([spoke])
            .find((skill) => skill.id === 'corvuseye:usb-forge-contract-verify');
        assert.ok(found);
        assert.match(found.documentation, /^---/);
        assert.match(found.documentation, /LOGIC PROTOCOL/);
    });
});

const liveCorvusEyeAvailable = LIVE_INTEGRATION_ENABLED
    && fs.existsSync(CORVUSEYE_ROOT)
    && fs.existsSync(path.join(CORVUSEYE_ROOT, '.agents', 'skills', 'usb-forge-contract-verify', 'SKILL.md'));

test('live smoke: operator-authorized CorvusEye mount remains readable', { skip: !liveCorvusEyeAvailable }, () => {
    const spoke = corvusEyeSpoke(CORVUSEYE_ROOT, LIVE_MOUNT_TOKEN ?? '');
    const skills = walkSpokeSkillsForRecords([spoke]);
    assert.ok(skills.some((skill) => skill.id === 'corvuseye:usb-forge-contract-verify'));
    assert.equal(walkSpokeJournalForRecord(spoke).validation, 'ok');
});
