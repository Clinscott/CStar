import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
    walkSpokeJournalForRecord,
    __testing,
} from '../../../src/node/core/spokes/spoke_capability_walker.js';
import type { HallMountedSpokeRecord } from '../../../src/types/hall.js';

/**
 * BEAD-CSTAR-SPOKE-DISCOVERY-001 — F2 Isolation.
 *
 * Covers Q7 (journal-awareness payload) and Q8 (failure modes: missing files,
 * missing root, memory drift between .agent/ and .agents/).
 */

function makeSpokeJournalFixture(slug: string): { spoke: HallMountedSpokeRecord; root: string; cleanup: () => void } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `spoke-journal-${slug}-`));
    const spoke = {
        spoke_id: `spoke-${slug}`,
        repo_id: `repo:${root}`,
        slug,
        kind: 'spoke',
        root_path: root,
        mount_status: 'active',
        trust_level: 'trusted',
        write_policy: 'read_write',
        projection_status: 'projected',
        created_at: 0,
        updated_at: 0,
    } as unknown as HallMountedSpokeRecord;
    return { spoke, root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function writeFile(root: string, relPath: string, content: string): void {
    const abs = path.join(root, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
}

// ── Q7: all-present happy path ───────────────────────────────────────────────

test('Q7: all four files present yields ok report with full payload', () => {
    const { spoke, root, cleanup } = makeSpokeJournalFixture('alpha');
    try {
        writeFile(root, '.agent/memory.md', '# Agent Memory\n\nActive investigation: spoke discovery wiring.\n');
        writeFile(root, 'tasks.md', '# Active Tasks\n\n- [ ] one\n- [ ] two\n- [x] done\n- [ ] three\n');
        writeFile(root, 'wireframe.md',
            '# Project Map\n\n' +
            '## Prominent Functions (Walker)\n\n' +
            '- `walkSpokeSkills(slug?)` — entry point\n' +
            '- `parseSkillFrontmatter(raw)` — regex parser\n' +
            '\n## Other\n- `should_not_capture()` — outside section\n',
        );
        writeFile(root, 'DEV_JOURNAL.md', '# Dev Journal\n\n## 2026-05-13\nLanded F1.\n\n## 2026-05-12\nDesign ratified.\n');

        const r = walkSpokeJournalForRecord(spoke);

        assert.strictEqual(r.validation, 'ok');
        assert.strictEqual(r.spoke, 'alpha');

        assert.strictEqual(r.files.memory_md.present, true);
        assert.strictEqual(r.files.memory_md.validation, 'ok');
        assert.strictEqual(r.files.memory_md.path, '.agent/memory.md');
        assert.ok((r.files.memory_md.summary ?? '').startsWith('Agent Memory'));
        assert.ok(r.files.memory_md.sha256?.length === 64);
        assert.ok((r.files.memory_md.size_bytes ?? 0) > 0);

        assert.strictEqual(r.files.tasks_md.present, true);
        assert.strictEqual(r.files.tasks_md.open_tasks, 3);
        assert.strictEqual(r.files.tasks_md.summary, 'Active Tasks');

        assert.strictEqual(r.files.wireframe_md.present, true);
        assert.deepStrictEqual(r.files.wireframe_md.prominent_functions, [
            'walkSpokeSkills(slug?)',
            'parseSkillFrontmatter(raw)',
        ]);

        assert.strictEqual(r.files.dev_journal_md.present, true);
        assert.strictEqual(r.files.dev_journal_md.last_entry_timestamp, '2026-05-13');
    } finally {
        cleanup();
    }
});

// ── Q7: memory.md fallback to .agents/ (plural) ──────────────────────────────

test('Q7: memory_md falls back to .agents/memory.md when .agent/memory.md is absent', () => {
    const { spoke, root, cleanup } = makeSpokeJournalFixture('alpha');
    try {
        writeFile(root, '.agents/memory.md', '# Plural Memory\n\nUses CStar convention.\n');
        const r = walkSpokeJournalForRecord(spoke);
        assert.strictEqual(r.files.memory_md.present, true);
        assert.strictEqual(r.files.memory_md.path, '.agents/memory.md');
        assert.strictEqual(r.files.memory_md.validation, 'ok');
    } finally {
        cleanup();
    }
});

// ── Q7: memory.md drift (both present) ───────────────────────────────────────

test('Q7: memory_md drift surfaces when both .agent/ and .agents/ exist', () => {
    const { spoke, root, cleanup } = makeSpokeJournalFixture('alpha');
    try {
        writeFile(root, '.agent/memory.md', '# Singular\n');
        writeFile(root, '.agents/memory.md', '# Plural\n');
        const r = walkSpokeJournalForRecord(spoke);
        assert.strictEqual(r.files.memory_md.present, true);
        assert.strictEqual(r.files.memory_md.validation, 'drift');
        assert.deepStrictEqual(r.files.memory_md.drift_paths, [
            '.agent/memory.md',
            '.agents/memory.md',
        ]);
        assert.match(r.files.memory_md.validation_reason ?? '', /both/);
    } finally {
        cleanup();
    }
});

// ── Q7: per-file missing ────────────────────────────────────────────────────

test('Q7: missing files report present=false with validation=missing', () => {
    const { spoke, root, cleanup } = makeSpokeJournalFixture('alpha');
    try {
        // Only one of the four files exists.
        writeFile(root, 'tasks.md', '# Tasks\n');
        const r = walkSpokeJournalForRecord(spoke);
        assert.strictEqual(r.validation, 'ok'); // root exists, so top-level is ok
        assert.strictEqual(r.files.memory_md.present, false);
        assert.strictEqual(r.files.memory_md.validation, 'missing');
        assert.strictEqual(r.files.tasks_md.present, true);
        assert.strictEqual(r.files.wireframe_md.present, false);
        assert.strictEqual(r.files.dev_journal_md.present, false);
    } finally {
        cleanup();
    }
});

// ── Q8: spoke root missing on disk ──────────────────────────────────────────

test('Q8: missing spoke root reports validation=mount_status_drift', () => {
    const ghostRoot = path.join(os.tmpdir(), `spoke-journal-ghost-${Date.now()}`);
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
    const r = walkSpokeJournalForRecord(spoke);
    assert.strictEqual(r.validation, 'mount_status_drift');
    assert.strictEqual(r.files.memory_md.present, false);
    assert.strictEqual(r.files.tasks_md.present, false);
    assert.strictEqual(r.files.wireframe_md.present, false);
    assert.strictEqual(r.files.dev_journal_md.present, false);
});

// ── Helper-level coverage ────────────────────────────────────────────────────

test('extractFirstH1: returns first H1 only', () => {
    assert.strictEqual(__testing.extractFirstH1('# Top\n## Sub\n# Other\n'), 'Top');
    assert.strictEqual(__testing.extractFirstH1('no heading here\n'), undefined);
    assert.strictEqual(__testing.extractFirstH1('## Only H2\n'), undefined);
});

test('makeMemorySummary: joins H1 with first paragraph', () => {
    const c = '# Memory\n\nFirst paragraph of context.\n\n## Other\nignored.\n';
    const s = __testing.makeMemorySummary(c);
    assert.ok(s !== undefined);
    assert.match(s, /^Memory — First paragraph/);
});

test('makeMemorySummary: caps long content at 280 chars with ellipsis', () => {
    const long = 'x'.repeat(400);
    const c = `# Title\n\n${long}\n`;
    const s = __testing.makeMemorySummary(c);
    assert.ok(s !== undefined);
    assert.strictEqual(s.length, 280);
    assert.ok(s.endsWith('...'));
});

test('countOpenTasks: counts open checkboxes only', () => {
    const c = '- [ ] open one\n- [x] done\n- [ ] open two\n* [ ] not a dash\n- [ ] open three\n';
    assert.strictEqual(__testing.countOpenTasks(c), 3);
});

test('extractProminentFunctions: parses backticked bullets in the section', () => {
    const c =
        '## Prominent Functions\n' +
        '- `foo()` — desc\n' +
        '- `bar(x)` — desc\n' +
        'not a bullet\n' +
        '- no backticks here\n' +
        '## Next Section\n' +
        '- `should_not(count)` — outside\n';
    const out = __testing.extractProminentFunctions(c);
    assert.deepStrictEqual(out, ['foo()', 'bar(x)']);
});

test('extractProminentFunctions: returns [] when section absent', () => {
    assert.deepStrictEqual(__testing.extractProminentFunctions('# nothing\n'), []);
});

test('extractProminentFunctions: tolerates H3 headings too', () => {
    const c = '### Prominent Functions\n- `only_h3()` — desc\n';
    assert.deepStrictEqual(__testing.extractProminentFunctions(c), ['only_h3()']);
});

test('findLastEntryTimestamp: returns lexicographically max ISO 8601 date', () => {
    const c = '## 2026-05-11\nold\n\n## 2026-05-13\nnewer\n\n## 2026-05-12\nin between\n';
    assert.strictEqual(__testing.findLastEntryTimestamp(c), '2026-05-13');
});

test('findLastEntryTimestamp: returns undefined when no date present', () => {
    assert.strictEqual(__testing.findLastEntryTimestamp('# just text\nno dates\n'), undefined);
});

test('readMemoryFile: prefers .agent/ when only it exists', () => {
    const { root, cleanup } = makeSpokeJournalFixture('alpha');
    try {
        writeFile(root, '.agent/memory.md', '# Singular Wins\n');
        const file = __testing.readMemoryFile(root);
        assert.strictEqual(file.path, '.agent/memory.md');
        assert.strictEqual(file.validation, 'ok');
    } finally {
        cleanup();
    }
});

// ── Invariant ────────────────────────────────────────────────────────────────

test('invariant: journal walker never throws regardless of partial spoke state', () => {
    const fixtures = [
        makeSpokeJournalFixture('a'),
        makeSpokeJournalFixture('b'),
    ];
    try {
        // a has everything; b has only tasks.md with malformed content
        writeFile(fixtures[0].root, '.agent/memory.md', '# m\n');
        writeFile(fixtures[0].root, 'tasks.md', '# t\n- [ ] open\n');
        writeFile(fixtures[0].root, 'wireframe.md', '# w\n');
        writeFile(fixtures[0].root, 'DEV_JOURNAL.md', '# d\n');
        writeFile(fixtures[1].root, 'tasks.md', 'no heading and no tasks\n');

        const r1 = walkSpokeJournalForRecord(fixtures[0].spoke);
        const r2 = walkSpokeJournalForRecord(fixtures[1].spoke);

        assert.strictEqual(r1.validation, 'ok');
        assert.strictEqual(r2.validation, 'ok');
        assert.strictEqual(r2.files.tasks_md.present, true);
        assert.strictEqual(r2.files.tasks_md.summary, undefined); // no H1
        assert.strictEqual(r2.files.tasks_md.open_tasks, 0);
    } finally {
        fixtures.forEach((f) => f.cleanup());
    }
});
