import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    closeDb,
    getDb,
    getHallBeads,
    getHallDocument,
    getHallDocumentVersion,
    getHallEpisodicMemory,
    getHallSkillProposal,
    getHallRepositoryRecord,
    getHallSummary,
    listHallDocumentVersions,
    listHallEpisodicMemory,
    listHallSkillProposals,
    migrateLegacyHallRecords,
    recordHallScan,
    restoreHallDocumentVersion,
    saveHallDocumentSnapshot,
    saveHallEpisodicMemory,
    saveHallPlanningSession,
    saveHallValidationRun,
    saveHallSkillProposal,
    backfillHallBeadMetadata,
    backfillHallDocumentMetadata,
    backfillHallPlanningSessionMetadata,
    backfillHallSkillProposalMetadata,
    listHallRepositories,
    reconcileLegacyHallRepositoryAliases,
    getHallPlanningSession,
    upsertHallRepository,
    upsertHallBead,
} from '../../src/tools/pennyone/intel/database.ts';
import { registry } from  '../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId } from  '../../src/types/hall.js';
import { StateRegistry } from  '../../src/node/core/state.js';

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

    it('reconciles legacy relative repository aliases onto the canonical absolute root', () => {
        const db = getDb();
        const canonicalRepoId = buildHallRepositoryId(tmpRoot.replace(/\\/g, '/'));

        db.prepare(`
            INSERT INTO hall_repositories (
                repo_id, root_path, name, status, active_persona, baseline_gungnir_score,
                intent_integrity, metadata_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'repo:.',
            '.',
            '.',
            'DORMANT',
            'ALFRED',
            0,
            0,
            JSON.stringify({ source: 'legacy-sovereign-projection' }),
            1,
            2,
        );

        db.prepare(`
            INSERT INTO hall_skill_proposals (
                proposal_id, repo_id, skill_id, status, created_at, updated_at, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            'proposal:legacy-alias',
            'repo:.',
            'chant',
            'PROPOSED',
            10,
            20,
            JSON.stringify({}),
        );

        assert.equal(reconcileLegacyHallRepositoryAliases(tmpRoot), 1);

        const repositories = listHallRepositories().map((entry) => entry.root_path);
        assert.ok(!repositories.includes('.'));

        const canonical = getHallRepositoryRecord(tmpRoot);
        assert.equal(canonical?.repo_id, canonicalRepoId);

        const proposal = getHallSkillProposal('proposal:legacy-alias');
        assert.equal(proposal?.repo_id, canonicalRepoId);
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
            checker_shell: 'node --test tests/unit/test_hall_schema.test.ts',
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
        assert.strictEqual(beads[0]?.checker_shell, 'node --test tests/unit/test_hall_schema.test.ts');
        assert.equal(beads[0]?.metadata?.authority_tier, 'reference');
        assert.equal(beads[0]?.metadata?.archived, false);
    });

    it('infers explicit authority metadata for Hall beads and planning sessions', () => {
        getDb();
        const repoId = buildHallRepositoryId(tmpRoot.replace(/\\/g, '/'));

        upsertHallBead({
            bead_id: 'bead-archived-doctrine',
            repo_id: repoId,
            target_path: 'docs/legacy_archive/root_docs/tasks.qmd',
            rationale: 'Archived doctrine bead.',
            status: 'SUPERSEDED',
            created_at: 1700000000200,
            updated_at: 1700000000200,
        });
        saveHallPlanningSession({
            session_id: 'chant-session:authority-metadata',
            repo_id: repoId,
            skill_id: 'chant',
            status: 'PROPOSAL_REVIEW',
            user_intent: 'Verify authority metadata persistence.',
            normalized_intent: 'Verify authority metadata persistence.',
            summary: 'Authority metadata session',
            created_at: 1700000000300,
            updated_at: 1700000000300,
        });

        const archivedBead = getHallBeads(tmpRoot).find((bead) => bead.id === 'bead-archived-doctrine');
        const planningSession = getHallPlanningSession('chant-session:authority-metadata');

        assert.equal(archivedBead?.metadata?.authority_tier, 'archive');
        assert.equal(archivedBead?.metadata?.archived, true);
        assert.equal(planningSession?.metadata?.authority_tier, 'live_authority');
        assert.equal(planningSession?.metadata?.archived, false);
    });

    it('backfills missing authority metadata for legacy Hall beads and planning sessions', () => {
        const db = getDb();
        const repoId = buildHallRepositoryId(tmpRoot.replace(/\\/g, '/'));

        upsertHallBead({
            bead_id: 'bead-legacy-backfill',
            repo_id: repoId,
            target_path: 'docs/legacy_archive/root_docs/tasks.qmd',
            rationale: 'Legacy archived doctrine.',
            status: 'ARCHIVED',
            metadata: {},
            created_at: 1700000000400,
            updated_at: 1700000000400,
        });
        saveHallPlanningSession({
            session_id: 'chant-session:legacy-backfill',
            repo_id: repoId,
            skill_id: 'chant',
            status: 'PROPOSAL_REVIEW',
            user_intent: 'Legacy planning session.',
            normalized_intent: 'Legacy planning session.',
            metadata: {},
            created_at: 1700000000500,
            updated_at: 1700000000500,
        });

        db.prepare('UPDATE hall_beads SET metadata_json = NULL WHERE bead_id = ?').run('bead-legacy-backfill');
        db.prepare('UPDATE hall_planning_sessions SET metadata_json = NULL WHERE session_id = ?').run('chant-session:legacy-backfill');

        assert.equal(backfillHallBeadMetadata(tmpRoot), 1);
        assert.equal(backfillHallPlanningSessionMetadata(tmpRoot), 1);

        const beadMetadataRow = db.prepare('SELECT metadata_json FROM hall_beads WHERE bead_id = ?').get('bead-legacy-backfill') as { metadata_json: string | null };
        const sessionMetadataRow = db.prepare('SELECT metadata_json FROM hall_planning_sessions WHERE session_id = ?').get('chant-session:legacy-backfill') as { metadata_json: string | null };

        assert.match(beadMetadataRow.metadata_json ?? '', /"authority_tier":"archive"/);
        assert.match(beadMetadataRow.metadata_json ?? '', /"archived":true/);
        assert.match(sessionMetadataRow.metadata_json ?? '', /"authority_tier":"live_authority"/);
        assert.match(sessionMetadataRow.metadata_json ?? '', /"archived":false/);
    });

    it('backfills missing authority metadata for legacy Hall documents', () => {
        const db = getDb();

        saveHallDocumentSnapshot({
            root_path: tmpRoot,
            document_path: 'docs/legacy_archive/ARCHITECT_PLAN.md',
            content: '# Architect Plan\n\nLegacy archived doctrine.\n',
            doc_kind: 'legacy',
            metadata: {},
            created_at: 1700000000600,
        });

        db.prepare('UPDATE hall_documents SET metadata_json = NULL WHERE path = ?').run('docs/legacy_archive/ARCHITECT_PLAN.md');

        assert.equal(backfillHallDocumentMetadata(tmpRoot), 1);

        const documentMetadataRow = db.prepare('SELECT metadata_json FROM hall_documents WHERE path = ?').get('docs/legacy_archive/ARCHITECT_PLAN.md') as { metadata_json: string | null };
        assert.match(documentMetadataRow.metadata_json ?? '', /"authority_tier":"archive"/);
        assert.match(documentMetadataRow.metadata_json ?? '', /"archived":true/);
    });

    it('preserves checker_shell when a bead is status-updated without re-supplying validation', () => {
        getDb();
        const repoId = buildHallRepositoryId(tmpRoot.replace(/\\/g, '/'));
        const createdAt = 1700000000200;

        upsertHallBead({
            bead_id: 'bead-preserve-checker',
            repo_id: repoId,
            target_path: 'src/core/vector.py',
            rationale: 'Repair vector scoring',
            acceptance_criteria: 'Raise the baseline above 5.0.',
            checker_shell: 'node --test tests/unit/test_hall_schema.test.ts',
            status: 'OPEN',
            created_at: createdAt,
            updated_at: createdAt,
        });

        upsertHallBead({
            bead_id: 'bead-preserve-checker',
            repo_id: repoId,
            target_path: 'src/core/vector.py',
            rationale: 'Repair vector scoring',
            acceptance_criteria: 'Raise the baseline above 5.0.',
            status: 'IN_PROGRESS',
            assigned_agent: 'SOVEREIGN-WORKER',
            created_at: createdAt,
            updated_at: createdAt + 1,
        });

        const bead = getHallBeads(tmpRoot).find((entry) => entry.id === 'bead-preserve-checker');
        assert.strictEqual(bead?.status, 'IN_PROGRESS');
        assert.strictEqual(bead?.checker_shell, 'node --test tests/unit/test_hall_schema.test.ts');
    });

    it('counts SET-gated beads in the hall repository summary projection', () => {
        getDb();
        const repoId = buildHallRepositoryId(tmpRoot.replace(/\\/g, '/'));
        const createdAt = 1700000000200;

        upsertHallBead({
            bead_id: 'bead-open',
            repo_id: repoId,
            rationale: 'Draft bead still open.',
            status: 'OPEN',
            created_at: createdAt,
            updated_at: createdAt,
        });
        upsertHallBead({
            bead_id: 'bead-set-pending',
            repo_id: repoId,
            rationale: 'Awaiting explicit set dictate.',
            status: 'SET-PENDING',
            created_at: createdAt + 1,
            updated_at: createdAt + 1,
        });
        upsertHallBead({
            bead_id: 'bead-set',
            repo_id: repoId,
            rationale: 'Approved for execution.',
            status: 'SET',
            created_at: createdAt + 2,
            updated_at: createdAt + 2,
        });

        const summary = getHallSummary(tmpRoot);
        const statuses = getHallBeads(tmpRoot).map((bead) => bead.status);

        assert.strictEqual(summary?.open_beads, 3);
        assert.deepStrictEqual(statuses, ['OPEN', 'SET-PENDING', 'SET']);
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
        assert.deepStrictEqual(proposal?.metadata, {
            source: 'unit-test',
            authority_tier: 'reference',
            archived: false,
        });
        assert.strictEqual(proposals.length, 1);
        assert.strictEqual(proposals[0]?.proposal_path, '.agents/proposals/evolve/proposal_evolve_1.json');
    });

    it('backfills Hall skill proposal metadata for legacy proposal rows', () => {
        getDb();
        const repoId = buildHallRepositoryId(tmpRoot.replace(/\\/g, '/'));

        saveHallSkillProposal({
            proposal_id: 'proposal:legacy-live',
            repo_id: repoId,
            skill_id: 'chant',
            target_path: 'src/node/core/runtime/host_workflows/chant.ts',
            status: 'PROPOSED',
            created_at: 1700000000000,
            updated_at: 1700000000000,
            metadata: { source: 'unit-test' },
        });

        const db = getDb();
        db.prepare('UPDATE hall_skill_proposals SET metadata_json = ? WHERE proposal_id = ?').run(
            JSON.stringify({ source: 'unit-test' }),
            'proposal:legacy-live',
        );

        assert.equal(backfillHallSkillProposalMetadata(tmpRoot), 1);

        const proposal = getHallSkillProposal('proposal:legacy-live');
        assert.deepStrictEqual(proposal?.metadata, {
            source: 'unit-test',
            authority_tier: 'live_authority',
            archived: false,
        });
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

    it('persists versioned Hall documents and restores prior content', () => {
        getDb();
        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AWAKE',
            active_persona: 'ODIN',
            baseline_gungnir_score: 88,
            intent_integrity: 92,
            metadata: { source: 'test' },
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });

        const first = saveHallDocumentSnapshot({
            root_path: tmpRoot,
            document_path: 'docs/foundation/XO_MEMORY_MODEL.md',
            content: '# XO Memory Model\n\nFirst summary line.\n',
            doc_kind: 'foundation',
            created_at: 1700000001000,
        });
        const second = saveHallDocumentSnapshot({
            root_path: tmpRoot,
            document_path: 'docs/foundation/XO_MEMORY_MODEL.md',
            content: '# XO Memory Model\n\nSecond summary line.\n',
            doc_kind: 'foundation',
            created_at: 1700000002000,
        });

        const document = getHallDocument(tmpRoot, 'docs/foundation/XO_MEMORY_MODEL.md');
        const latestVersion = getHallDocumentVersion(second.version.version_id);
        const versions = listHallDocumentVersions(first.document.document_id);
        const restorePath = path.join(tmpRoot, 'restore', 'XO_MEMORY_MODEL.md');
        const restored = restoreHallDocumentVersion(first.version.version_id, restorePath);

        assert.ok(document);
        assert.equal(document?.latest_version_id, second.version.version_id);
        assert.equal(document?.title, 'XO Memory Model');
        assert.equal(document?.latest_summary, 'Second summary line.');
        assert.equal(document?.metadata?.authority_tier, 'reference');
        assert.equal(document?.metadata?.archived, false);
        assert.equal(latestVersion?.summary, 'Second summary line.');
        assert.equal(versions.length, 2);
        assert.equal(restored.path, restorePath.replace(/\\/g, '/'));
        assert.equal(fs.readFileSync(restorePath, 'utf-8'), '# XO Memory Model\n\nFirst summary line.\n');
    });
});
