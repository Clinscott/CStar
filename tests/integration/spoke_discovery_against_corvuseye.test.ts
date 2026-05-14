import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import {
    walkSpokeSkillsForRecords,
    walkSpokeJournalForRecord,
} from '../../src/node/core/spokes/spoke_capability_walker.js';
import type { HallMountedSpokeRecord } from '../../src/types/hall.js';

/**
 * BEAD-CSTAR-SPOKE-DISCOVERY-001 — F3 Integration.
 *
 * Exercises the walker against the real CorvusEye spoke on disk.
 * No Hall DB dependency: a synthetic spoke record points at the real spoke root.
 * This proves the walker handles real-world content end-to-end without
 * brittle dependence on whether the user's pennyone.db has the spoke linked.
 *
 * Per design §6.3 acceptance: corvuseye:forge-contract-verify must surface
 * with validation=ok, and all four journal files must report present.
 */

const CORVUSEYE_ROOT = '/home/morderith/Corvus/CorvusEye';

function corvusEyeSpoke(): HallMountedSpokeRecord {
    return {
        spoke_id: 'spoke-corvuseye',
        repo_id: `repo:${CORVUSEYE_ROOT}`,
        slug: 'corvuseye',
        kind: 'spoke',
        root_path: CORVUSEYE_ROOT,
        mount_status: 'active',
        trust_level: 'trusted',
        write_policy: 'read_write',
        projection_status: 'projected',
        created_at: 0,
        updated_at: 0,
    } as unknown as HallMountedSpokeRecord;
}

const corvusEyeAvailable = fs.existsSync(CORVUSEYE_ROOT)
    && fs.existsSync(path.join(CORVUSEYE_ROOT, '.agents', 'skills', 'forge-contract-verify', 'SKILL.md'));

test('integration: walkSpokeSkillsForRecords surfaces corvuseye:forge-contract-verify', { skip: !corvusEyeAvailable }, () => {
    const spoke = corvusEyeSpoke();
    const out = walkSpokeSkillsForRecords([spoke]);
    const found = out.find((s) => s.id === 'corvuseye:forge-contract-verify');
    assert.ok(found !== undefined, `expected corvuseye:forge-contract-verify in walker output; got ${out.map((s) => s.id).join(', ')}`);
    assert.strictEqual(found.validation, 'ok');
    assert.strictEqual(found.tier, 'SKILL');
    assert.strictEqual(found.risk, 'low');
    assert.strictEqual(found.spoke_slug, 'corvuseye');
    assert.strictEqual(found.bare_id, 'forge-contract-verify');
    assert.match(found.description, /three-Engram/);
});

test('integration: walkSpokeJournalForRecord reports all four CorvusEye journal files present', { skip: !corvusEyeAvailable }, () => {
    const spoke = corvusEyeSpoke();
    const r = walkSpokeJournalForRecord(spoke);
    assert.strictEqual(r.validation, 'ok');
    assert.strictEqual(r.spoke, 'corvuseye');
    assert.strictEqual(r.files.memory_md.present, true, 'memory_md present');
    assert.strictEqual(r.files.tasks_md.present, true, 'tasks_md present');
    assert.strictEqual(r.files.wireframe_md.present, true, 'wireframe_md present');
    assert.strictEqual(r.files.dev_journal_md.present, true, 'dev_journal_md present');
});

test('integration: CorvusEye memory_md is read from .agent/ (singular) per its AGENTS.md', { skip: !corvusEyeAvailable }, () => {
    const spoke = corvusEyeSpoke();
    const r = walkSpokeJournalForRecord(spoke);
    assert.strictEqual(r.files.memory_md.path, '.agent/memory.md');
    assert.ok(r.files.memory_md.validation === 'ok' || r.files.memory_md.validation === 'drift');
});

test('integration: CorvusEye wireframe.md exposes prominent Forge functions', { skip: !corvusEyeAvailable }, () => {
    const spoke = corvusEyeSpoke();
    const r = walkSpokeJournalForRecord(spoke);
    assert.strictEqual(r.files.wireframe_md.present, true);
    const fns = r.files.wireframe_md.prominent_functions ?? [];
    assert.ok(fns.length > 0, 'expected at least one prominent function in CorvusEye/wireframe.md');
    // The wireframe lists usb_forge::ForgeShot::build (...) at the top of its Prominent Functions section.
    assert.ok(
        fns.some((s) => /usb_forge::ForgeShot::build/.test(s)),
        `expected usb_forge::ForgeShot::build in prominent functions; got: ${fns.join(' | ')}`,
    );
});

test('integration: CorvusEye tasks.md exposes open_tasks count', { skip: !corvusEyeAvailable }, () => {
    const spoke = corvusEyeSpoke();
    const r = walkSpokeJournalForRecord(spoke);
    assert.strictEqual(r.files.tasks_md.present, true);
    assert.strictEqual(typeof r.files.tasks_md.open_tasks, 'number');
});

test('integration: corvuseye SKILL.md content is returned verbatim in documentation field', { skip: !corvusEyeAvailable }, () => {
    const spoke = corvusEyeSpoke();
    const out = walkSpokeSkillsForRecords([spoke]);
    const found = out.find((s) => s.id === 'corvuseye:forge-contract-verify');
    assert.ok(found !== undefined);
    // Sanity: the documentation should include both the frontmatter and the LOGIC PROTOCOL marker.
    assert.match(found.documentation, /^---/);
    assert.match(found.documentation, /LOGIC PROTOCOL/);
});
