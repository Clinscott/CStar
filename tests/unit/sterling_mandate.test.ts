import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
    verifySterlingMandate,
    mergeMandateEvidence,
    MIN_GUNGNIR_AUDIT_SCORE,
    type MandateEvidence,
} from '../../src/node/core/sterling_mandate.ts';
import type { HallBeadRecord } from '../../src/types/hall.js';

function mkHubRoot(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sterling-hub-'));
}

function writeFile(root: string, rel: string, content = '# stub'): string {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
    return abs;
}

function writeFeature(root: string, rel: string, name = 'demo'): string {
    return writeFile(root, rel, `Feature: ${name}\n  Scenario: stub\n    Given a precondition\n    When something happens\n    Then it works\n`);
}

function bead(overrides: Partial<HallBeadRecord> = {}): HallBeadRecord {
    return {
        bead_id: 'bead:test:1',
        repo_id: 'repo:test',
        rationale: 'test bead',
        status: 'IN_PROGRESS',
        baseline_scores: overrides.baseline_scores ?? {},
        metadata: overrides.metadata,
        created_at: 0,
        updated_at: 0,
        ...overrides,
    } as HallBeadRecord;
}

test('ACCEPTED — all three legs satisfied via warden_results', () => {
    const root = mkHubRoot();
    try {
        writeFeature(root, 'tests/empire_tests/foo.feature');
        writeFile(root, 'tests/unit/foo.test.ts');
        const verdict = verifySterlingMandate(bead(), {
            lore_paths: ['tests/empire_tests/foo.feature'],
            isolation_paths: ['tests/unit/foo.test.ts'],
            audit: { warden_results: [{ name: 'norn', verdict: 'ACCEPTED', ran_at: Date.now() }] },
        }, root);
        assert.strictEqual(verdict.verdict, 'ACCEPTED');
        assert.strictEqual(verdict.legs.length, 3);
        assert.ok(verdict.legs.every((l) => l.status === 'satisfied'));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('ACCEPTED — gungnir_score satisfies audit when ≥ baseline', () => {
    const root = mkHubRoot();
    try {
        writeFeature(root, 'tests/empire_tests/g.feature');
        writeFile(root, 'tests/unit/g.test.ts');
        const verdict = verifySterlingMandate(
            bead({ baseline_scores: { gungnir: 75 } }),
            {
                lore_paths: ['tests/empire_tests/g.feature'],
                isolation_paths: ['tests/unit/g.test.ts'],
                audit: { gungnir_score: 80 },
            },
            root,
        );
        assert.strictEqual(verdict.verdict, 'ACCEPTED');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('REJECTED — gungnir_score below baseline', () => {
    const root = mkHubRoot();
    try {
        writeFeature(root, 'tests/empire_tests/r.feature');
        writeFile(root, 'tests/unit/r.test.ts');
        const verdict = verifySterlingMandate(
            bead({ baseline_scores: { gungnir: 90 } }),
            {
                lore_paths: ['tests/empire_tests/r.feature'],
                isolation_paths: ['tests/unit/r.test.ts'],
                audit: { gungnir_score: 70 },
            },
            root,
        );
        assert.strictEqual(verdict.verdict, 'REJECTED');
        assert.match(verdict.reasons.join(' '), /gungnir_score=70 < baseline=90/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('REJECTED — warden REJECTED verdict short-circuits audit', () => {
    const root = mkHubRoot();
    try {
        writeFeature(root, 'tests/empire_tests/x.feature');
        writeFile(root, 'tests/unit/x.test.ts');
        const verdict = verifySterlingMandate(bead(), {
            lore_paths: ['tests/empire_tests/x.feature'],
            isolation_paths: ['tests/unit/x.test.ts'],
            audit: {
                warden_results: [
                    { name: 'norn', verdict: 'ACCEPTED', ran_at: 1 },
                    { name: 'freya', verdict: 'REJECTED', ran_at: 2 },
                ],
            },
        }, root);
        assert.strictEqual(verdict.verdict, 'REJECTED');
        assert.match(verdict.reasons.join(' '), /warden\(s\) REJECTED: freya/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('REJECTED — missing lore_paths', () => {
    const root = mkHubRoot();
    try {
        writeFile(root, 'tests/unit/i.test.ts');
        const verdict = verifySterlingMandate(bead(), {
            isolation_paths: ['tests/unit/i.test.ts'],
            audit: { gungnir_score: 50 },
        }, root);
        assert.strictEqual(verdict.verdict, 'REJECTED');
        assert.match(verdict.reasons.join(' '), /\[lore\]/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('REJECTED — lore path declared but file missing on disk', () => {
    const root = mkHubRoot();
    try {
        writeFile(root, 'tests/unit/i.test.ts');
        const verdict = verifySterlingMandate(bead(), {
            lore_paths: ['tests/empire_tests/missing.feature'],
            isolation_paths: ['tests/unit/i.test.ts'],
            audit: { gungnir_score: 50 },
        }, root);
        assert.strictEqual(verdict.verdict, 'REJECTED');
        assert.match(verdict.reasons.join(' '), /lore artifacts missing on disk: tests\/empire_tests\/missing\.feature/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('REJECTED — no audit proof at all', () => {
    const root = mkHubRoot();
    try {
        writeFeature(root, 'tests/empire_tests/a.feature');
        writeFile(root, 'tests/unit/a.test.ts');
        const verdict = verifySterlingMandate(bead(), {
            lore_paths: ['tests/empire_tests/a.feature'],
            isolation_paths: ['tests/unit/a.test.ts'],
        }, root);
        assert.strictEqual(verdict.verdict, 'REJECTED');
        assert.match(verdict.reasons.join(' '), /no audit proof provided/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('EXEMPT — mandate_exempt with reason', () => {
    const root = mkHubRoot();
    try {
        const verdict = verifySterlingMandate(bead(), {
            mandate_exempt: true,
            exemption_reason: 'docs-only change, no behavior',
        }, root);
        assert.strictEqual(verdict.verdict, 'EXEMPT');
        assert.strictEqual(verdict.exemption_reason, 'docs-only change, no behavior');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('REJECTED — mandate_exempt without exemption_reason', () => {
    const root = mkHubRoot();
    try {
        const verdict = verifySterlingMandate(bead(), { mandate_exempt: true }, root);
        assert.strictEqual(verdict.verdict, 'REJECTED');
        assert.match(verdict.reasons.join(' '), /exemption_reason/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('REJECTED — mandate_exempt with whitespace-only exemption_reason', () => {
    const root = mkHubRoot();
    try {
        const verdict = verifySterlingMandate(bead(), {
            mandate_exempt: true,
            exemption_reason: '   ',
        }, root);
        assert.strictEqual(verdict.verdict, 'REJECTED');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('mergeMandateEvidence — call-site fields win over cached', () => {
    const cachedBead = bead({
        metadata: {
            mandate_evidence: {
                lore_paths: ['old/lore.feature'],
                audit: { gungnir_score: 50 },
            },
        },
    });
    const merged = mergeMandateEvidence(cachedBead, {
        lore_paths: ['new/lore.feature'],
    });
    assert.deepStrictEqual(merged.lore_paths, ['new/lore.feature']);
    assert.deepStrictEqual(merged.audit, { gungnir_score: 50 });
});

test('mergeMandateEvidence — empty args fall through to cached', () => {
    const cachedBead = bead({
        metadata: {
            mandate_evidence: {
                lore_paths: ['cached.feature'],
                isolation_paths: ['cached.test.ts'],
                audit: { gungnir_score: 100 },
            },
        },
    });
    const merged = mergeMandateEvidence(cachedBead, undefined);
    assert.deepStrictEqual(merged.lore_paths, ['cached.feature']);
    assert.strictEqual(merged.audit?.gungnir_score, 100);
});

test('Absolute lore/isolation paths resolve regardless of hubRoot', () => {
    const root = mkHubRoot();
    const otherRoot = mkHubRoot();
    try {
        const loreAbs = writeFeature(otherRoot, 'lore.feature');
        const isoAbs = writeFile(otherRoot, 'iso.test.ts');
        const verdict = verifySterlingMandate(bead(), {
            lore_paths: [loreAbs],
            isolation_paths: [isoAbs],
            audit: { warden_results: [{ name: 'norn', verdict: 'ACCEPTED', ran_at: 1 }] },
        }, root);
        assert.strictEqual(verdict.verdict, 'ACCEPTED');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(otherRoot, { recursive: true, force: true });
    }
});

test('audit.warden_results with no ACCEPTED entries is unsatisfied', () => {
    const root = mkHubRoot();
    try {
        writeFeature(root, 'l.feature');
        writeFile(root, 'i.test.ts');
        const verdict = verifySterlingMandate(bead(), {
            lore_paths: ['l.feature'],
            isolation_paths: ['i.test.ts'],
            audit: { warden_results: [{ name: 'norn', verdict: 'INCONCLUSIVE', ran_at: 1 }] },
        }, root);
        assert.strictEqual(verdict.verdict, 'REJECTED');
        assert.match(verdict.reasons.join(' '), /zero ACCEPTED/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('REJECTED — gungnir_score below floor when no baseline exists', () => {
    const root = mkHubRoot();
    try {
        writeFeature(root, 'l.feature');
        writeFile(root, 'i.test.ts');
        const verdict = verifySterlingMandate(bead(), {
            lore_paths: ['l.feature'],
            isolation_paths: ['i.test.ts'],
            audit: { gungnir_score: 0 },
        }, root);
        assert.strictEqual(verdict.verdict, 'REJECTED');
        assert.match(verdict.reasons.join(' '), new RegExp(`gungnir_score=0 < floor=${MIN_GUNGNIR_AUDIT_SCORE}`));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('ACCEPTED — gungnir_score at floor satisfies audit with no baseline', () => {
    const root = mkHubRoot();
    try {
        writeFeature(root, 'l.feature');
        writeFile(root, 'i.test.ts');
        const verdict = verifySterlingMandate(bead(), {
            lore_paths: ['l.feature'],
            isolation_paths: ['i.test.ts'],
            audit: { gungnir_score: MIN_GUNGNIR_AUDIT_SCORE },
        }, root);
        assert.strictEqual(verdict.verdict, 'ACCEPTED');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('REJECTED — lore .feature file lacks Gherkin keywords', () => {
    const root = mkHubRoot();
    try {
        writeFile(root, 'tests/empire_tests/junk.feature', 'this is just prose, not Gherkin\n');
        writeFile(root, 'tests/unit/junk.test.ts');
        const verdict = verifySterlingMandate(bead(), {
            lore_paths: ['tests/empire_tests/junk.feature'],
            isolation_paths: ['tests/unit/junk.test.ts'],
            audit: { warden_results: [{ name: 'norn', verdict: 'ACCEPTED', ran_at: 1 }] },
        }, root);
        assert.strictEqual(verdict.verdict, 'REJECTED');
        assert.match(verdict.reasons.join(' '), /lack Gherkin keywords/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('ACCEPTED — lore .feature with Scenario keyword is accepted (no Feature: line)', () => {
    const root = mkHubRoot();
    try {
        writeFile(root, 'tests/empire_tests/scenario_only.feature', 'Scenario: minimal\n  Given x\n  Then y\n');
        writeFile(root, 'tests/unit/s.test.ts');
        const verdict = verifySterlingMandate(bead(), {
            lore_paths: ['tests/empire_tests/scenario_only.feature'],
            isolation_paths: ['tests/unit/s.test.ts'],
            audit: { warden_results: [{ name: 'norn', verdict: 'ACCEPTED', ran_at: 1 }] },
        }, root);
        assert.strictEqual(verdict.verdict, 'ACCEPTED');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
