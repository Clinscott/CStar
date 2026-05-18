import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

import {
    projectSpoke,
    SPOKE_PROFILE_DIR,
    SPOKE_PROFILE_MD,
    SPOKE_PROFILE_JSON,
    SPOKE_PROJECTION_VERSION,
    type SpokeProjection,
} from '../../../src/node/core/spokes/spoke_projector.ts';

function mkdtemp(prefix: string): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

function writeFile(root: string, rel: string, content: string): void {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
}

function readJsonProfile(root: string): SpokeProjection {
    const file = path.join(root, SPOKE_PROFILE_DIR, SPOKE_PROFILE_JSON);
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as SpokeProjection;
}

test('projectSpoke writes both profile artifacts and a metadata patch', () => {
    const root = mkdtemp('proj-basic');
    try {
        writeFile(root, 'package.json', JSON.stringify({
            name: 'demo-spoke',
            version: '1.2.3',
            scripts: { build: 'tsc -b', test: 'node --test' },
        }));
        writeFile(root, 'README.md', '# Demo Spoke\n\nThis is a demo for the projector.');

        const result = projectSpoke({ slug: 'demo', rootPath: root });

        const md = path.join(root, SPOKE_PROFILE_DIR, SPOKE_PROFILE_MD);
        const json = path.join(root, SPOKE_PROFILE_DIR, SPOKE_PROFILE_JSON);
        assert.ok(fs.existsSync(md), 'SPOKE_PROFILE.md should exist');
        assert.ok(fs.existsSync(json), 'spoke_profile.json should exist');

        const profile = readJsonProfile(root);
        assert.strictEqual(profile.version, SPOKE_PROJECTION_VERSION);
        assert.strictEqual(profile.slug, 'demo');
        assert.strictEqual(profile.primary_stack, 'node');
        assert.deepStrictEqual(Object.keys(profile.build.scripts).sort(), ['build', 'test']);
        assert.strictEqual(result.metadataPatch.primary_stack, 'node');
        assert.strictEqual(result.metadataPatch.script_count, 2);
        assert.ok(typeof result.metadataPatch.last_projected_at === 'number');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('projectSpoke detects rust + python as mixed primary stack', () => {
    const root = mkdtemp('proj-mixed');
    try {
        writeFile(root, 'Cargo.toml', '[package]\nname = "rusty"\nversion = "0.1.0"\n');
        writeFile(root, 'pyproject.toml', '[project]\nname = "snakey"\nversion = "0.0.1"\n');
        const result = projectSpoke({ slug: 'mixed', rootPath: root });
        assert.strictEqual(result.projection.primary_stack, 'mixed');
        const kinds = result.projection.stack.map((s) => s.kind).sort();
        assert.deepStrictEqual(kinds, ['python', 'rust']);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('projectSpoke catalogs .agents/skills/ as namespaced capabilities', () => {
    const root = mkdtemp('proj-skills');
    try {
        writeFile(root, '.agents/skills/echo/SKILL.md', `---
name: echo
description: Echo input back
tier: SKILL
risk: low
---

# Echo`);
        writeFile(root, '.agents/skills/_archive/SKILL.md', `---
name: archived
description: should be skipped
tier: SKILL
risk: low
---`);
        writeFile(root, '.agents/workflows/orient.md', '# Orient workflow');

        const result = projectSpoke({ slug: 'cap', rootPath: root });
        const ids = result.projection.capabilities.map((c) => c.namespaced_id);
        assert.ok(ids.includes('cap:echo'), `expected cap:echo in ${JSON.stringify(ids)}`);
        assert.ok(ids.includes('cap:orient'), `expected cap:orient in ${JSON.stringify(ids)}`);
        assert.ok(!ids.some((id) => id.includes('archive')), 'archive skills must be skipped');
        const echo = result.projection.capabilities.find((c) => c.bare_id === 'echo');
        assert.strictEqual(echo?.description, 'Echo input back');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('projectSpoke knowledge map categorizes README and architecture docs', () => {
    const root = mkdtemp('proj-knowledge');
    try {
        writeFile(root, 'README.md', '# Project\n\nThis is the readme summary.');
        writeFile(root, 'AGENTS.md', '# Agents\n\nAgent guidance lives here.');
        writeFile(root, 'docs/architecture.md', '# Architecture\n\nHigh level architecture overview.');
        writeFile(root, 'docs/contributing.md', '# Contributing\n\nHow to contribute.');

        const result = projectSpoke({ slug: 'know', rootPath: root });
        const byPath = new Map(result.projection.knowledge_index.map((k) => [k.path, k]));
        assert.strictEqual(byPath.get('README.md')?.category, 'readme');
        assert.strictEqual(byPath.get('AGENTS.md')?.category, 'agents');
        assert.strictEqual(byPath.get('docs/architecture.md')?.category, 'architecture');
        assert.strictEqual(byPath.get('docs/contributing.md')?.category, 'docs');
        for (const entry of result.projection.knowledge_index) {
            assert.ok(entry.summary.length > 0, `summary missing for ${entry.path}`);
            assert.ok(entry.size_bytes > 0);
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('projectSpoke survives when git is absent', () => {
    const root = mkdtemp('proj-no-git');
    try {
        writeFile(root, 'package.json', '{"name":"a","version":"0.0.1"}');
        const result = projectSpoke({ slug: 'nogit', rootPath: root });
        assert.strictEqual(result.projection.git.available, false);
        assert.ok(typeof result.projection.git.error === 'string' && result.projection.git.error.length > 0);
        assert.strictEqual(result.metadataPatch.git_head, null);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('projectSpoke captures git HEAD when repo is initialized', { skip: process.platform === 'win32' }, () => {
    const root = mkdtemp('proj-with-git');
    try {
        writeFile(root, 'README.md', '# Git Test');
        const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' };
        execFileSync('git', ['init', '--initial-branch=main', '-q'], { cwd: root, env });
        execFileSync('git', ['add', 'README.md'], { cwd: root, env });
        execFileSync('git', ['commit', '-q', '-m', 'initial'], { cwd: root, env });

        const result = projectSpoke({ slug: 'git', rootPath: root });
        assert.strictEqual(result.projection.git.available, true);
        assert.match(result.projection.git.head ?? '', /^[0-9a-f]{40}$/);
        assert.strictEqual(result.projection.git.branch, 'main');
        assert.strictEqual(result.projection.git.recent_commits?.length, 1);
        assert.strictEqual(result.projection.git.recent_commits?.[0].subject, 'initial');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('projectSpoke is idempotent — second run produces identical sha256s when state unchanged', () => {
    const root = mkdtemp('proj-idem');
    try {
        writeFile(root, 'package.json', '{"name":"x","version":"0.0.1","scripts":{"build":"echo"}}');
        writeFile(root, 'README.md', '# X');

        const first = projectSpoke({ slug: 'idem', rootPath: root });
        const initialMd = fs.readFileSync(path.join(root, SPOKE_PROFILE_DIR, SPOKE_PROFILE_MD), 'utf-8');
        const second = projectSpoke({ slug: 'idem', rootPath: root });
        const finalMd = fs.readFileSync(path.join(root, SPOKE_PROFILE_DIR, SPOKE_PROFILE_MD), 'utf-8');

        // The MD file body is identical except for the projected_at timestamp line.
        const stripTimestamp = (s: string) => s.replace(/Auto-generated by CStar spoke projector v[^\n]+\n/, '').replace(/Projected at[^\n]+\n/, '');
        assert.strictEqual(stripTimestamp(initialMd), stripTimestamp(finalMd));
        assert.strictEqual(first.projection.capabilities.length, second.projection.capabilities.length);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('projectSpoke throws when root is not a directory', () => {
    const root = mkdtemp('proj-bad');
    const bogus = path.join(root, 'does-not-exist');
    try {
        assert.throws(() => projectSpoke({ slug: 'bad', rootPath: bogus }), /not a directory/i);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('projectSpoke records absent Hermes profile with bootstrap next_step', () => {
    const root = mkdtemp('proj-no-hermes');
    const hermesProfilesRoot = mkdtemp('hermes-empty');
    try {
        const result = projectSpoke({
            slug: 'no-such-spoke',
            rootPath: root,
            hermesProfilesRoot,
            hermesDigestRoot: path.join(hermesProfilesRoot, '..', 'queries-empty'),
        });
        assert.strictEqual(result.projection.hermes.available, false);
        assert.match(result.projection.hermes.next_step ?? '', /hermes profile init no-such-spoke/);
        const patch = result.metadataPatch.hermes as Record<string, unknown>;
        assert.strictEqual(patch.available, false);
        assert.strictEqual(patch.lane_count, 0);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(hermesProfilesRoot, { recursive: true, force: true });
    }
});

test('projectSpoke parses Hermes config.yaml + interest-profile (with leading-space key bug)', () => {
    const root = mkdtemp('proj-hermes-spoke');
    const hermesProfilesRoot = mkdtemp('hermes-profiles');
    const digestRoot = mkdtemp('hermes-queries');
    try {
        const slug = 'demo';
        const profileRoot = path.join(hermesProfilesRoot, slug);
        fs.mkdirSync(path.join(profileRoot, 'workspace', 'research-vault', 'context'), { recursive: true });
        fs.writeFileSync(path.join(profileRoot, 'config.yaml'), `# header
profile:
  name: ${slug}
  project: demo-project
  role: research-agent

model:
  default: ModelA
  synthesis: ModelB
  provider: testprovider

paths:
  vault: ~/.hermes/profiles/${slug}/workspace/research-vault

research:
  refresh_interval_hours: 6
  daily_brief_time: "08:00"
  output_dir: ${digestRoot}
  artifact_pattern: "${slug}-daily-%Y-%m-%d.md"
`);
        // intentionally use the leading-space ' lanes' key plus a typoed contraints
        fs.writeFileSync(path.join(profileRoot, 'workspace', 'research-vault', 'context', 'interest-profile.json'), JSON.stringify({
            profile_version: '0.1.0',
            project: 'Demo',
            ' lanes': ['lane_a', 'lane_b', 'lane_c'],
            current_priorities: ['priority one', 'priority two'],
            key_questions: ['q1?', 'q2?'],
            key_contraints: { foo: 'bar' },
        }, null, 2));

        // Seed two recent digests, one today, one 2 days ago
        const fixedNow = new Date('2026-05-15T12:00:00Z');
        const todayName = `${slug}-daily-2026-05-15.md`;
        const olderName = `${slug}-daily-2026-05-13.md`;
        fs.writeFileSync(path.join(digestRoot, todayName), '# Today digest\n\nSummary line for today.');
        fs.writeFileSync(path.join(digestRoot, olderName), '# Older digest\n\nSummary line for two days ago.');

        const result = projectSpoke({
            slug,
            rootPath: root,
            hermesProfilesRoot,
            hermesDigestRoot: digestRoot,
            now: fixedNow,
        });

        const h = result.projection.hermes;
        assert.strictEqual(h.available, true);
        assert.strictEqual(h.project, 'Demo');
        assert.strictEqual(h.daily_brief_time, '08:00');
        assert.strictEqual(h.refresh_interval_hours, 6);
        assert.strictEqual(h.model_default, 'ModelA');
        assert.strictEqual(h.model_synthesis, 'ModelB');
        assert.deepStrictEqual(h.lanes, ['lane_a', 'lane_b', 'lane_c'], 'leading-space lanes key must be normalized');
        assert.strictEqual(h.today_digest_present, true);
        assert.match(h.today_digest_path ?? '', new RegExp(`${slug}-daily-2026-05-15\\.md$`));
        assert.strictEqual(h.recent_digests.length, 2);
        assert.strictEqual(h.recent_digests[0].date, '2026-05-15');
        assert.strictEqual(h.recent_digests[1].date, '2026-05-13');
        const patch = result.metadataPatch.hermes as Record<string, unknown>;
        assert.strictEqual(patch.available, true);
        assert.strictEqual(patch.lane_count, 3);
        assert.strictEqual(patch.recent_digest_count, 2);
        assert.strictEqual(patch.today_digest_present, true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(hermesProfilesRoot, { recursive: true, force: true });
        fs.rmSync(digestRoot, { recursive: true, force: true });
    }
});

test('projectSpoke Hermes detector tolerates a profile root with no config.yaml', () => {
    const root = mkdtemp('proj-hermes-bare');
    const hermesProfilesRoot = mkdtemp('hermes-bare');
    try {
        const slug = 'bare';
        fs.mkdirSync(path.join(hermesProfilesRoot, slug), { recursive: true });
        const result = projectSpoke({
            slug,
            rootPath: root,
            hermesProfilesRoot,
            hermesDigestRoot: path.join(hermesProfilesRoot, '..', 'queries-bare'),
        });
        assert.strictEqual(result.projection.hermes.available, true);
        assert.strictEqual(result.projection.hermes.daily_brief_time, undefined);
        assert.strictEqual(result.projection.hermes.lanes, undefined);
        assert.strictEqual(result.projection.hermes.recent_digests.length, 0);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(hermesProfilesRoot, { recursive: true, force: true });
    }
});
