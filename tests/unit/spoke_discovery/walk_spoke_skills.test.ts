import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
    walkSpokeSkillsForRecords,
    __testing,
    type SpokeSkillManifest,
} from '../../../src/node/core/spokes/spoke_capability_walker.js';
import type { HallMountedSpokeRecord } from '../../../src/types/hall.js';

/**
 * BEAD-CSTAR-SPOKE-DISCOVERY-001 — F1 Isolation.
 *
 * Covers Q1 (manifest location), Q2 (namespace), Q5 (spoke filtering),
 * Q8 (failure modes). Q7 lives in the F2 journal walker tests.
 */

function makeSpokeFixture(slug: string, opts: {
    mount_status?: HallMountedSpokeRecord['mount_status'];
    trust_level?: HallMountedSpokeRecord['trust_level'];
} = {}): { spoke: HallMountedSpokeRecord; root: string; cleanup: () => void } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `spoke-discovery-${slug}-`));
    const spoke = {
        spoke_id: `spoke-${slug}`,
        repo_id: `repo:${root}`,
        slug,
        kind: 'spoke',
        root_path: root,
        mount_status: opts.mount_status ?? 'active',
        trust_level: opts.trust_level ?? 'trusted',
        write_policy: 'read_write',
        projection_status: 'projected',
        created_at: 0,
        updated_at: 0,
    } as unknown as HallMountedSpokeRecord;
    return { spoke, root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function writeSkillMd(spokeRoot: string, bareId: string, content: string): string {
    const dir = path.join(spokeRoot, '.agents', 'skills', bareId);
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, 'SKILL.md');
    fs.writeFileSync(p, content, 'utf-8');
    return p;
}

const CLEAN_SKILL = `---
name: clean-skill
description: A clean fixture skill for the walker.
tier: SKILL
risk: low
---

# CLEAN SKILL BODY
`;

const INVALID_YAML_SKILL = `---
name forge-contract-verify
description Verify the contract.
tier: SKILL
---

# BODY
`;

const MISSING_DESC_SKILL = `---
name: missing-description
tier: SKILL
risk: low
---

# BODY
`;

const UNKNOWN_TIER_SKILL = `---
name: unknown-tier
description: Tier that does not exist.
tier: PHANTOM
risk: low
---

# BODY
`;

const NO_FRONTMATTER_SKILL = '# Just a markdown body, no frontmatter at all.\n';

// ── Q1: manifest location ────────────────────────────────────────────────────

test('Q1: walker reads <root>/.agents/skills/<id>/SKILL.md', () => {
    const { spoke, root, cleanup } = makeSpokeFixture('alpha');
    try {
        writeSkillMd(root, 'clean-skill', CLEAN_SKILL);
        const out = walkSpokeSkillsForRecords([spoke]);
        assert.strictEqual(out.length, 1);
        assert.strictEqual(out[0].bare_id, 'clean-skill');
        assert.strictEqual(out[0].authority_path, path.join(root, '.agents', 'skills', 'clean-skill', 'SKILL.md'));
        assert.strictEqual(out[0].tier, 'SKILL');
        assert.strictEqual(out[0].risk, 'low');
        assert.strictEqual(out[0].name, 'clean-skill');
        assert.strictEqual(out[0].validation, 'ok');
    } finally {
        cleanup();
    }
});

test('Q1: skills without a SKILL.md file are skipped silently', () => {
    const { spoke, root, cleanup } = makeSpokeFixture('alpha');
    try {
        // A skill directory that exists but has no SKILL.md.
        fs.mkdirSync(path.join(root, '.agents', 'skills', 'ghost-skill'), { recursive: true });
        // And a valid one alongside it.
        writeSkillMd(root, 'real-skill', CLEAN_SKILL);
        const out = walkSpokeSkillsForRecords([spoke]);
        assert.strictEqual(out.length, 1);
        assert.strictEqual(out[0].bare_id, 'real-skill');
    } finally {
        cleanup();
    }
});

test('Q1: archived directories (underscore-prefixed) are skipped', () => {
    const { spoke, root, cleanup } = makeSpokeFixture('alpha');
    try {
        writeSkillMd(root, '_archive', CLEAN_SKILL);
        writeSkillMd(root, 'live-skill', CLEAN_SKILL);
        const out = walkSpokeSkillsForRecords([spoke]);
        assert.strictEqual(out.length, 1);
        assert.strictEqual(out[0].bare_id, 'live-skill');
    } finally {
        cleanup();
    }
});

test('Q1: spoke with no .agents/skills directory returns empty without erroring', () => {
    const { spoke, cleanup } = makeSpokeFixture('alpha');
    try {
        const out = walkSpokeSkillsForRecords([spoke]);
        assert.deepStrictEqual(out, []);
    } finally {
        cleanup();
    }
});

// ── Q2: namespace strategy ───────────────────────────────────────────────────

test('Q2: skill IDs are namespaced as <slug>:<bare>', () => {
    const { spoke, root, cleanup } = makeSpokeFixture('corvuseye');
    try {
        writeSkillMd(root, 'forge-contract-verify', CLEAN_SKILL);
        const out = walkSpokeSkillsForRecords([spoke]);
        assert.strictEqual(out[0].id, 'corvuseye:forge-contract-verify');
    } finally {
        cleanup();
    }
});

test('Q2: bare id containing a colon is rejected as invalid', () => {
    const v = __testing.validateBareId('has:colon');
    assert.strictEqual(v.ok, false);
    assert.match(v.reason ?? '', /colon/);
});

test('Q2: empty bare id is rejected', () => {
    const v = __testing.validateBareId('');
    assert.strictEqual(v.ok, false);
});

test('Q2: well-formed bare id passes validation', () => {
    const v = __testing.validateBareId('forge-contract-verify');
    assert.strictEqual(v.ok, true);
});

test('Q2: shadows_hub_id is true when bare id matches a hub registry id', () => {
    const { spoke, root, cleanup } = makeSpokeFixture('corvuseye');
    try {
        writeSkillMd(root, 'gungnir', CLEAN_SKILL);
        const out = walkSpokeSkillsForRecords([spoke], {
            hubRegistryIds: new Set(['gungnir', 'empire']),
        });
        assert.strictEqual(out[0].shadows_hub_id, true);
    } finally {
        cleanup();
    }
});

test('Q2: shadows_hub_id is false when bare id does not match', () => {
    const { spoke, root, cleanup } = makeSpokeFixture('corvuseye');
    try {
        writeSkillMd(root, 'forge-contract-verify', CLEAN_SKILL);
        const out = walkSpokeSkillsForRecords([spoke], {
            hubRegistryIds: new Set(['gungnir', 'empire']),
        });
        assert.strictEqual(out[0].shadows_hub_id, false);
    } finally {
        cleanup();
    }
});

// ── Q5: spoke filtering ──────────────────────────────────────────────────────

test('Q5: inactive spokes are excluded entirely', () => {
    const { spoke, root, cleanup } = makeSpokeFixture('alpha', { mount_status: 'inactive' as HallMountedSpokeRecord['mount_status'] });
    try {
        writeSkillMd(root, 'clean-skill', CLEAN_SKILL);
        const out = walkSpokeSkillsForRecords([spoke]);
        assert.deepStrictEqual(out, []);
    } finally {
        cleanup();
    }
});

test('Q5: quarantined spokes are excluded by default', () => {
    const { spoke, root, cleanup } = makeSpokeFixture('alpha', { trust_level: 'quarantined' as HallMountedSpokeRecord['trust_level'] });
    try {
        writeSkillMd(root, 'clean-skill', CLEAN_SKILL);
        const out = walkSpokeSkillsForRecords([spoke]);
        assert.deepStrictEqual(out, []);
    } finally {
        cleanup();
    }
});

test('Q5: quarantined spokes surface with validation=quarantined when includeQuarantined=true', () => {
    const { spoke, root, cleanup } = makeSpokeFixture('alpha', { trust_level: 'quarantined' as HallMountedSpokeRecord['trust_level'] });
    try {
        writeSkillMd(root, 'clean-skill', CLEAN_SKILL);
        const out = walkSpokeSkillsForRecords([spoke], { includeQuarantined: true });
        assert.strictEqual(out.length, 1);
        assert.strictEqual(out[0].validation, 'quarantined');
        assert.match(out[0].validation_reason ?? '', /quarantined/);
    } finally {
        cleanup();
    }
});

test('Q5: results are stable-sorted by namespaced id', () => {
    const a = makeSpokeFixture('zeta');
    const b = makeSpokeFixture('alpha');
    try {
        writeSkillMd(a.root, 'a-skill', CLEAN_SKILL);
        writeSkillMd(b.root, 'b-skill', CLEAN_SKILL);
        const out = walkSpokeSkillsForRecords([a.spoke, b.spoke]);
        assert.strictEqual(out.length, 2);
        assert.strictEqual(out[0].id, 'alpha:b-skill');
        assert.strictEqual(out[1].id, 'zeta:a-skill');
    } finally {
        a.cleanup();
        b.cleanup();
    }
});

// ── Q8: failure modes (report, never drop silently, never mutate) ────────────

test('Q8: malformed frontmatter line surfaces with validation=invalid (not dropped)', () => {
    const { spoke, root, cleanup } = makeSpokeFixture('alpha');
    try {
        writeSkillMd(root, 'bad-yaml', INVALID_YAML_SKILL);
        const out = walkSpokeSkillsForRecords([spoke]);
        assert.strictEqual(out.length, 1, 'invalid skill must still surface');
        assert.strictEqual(out[0].validation, 'invalid');
        assert.match(out[0].validation_reason ?? '', /malformed/);
        // Documentation is still returned so the operator can inspect.
        assert.ok(out[0].documentation.length > 0);
    } finally {
        cleanup();
    }
});

test('Q8: SKILL.md with no frontmatter block surfaces with validation=invalid', () => {
    const { spoke, root, cleanup } = makeSpokeFixture('alpha');
    try {
        writeSkillMd(root, 'no-frontmatter', NO_FRONTMATTER_SKILL);
        const out = walkSpokeSkillsForRecords([spoke]);
        assert.strictEqual(out.length, 1);
        assert.strictEqual(out[0].validation, 'invalid');
        assert.match(out[0].validation_reason ?? '', /no frontmatter/);
    } finally {
        cleanup();
    }
});

test('Q8: missing required frontmatter field (description) surfaces with validation=invalid', () => {
    const { spoke, root, cleanup } = makeSpokeFixture('alpha');
    try {
        writeSkillMd(root, 'missing-desc', MISSING_DESC_SKILL);
        const out = walkSpokeSkillsForRecords([spoke]);
        assert.strictEqual(out.length, 1);
        assert.strictEqual(out[0].validation, 'invalid');
        assert.match(out[0].validation_reason ?? '', /description/);
    } finally {
        cleanup();
    }
});

test('Q8: unknown tier surfaces with validation=invalid but tier=UNKNOWN', () => {
    const { spoke, root, cleanup } = makeSpokeFixture('alpha');
    try {
        writeSkillMd(root, 'phantom-tier', UNKNOWN_TIER_SKILL);
        const out = walkSpokeSkillsForRecords([spoke]);
        assert.strictEqual(out.length, 1);
        assert.strictEqual(out[0].tier, 'UNKNOWN');
        assert.strictEqual(out[0].validation, 'invalid');
        assert.match(out[0].validation_reason ?? '', /tier/);
    } finally {
        cleanup();
    }
});

test('Q8: missing spoke root yields empty result (mount_status_drift surfaces elsewhere)', () => {
    // Construct a spoke pointing at a path we never created.
    const ghostRoot = path.join(os.tmpdir(), `spoke-discovery-ghost-${Date.now()}`);
    const spoke = {
        spoke_id: 'spoke-ghost',
        repo_id: `repo:${ghostRoot}`,
        slug: 'ghost',
        kind: 'spoke',
        root_path: ghostRoot,
        mount_status: 'active',
        trust_level: 'trusted',
        write_policy: 'read_only',
        projection_status: 'projected',
        created_at: 0,
        updated_at: 0,
    } as unknown as HallMountedSpokeRecord;
    const out = walkSpokeSkillsForRecords([spoke]);
    assert.deepStrictEqual(out, [], 'missing root should yield empty, not throw');
});

// ── Frontmatter parser direct tests ──────────────────────────────────────────

test('parser: extracts simple key:value pairs', () => {
    const r = __testing.parseSkillFrontmatter(CLEAN_SKILL);
    assert.strictEqual(r.error, undefined);
    assert.strictEqual(r.frontmatter.name, 'clean-skill');
    assert.strictEqual(r.frontmatter.tier, 'SKILL');
    assert.strictEqual(r.frontmatter.risk, 'low');
});

test('parser: strips wrapping quotes from values', () => {
    const r = __testing.parseSkillFrontmatter('---\nname: "quoted-name"\ndescription: \'single-quoted\'\ntier: SKILL\nrisk: low\n---\n\nbody\n');
    assert.strictEqual(r.frontmatter.name, 'quoted-name');
    assert.strictEqual(r.frontmatter.description, 'single-quoted');
});

test('parser: tolerates blank and comment lines in frontmatter', () => {
    const r = __testing.parseSkillFrontmatter('---\n\n# a comment\nname: with-comment\ndescription: ok\ntier: SKILL\nrisk: low\n---\nbody\n');
    assert.strictEqual(r.error, undefined);
    assert.strictEqual(r.frontmatter.name, 'with-comment');
});

// ── Asserted invariant ──────────────────────────────────────────────────────

test('invariant: walker never throws on a well-formed spoke list, regardless of disk content', () => {
    const fixtures = [
        makeSpokeFixture('mixed-1'),
        makeSpokeFixture('mixed-2'),
        makeSpokeFixture('mixed-3'),
    ];
    try {
        writeSkillMd(fixtures[0].root, 'clean', CLEAN_SKILL);
        writeSkillMd(fixtures[0].root, 'bad-yaml', INVALID_YAML_SKILL);
        writeSkillMd(fixtures[1].root, 'no-fm', NO_FRONTMATTER_SKILL);
        writeSkillMd(fixtures[2].root, 'missing-desc', MISSING_DESC_SKILL);
        const out = walkSpokeSkillsForRecords(fixtures.map((f) => f.spoke));
        // Four skills total. All surface. None are dropped silently.
        assert.strictEqual(out.length, 4);
        const validations = out.map((s: SpokeSkillManifest) => s.validation).sort();
        assert.deepStrictEqual(validations, ['invalid', 'invalid', 'invalid', 'ok']);
    } finally {
        fixtures.forEach((f) => f.cleanup());
    }
});
