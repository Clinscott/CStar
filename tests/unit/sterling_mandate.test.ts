import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
    verifySterlingMandate,
    mergeMandateEvidence,
    type MandateEvidence,
    type MandateWardenResult,
} from '../../src/node/core/sterling_mandate.ts';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';
import { database } from '../../src/tools/pennyone/intel/database.js';
import type { HallBeadRecord, HallValidationRun } from '../../src/types/hall.js';

const EVIDENCE_SHA256 = 'a'.repeat(64);

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

function withValidationRoot<T>(root: string, run: () => T): T {
    const previousRoot = registry.getRoot();
    database.close();
    registry.setRoot(root);
    try {
        return run();
    } finally {
        database.close();
        registry.setRoot(previousRoot);
    }
}

function seedValidation(
    targetBead: HallBeadRecord,
    overrides: Partial<HallValidationRun> = {},
): HallValidationRun {
    const record: HallValidationRun = {
        validation_id: overrides.validation_id ?? 'validation:sterling:verified',
        repo_id: overrides.repo_id ?? targetBead.repo_id,
        bead_id: overrides.bead_id ?? targetBead.bead_id,
        verdict: overrides.verdict ?? 'SUCCESS',
        authority_class: overrides.authority_class ?? 'verified',
        evidence_sha256: overrides.evidence_sha256 ?? EVIDENCE_SHA256,
        validator_identity: overrides.validator_identity ?? 'codex-thread:independent-validator',
        created_at: overrides.created_at ?? 1_700_000_000_000,
        ...overrides,
    };
    const now = Date.now();
    database.saveHallRepository({
        repo_id: record.repo_id,
        root_path: path.join(registry.getRoot(), 'repositories', record.repo_id.replace(/[^a-z0-9._-]+/gi, '-')),
        name: 'Sterling test repository',
        status: 'AWAKE',
        active_persona: 'TEST',
        baseline_gungnir_score: 0,
        intent_integrity: 0,
        created_at: now,
        updated_at: now,
    });
    database.upsertHallBead({
        ...targetBead,
        bead_id: record.bead_id ?? targetBead.bead_id,
        repo_id: record.repo_id,
    });
    database.saveValidationRun(record);
    return record;
}

function wardenFromValidation(run: HallValidationRun, overrides: Partial<MandateWardenResult> = {}): MandateWardenResult {
    const verdict = run.verdict === 'ACCEPTED' || run.verdict === 'SUCCESS'
        ? 'ACCEPTED'
        : run.verdict === 'REJECTED' || run.verdict === 'FAILURE'
            ? 'REJECTED'
            : 'INCONCLUSIVE';
    return {
        name: 'norn',
        verdict,
        ran_at: run.created_at,
        validation_id: run.validation_id,
        validator_identity: run.validator_identity!,
        evidence_sha256: run.evidence_sha256!,
        independent_of_execution: true,
        ...overrides,
    };
}

function verifyWithValidation(
    targetBead: HallBeadRecord,
    evidence: Omit<MandateEvidence, 'audit'>,
    root: string,
    validationOverrides: Partial<HallValidationRun> = {},
) {
    return withValidationRoot(root, () => {
        const run = seedValidation(targetBead, validationOverrides);
        return verifySterlingMandate(targetBead, {
            ...evidence,
            audit: { validation_id: run.validation_id },
        }, root);
    });
}

test('ACCEPTED — all three legs satisfied via warden_results', () => {
    const root = mkHubRoot();
    try {
        writeFeature(root, 'tests/empire_tests/foo.feature');
        writeFile(root, 'tests/unit/foo.test.ts');
        const targetBead = bead();
        const verdict = withValidationRoot(root, () => {
            const validation = seedValidation(targetBead);
            return verifySterlingMandate(targetBead, {
                lore_paths: ['tests/empire_tests/foo.feature'],
                isolation_paths: ['tests/unit/foo.test.ts'],
                audit: { warden_results: [wardenFromValidation(validation)] },
            }, root);
        });
        assert.strictEqual(verdict.verdict, 'ACCEPTED');
        assert.strictEqual(verdict.legs.length, 3);
        assert.ok(verdict.legs.every((l) => l.status === 'satisfied'));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('REJECTED — caller-provided gungnir_score is non-authoritative even above baseline', () => {
    const root = mkHubRoot();
    try {
        writeFeature(root, 'tests/empire_tests/g.feature');
        writeFile(root, 'tests/unit/g.test.ts');
        const verdict = verifySterlingMandate(
            bead({ baseline_scores: { gungnir: 75 } }),
            {
                lore_paths: ['tests/empire_tests/g.feature'],
                isolation_paths: ['tests/unit/g.test.ts'],
                audit: { gungnir_score: 80 } as unknown as MandateEvidence['audit'],
            },
            root,
        );
        assert.strictEqual(verdict.verdict, 'REJECTED');
        assert.match(verdict.reasons.join(' '), /caller-provided gungnir_score is a historical metric/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('REJECTED — caller-provided gungnir_score cannot satisfy a no-baseline audit', () => {
    const root = mkHubRoot();
    try {
        writeFeature(root, 'tests/empire_tests/r.feature');
        writeFile(root, 'tests/unit/r.test.ts');
        const verdict = verifySterlingMandate(
            bead(),
            {
                lore_paths: ['tests/empire_tests/r.feature'],
                isolation_paths: ['tests/unit/r.test.ts'],
                audit: { gungnir_score: 100 } as unknown as MandateEvidence['audit'],
            },
            root,
        );
        assert.strictEqual(verdict.verdict, 'REJECTED');
        assert.match(verdict.reasons.join(' '), /caller-provided gungnir_score is a historical metric/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('REJECTED — warden REJECTED verdict short-circuits audit', () => {
    const root = mkHubRoot();
    try {
        writeFeature(root, 'tests/empire_tests/x.feature');
        writeFile(root, 'tests/unit/x.test.ts');
        const targetBead = bead();
        const verdict = withValidationRoot(root, () => {
            const rejected = seedValidation(targetBead, {
                validation_id: 'validation:sterling:rejected',
                verdict: 'FAILURE',
                created_at: 2,
            });
            return verifySterlingMandate(targetBead, {
                lore_paths: ['tests/empire_tests/x.feature'],
                isolation_paths: ['tests/unit/x.test.ts'],
                audit: { warden_results: [wardenFromValidation(rejected, { name: 'freya' })] },
            }, root);
        });
        assert.strictEqual(verdict.verdict, 'REJECTED');
        assert.match(verdict.reasons.join(' '), /verified warden REJECTED: freya/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('REJECTED — missing lore_paths', () => {
    const root = mkHubRoot();
    try {
        writeFile(root, 'tests/unit/i.test.ts');
        const targetBead = bead();
        const verdict = verifyWithValidation(targetBead, {
            isolation_paths: ['tests/unit/i.test.ts'],
        }, root);
        assert.strictEqual(verdict.verdict, 'REJECTED');
        assert.match(verdict.reasons.join(' '), /\[lore\]/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('REJECTED — lore path declared but file missing on disk', () => {
    const root = mkHubRoot();
    try {
        writeFile(root, 'tests/unit/i.test.ts');
        const targetBead = bead();
        const verdict = verifyWithValidation(targetBead, {
            lore_paths: ['tests/empire_tests/missing.feature'],
            isolation_paths: ['tests/unit/i.test.ts'],
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
                audit: { validation_id: 'validation:cached' },
            },
        },
    });
    const merged = mergeMandateEvidence(cachedBead, {
        lore_paths: ['new/lore.feature'],
    });
    assert.deepStrictEqual(merged.lore_paths, ['new/lore.feature']);
    assert.deepStrictEqual(merged.audit, { validation_id: 'validation:cached' });
});

test('mergeMandateEvidence — empty args fall through to cached', () => {
    const cachedBead = bead({
        metadata: {
            mandate_evidence: {
                lore_paths: ['cached.feature'],
                isolation_paths: ['cached.test.ts'],
                audit: { validation_id: 'validation:cached' },
            },
        },
    });
    const merged = mergeMandateEvidence(cachedBead, undefined);
    assert.deepStrictEqual(merged.lore_paths, ['cached.feature']);
    assert.strictEqual(merged.audit?.validation_id, 'validation:cached');
});

test('Absolute lore/isolation paths resolve regardless of hubRoot', () => {
    const root = mkHubRoot();
    const otherRoot = mkHubRoot();
    try {
        const loreAbs = writeFeature(otherRoot, 'lore.feature');
        const isoAbs = writeFile(otherRoot, 'iso.test.ts');
        const targetBead = bead();
        const verdict = verifyWithValidation(targetBead, {
            lore_paths: [loreAbs],
            isolation_paths: [isoAbs],
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
        const targetBead = bead();
        const verdict = withValidationRoot(root, () => {
            const validation = seedValidation(targetBead, { verdict: 'INCONCLUSIVE' });
            return verifySterlingMandate(targetBead, {
                lore_paths: ['l.feature'],
                isolation_paths: ['i.test.ts'],
                audit: { warden_results: [wardenFromValidation(validation)] },
            }, root);
        });
        assert.strictEqual(verdict.verdict, 'REJECTED');
        assert.match(verdict.reasons.join(' '), /verified warden INCONCLUSIVE/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('ACCEPTED — a positive verified validation receipt satisfies the audit leg', () => {
    const root = mkHubRoot();
    try {
        writeFeature(root, 'l.feature');
        writeFile(root, 'i.test.ts');
        const targetBead = bead();
        const verdict = verifyWithValidation(targetBead, {
            lore_paths: ['l.feature'],
            isolation_paths: ['i.test.ts'],
        }, root);
        assert.strictEqual(verdict.verdict, 'ACCEPTED');
        assert.match(verdict.legs.find((leg) => leg.leg === 'audit')?.reason ?? '', /authority=verified/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('REJECTED — internal or reported validation receipts are non-authoritative', () => {
    const root = mkHubRoot();
    try {
        writeFeature(root, 'l.feature');
        writeFile(root, 'i.test.ts');
        const targetBead = bead();
        for (const authority_class of ['internal', 'reported'] as const) {
            const verdict = verifyWithValidation(targetBead, {
                lore_paths: ['l.feature'],
                isolation_paths: ['i.test.ts'],
            }, root, {
                validation_id: `validation:sterling:${authority_class}`,
                authority_class,
            });
            assert.strictEqual(verdict.verdict, 'REJECTED');
            assert.match(verdict.reasons.join(' '), new RegExp(`authority_class=${authority_class} \\(need verified\\)`));
        }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('REJECTED — a verified validation receipt for another bead cannot be reused', () => {
    const root = mkHubRoot();
    try {
        writeFeature(root, 'l.feature');
        writeFile(root, 'i.test.ts');
        const targetBead = bead();
        const verdict = verifyWithValidation(targetBead, {
            lore_paths: ['l.feature'],
            isolation_paths: ['i.test.ts'],
        }, root, { bead_id: 'bead:other' });
        assert.strictEqual(verdict.verdict, 'REJECTED');
        assert.match(verdict.reasons.join(' '), /expected repo=repo:test, bead=bead:test:1/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('REJECTED — warden claims must match the stored validator and evidence digest', () => {
    const root = mkHubRoot();
    try {
        writeFeature(root, 'l.feature');
        writeFile(root, 'i.test.ts');
        const targetBead = bead();
        const verdict = withValidationRoot(root, () => {
            const validation = seedValidation(targetBead);
            return verifySterlingMandate(targetBead, {
                lore_paths: ['l.feature'],
                isolation_paths: ['i.test.ts'],
                audit: {
                    warden_results: [wardenFromValidation(validation, { evidence_sha256: 'b'.repeat(64) })],
                },
            }, root);
        });
        assert.strictEqual(verdict.verdict, 'REJECTED');
        assert.match(verdict.reasons.join(' '), /evidence_sha256 does not match validation receipt/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('REJECTED — lore .feature file lacks Gherkin keywords', () => {
    const root = mkHubRoot();
    try {
        writeFile(root, 'tests/empire_tests/junk.feature', 'this is just prose, not Gherkin\n');
        writeFile(root, 'tests/unit/junk.test.ts');
        const targetBead = bead();
        const verdict = verifyWithValidation(targetBead, {
            lore_paths: ['tests/empire_tests/junk.feature'],
            isolation_paths: ['tests/unit/junk.test.ts'],
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
        const targetBead = bead();
        const verdict = verifyWithValidation(targetBead, {
            lore_paths: ['tests/empire_tests/scenario_only.feature'],
            isolation_paths: ['tests/unit/s.test.ts'],
        }, root);
        assert.strictEqual(verdict.verdict, 'ACCEPTED');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
