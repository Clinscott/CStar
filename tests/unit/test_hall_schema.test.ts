import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    closeDb,
    getDb,
    getHallBeads,
    getHallEpisodicMemory,
    getHallSkillProposal,
    getHallRepositoryRecord,
    getHallSummary,
    listHallEpisodicMemory,
    listHallSkillProposals,
    migrateLegacyHallRecords,
    recordHallScan,
    saveHallEpisodicMemory,
    saveHallValidationRun,
    saveHallSkillProposal,
    upsertHallRepository,
    upsertHallBead,
} from '../../src/tools/pennyone/intel/database.ts';
import { registry } from '../../src/tools/pennyone/pathRegistry.ts';
import { buildHallRepositoryId } from '../../src/types/hall.ts';
import { StateRegistry } from '../../src/node/core/state.ts';

describe('Hall schema canonicalization (CS-P1-03)', () => {
    let tmpRoot: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-hall-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'sovereign_state.json'),
            JSON.stringify(
                {
                    framework: {
                        status: 'AWAKE',
                        active_persona: 'ODIN',
                        gungnir_score: 88,
                        intent_integrity: 92,
                        last_awakening: 1700000000000,
                    },
                    hall_of_records: {
                        description: 'Test Hall',
                    },
                },
                null,
                2,
            ),
            'utf-8',
        );
        registry.setRoot(tmpRoot);
        closeDb();
    });

    afterEach(() => {
        closeDb();
    });

    it('bootstraps the hall repository projection from the workspace state', () => {
        getDb();

        const summary = getHallSummary(tmpRoot);
        assert.ok(summary);
        assert.strictEqual(summary?.repo_id, buildHallRepositoryId(tmpRoot.replace(/\\/g, '/')));
        assert.strictEqual(summary?.status, 'AWAKE');
        assert.strictEqual(summary?.active_persona, 'ODIN');
        assert.strictEqual(summary?.baseline_gungnir_score, 88);
        assert.strictEqual(summary?.intent_integrity, 92);
    });

    it('migrates legacy traces and beads into canonical hall tables', () => {
        const db = getDb();
        db.prepare(
            "INSERT INTO norn_beads (description, status, agent_id, timestamp) VALUES (?, ?, ?, ?)",
        ).run('Legacy bead', 'OPEN', 'RAVEN-1', 1700000001000);
        db.prepare(
            `INSERT INTO mission_traces (
                mission_id, file_path, target_metric, initial_score, final_score, justification, status, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run('mission-1', 'src/core/vector.py', 'LOGIC', 55, 89, 'Legacy promotion', 'SUCCESS', 1700000002000);

        const result = migrateLegacyHallRecords(tmpRoot);
        const summary = getHallSummary(tmpRoot);
        const hallDb = getDb();
        const validationCount = hallDb.prepare('SELECT COUNT(*) as count FROM hall_validation_runs').get() as { count: number };
        const beadCount = hallDb.prepare('SELECT COUNT(*) as count FROM hall_beads').get() as { count: number };

        assert.strictEqual(result.scans, 1);
        assert.strictEqual(result.beads, 1);
        assert.strictEqual(result.validation_runs, 1);
        assert.strictEqual(summary?.open_beads, 0);
        assert.strictEqual(summary?.validation_runs, 1);
        assert.strictEqual(validationCount.count, 1);
        assert.strictEqual(beadCount.count, 1);

        const legacyBead = getHallBeads(tmpRoot).find((bead) => bead.id === 'legacy-bead:1');
        assert.strictEqual(legacyBead?.status, 'NEEDS_TRIAGE');
        assert.strictEqual(legacyBead?.source_kind, 'LEGACY_IMPORT');
    });

    it('makes StateRegistry read hall-backed projection values', () => {
        getDb();
        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AGENT_LOOP',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 91,
            intent_integrity: 96,
            metadata: { source: 'test' },
            created_at: 1700000000000,
            updated_at: 1700000001000,
        });
        recordHallScan({
            scan_id: 'scan-1',
            repo_id: buildHallRepositoryId(tmpRoot.replace(/\\/g, '/')),
            scan_kind: 'baseline',
            status: 'COMPLETED',
            baseline_gungnir_score: 91,
            started_at: 1700000000000,
            completed_at: 1700000004000,
            metadata: {},
        });
        upsertHallBead({
            bead_id: 'bead-1',
            repo_id: buildHallRepositoryId(tmpRoot.replace(/\\/g, '/')),
            rationale: 'Fix the vector layer',
            status: 'OPEN',
            created_at: 1700000003000,
            updated_at: 1700000003000,
        });
        saveHallValidationRun({
            validation_id: 'validation-1',
            repo_id: buildHallRepositoryId(tmpRoot.replace(/\\/g, '/')),
            scan_id: 'scan-1',
            verdict: 'ACCEPTED',
            created_at: 1700000005000,
            pre_scores: { overall: 72 },
            post_scores: { overall: 91 },
        });

        const state = StateRegistry.get();
        assert.strictEqual(state.framework.status, 'AGENT_LOOP');
        assert.strictEqual(state.framework.active_persona, 'ALFRED');
        assert.strictEqual(state.framework.gungnir_score, 91);
        assert.strictEqual(state.framework.intent_integrity, 96);
    });

    it('does not let stale sovereign_state projection overwrite hall authority after bootstrap', () => {
        getDb();
        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AGENT_LOOP',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 93,
            intent_integrity: 97,
            metadata: {
                source: 'hall-authority',
                sovereign_projection: {
                    framework: {
                        last_awakening: 1700000005000,
                        mission_id: 'MISSION-777',
                        active_task: 'Protect the Hall',
                    },
                    identity: {
                        name: 'Hall Authority',
                        tagline: 'Canonical.',
                        guiding_principles: ['One authority'],
                        use_systems: {
                            interface: 'HUD',
                            orchestration: 'Runtime',
                            intelligence: 'Bridge',
                            memory: 'Hall',
                            visualization: 'PennyOne',
                        },
                    },
                    hall_of_records: {
                        description: 'Canonical Hall',
                        primary_assets: {
                            database: '.stats/pennyone.db',
                            contracts: '.agents/skills/*.feature',
                            lore: '.agents/lore/',
                            history: 'dev_journal.qmd',
                        },
                    },
                },
            },
            created_at: 1700000000000,
            updated_at: 1700000005000,
        });

        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'sovereign_state.json'),
            JSON.stringify(
                {
                    framework: {
                        status: 'DORMANT',
                        active_persona: 'ODIN',
                        gungnir_score: 1,
                        intent_integrity: 2,
                        last_awakening: 1,
                    },
                },
                null,
                2,
            ),
            'utf-8',
        );

        closeDb();
        getDb();

        const summary = getHallSummary(tmpRoot);
        const record = getHallRepositoryRecord(tmpRoot);

        assert.strictEqual(summary?.status, 'AGENT_LOOP');
        assert.strictEqual(summary?.active_persona, 'ALFRED');
        assert.strictEqual(summary?.baseline_gungnir_score, 93);
        assert.strictEqual(summary?.intent_integrity, 97);
        assert.strictEqual((record?.metadata as { source?: string })?.source, 'hall-authority');
        assert.strictEqual(
            ((record?.metadata as {
                sovereign_projection?: { identity?: { name?: string } };
            })?.sovereign_projection?.identity?.name),
            'Hall Authority',
        );
    });

    it('projects hall beads into the sovereign bead contract', () => {
        getDb();
        const repoId = buildHallRepositoryId(tmpRoot.replace(/\\/g, '/'));

        recordHallScan({
            scan_id: 'scan-bead-1',
            repo_id: repoId,
            scan_kind: 'baseline',
            status: 'COMPLETED',
            baseline_gungnir_score: 4.4,
            started_at: 1700000000000,
            completed_at: 1700000000100,
            metadata: {},
        });
        upsertHallBead({
            bead_id: 'bead-1',
            repo_id: repoId,
            scan_id: 'scan-bead-1',
            target_path: 'src/core/vector.py',
            rationale: 'Repair vector scoring',
            contract_refs: ['contracts:vector'],
            baseline_scores: { overall: 2.1, scan_baseline: 4.4 },
            acceptance_criteria: 'Raise the baseline above 5.0.',
            status: 'OPEN',
            created_at: 1700000000200,
            updated_at: 1700000000200,
        });

        const beads = getHallBeads(tmpRoot, ['OPEN']);
        assert.strictEqual(beads.length, 1);
        assert.strictEqual(beads[0]?.id, 'bead-1');
        assert.strictEqual(beads[0]?.scan_id, 'scan-bead-1');
        assert.strictEqual(beads[0]?.target_kind, 'FILE');
        assert.strictEqual(beads[0]?.target_ref, 'src/core/vector.py');
        assert.strictEqual(beads[0]?.baseline_scores.overall, 2.1);
    });

    it('persists Hall skill proposals separately from skill observations', () => {
        getDb();
        const repoId = buildHallRepositoryId(tmpRoot.replace(/\\/g, '/'));
        upsertHallBead({
            bead_id: 'bead-1',
            repo_id: repoId,
            rationale: 'Improve evolve contract defaults',
            status: 'READY_FOR_REVIEW',
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });
        saveHallValidationRun({
            validation_id: 'validation-1',
            repo_id: repoId,
            bead_id: 'bead-1',
            verdict: 'ACCEPTED',
            sprt_verdict: 'ACCEPTED',
            created_at: 1700000000100,
            pre_scores: { overall: 7.1 },
            post_scores: { overall: 7.5 },
        });

        saveHallSkillProposal({
            proposal_id: 'proposal:evolve-1',
            repo_id: repoId,
            skill_id: 'evolve',
            bead_id: 'bead-1',
            validation_id: 'validation-1',
            target_path: '.agents/skills/evolve/contract.json',
            contract_path: '.agents/skills/evolve/contract.json',
            proposal_path: '.agents/proposals/evolve/proposal_evolve_1.json',
            status: 'PROPOSED',
            summary: 'Promote validated defaults into the canonical evolve contract.',
            created_at: 1700000000000,
            updated_at: 1700000000000,
            metadata: { source: 'unit-test' },
        });

        const proposal = getHallSkillProposal('proposal:evolve-1');
        const proposals = listHallSkillProposals(tmpRoot, { skill_id: 'evolve' });

        assert.ok(proposal);
        assert.strictEqual(proposal?.skill_id, 'evolve');
        assert.strictEqual(proposal?.validation_id, 'validation-1');
        assert.strictEqual(proposal?.status, 'PROPOSED');
        assert.deepStrictEqual(proposal?.metadata, { source: 'unit-test' });
        assert.strictEqual(proposals.length, 1);
        assert.strictEqual(proposals[0]?.proposal_path, '.agents/proposals/evolve/proposal_evolve_1.json');
    });

    it('persists Hall episodic memory as narrative thread history', () => {
        getDb();
        const repoId = buildHallRepositoryId(tmpRoot.replace(/\\/g, '/'));
        upsertHallBead({
            bead_id: 'bead-episodic-1',
            repo_id: repoId,
            rationale: 'Capture the tactical summary for a completed bead.',
            status: 'RESOLVED',
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });

        saveHallEpisodicMemory({
            memory_id: 'memory-1',
            bead_id: 'bead-episodic-1',
            repo_id: repoId,
            tactical_summary: 'Persisted the Hall-backed compressor output.',
            files_touched: ['src/node/core/runtime/weaves/compress.ts'],
            successes: ['Wrote episodic memory'],
            metadata: { source: 'unit-test', bead_intent: 'Persist tactical summary' },
            created_at: 1700000000100,
            updated_at: 1700000000100,
        });

        const memory = getHallEpisodicMemory('memory-1', tmpRoot);
        const memories = listHallEpisodicMemory(tmpRoot, 'bead-episodic-1');

        assert.ok(memory);
        assert.strictEqual(memory?.bead_id, 'bead-episodic-1');
        assert.strictEqual(memory?.tactical_summary, 'Persisted the Hall-backed compressor output.');
        assert.deepStrictEqual(memory?.files_touched, ['src/node/core/runtime/weaves/compress.ts']);
        assert.deepStrictEqual(memory?.successes, ['Wrote episodic memory']);
        assert.deepStrictEqual(memory?.metadata, { source: 'unit-test', bead_intent: 'Persist tactical summary' });
        assert.strictEqual(memories.length, 1);
        assert.strictEqual(memories[0]?.memory_id, 'memory-1');
    });
});
