import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { handleDoctor, handleHallSearch, handleHandoff, handleVerifyPlan } from '../../src/tools/cstar-kernel-mcp/tools/hall.js';
import { handlePennyOneContext } from '../../src/tools/cstar-kernel-mcp/tools/pennyone_context.js';
import { handleStatus } from '../../src/tools/cstar-kernel-mcp/tools/status.js';
import { database } from '../../src/tools/pennyone/intel/database.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath, type HallValidationEvidenceManifest } from '../../src/types/hall.js';
import { hashValidationEvidenceManifest } from '../../src/types/validation_evidence.js';

type FileSnapshot = Record<string, { bytes: number; mtime_ms: number; sha256: string }>;

function snapshotFiles(root: string): FileSnapshot {
    const snapshot: FileSnapshot = {};
    const visit = (directory: string): void => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const absolute = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                visit(absolute);
                continue;
            }
            const stat = fs.statSync(absolute);
            snapshot[path.relative(root, absolute).replace(/\\/g, '/')] = {
                bytes: stat.size,
                mtime_ms: stat.mtimeMs,
                sha256: createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'),
            };
        }
    };
    visit(root);
    return snapshot;
}

async function exerciseHallReadHandlers(): Promise<void> {
    await handleStatus();
    await handleDoctor();
    await handleHandoff();
    await handleVerifyPlan();
    await handleHallSearch({ query: 'synthetic no write' });
    await handlePennyOneContext({ action: 'status' });
    await handlePennyOneContext({ action: 'bead_summary', limit: 3 });
    await handlePennyOneContext({ action: 'repository_summary' });
}

describe('Hall READ and bead persistence side-effect boundaries', () => {
    let root: string;
    let previousRoot: string;

    beforeEach(() => {
        previousRoot = registry.getRoot();
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-hall-read-boundary-'));
        registry.setRoot(root);
        database.close();
    });

    afterEach(() => {
        database.close();
        registry.setRoot(previousRoot);
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('does not create a Hall store, directory, schema, or seed row for READ handlers when the store is missing', async () => {
        const before = snapshotFiles(root);

        await exerciseHallReadHandlers();

        assert.deepEqual(snapshotFiles(root), before);
        assert.equal(fs.existsSync(path.join(root, '.stats')), false);
        assert.throws(() => database.getReadDb(root), /hall_store_missing/);
    });

    it('requires every production caller to choose read-only or writable Hall access explicitly', () => {
        const sourceRoot = path.join(process.cwd(), 'src');
        const ambiguous: string[] = [];
        const visit = (directory: string): void => {
            for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
                const absolute = path.join(directory, entry.name);
                if (entry.isDirectory()) {
                    visit(absolute);
                    continue;
                }
                if (!/\.(?:ts|js)$/.test(entry.name)
                    || absolute.endsWith(path.join('pennyone', 'intel', 'database.ts'))) {
                    continue;
                }
                if (/\bdatabase\.getDb\s*\(/.test(fs.readFileSync(absolute, 'utf8'))) {
                    ambiguous.push(path.relative(sourceRoot, absolute).replace(/\\/g, '/'));
                }
            }
        };
        visit(sourceRoot);
        assert.deepEqual(ambiguous, []);
    });

    it('documents the read, bootstrap, legacy-import, and bead side-effect contracts', () => {
        const operation = fs.readFileSync(
            path.join(process.cwd(), 'docs', 'operations', 'hall-read-and-bead-persistence-boundary.md'),
            'utf8',
        );
        const feature = fs.readFileSync(
            path.join(process.cwd(), 'tests', 'features', 'cstar_hall_read_only_boundary.feature'),
            'utf8',
        );
        for (const required of [
            'getReadDb',
            'getWritableDb',
            'hall_store_missing',
            'explicit migration operation',
            'does not post a blackboard entry',
        ]) {
            assert.match(operation.replace(/\s+/g, ' '), new RegExp(required));
        }
        assert.match(feature, /READ handler encounters a missing Hall store/);
        assert.match(feature, /no blackboard, presence, mounted-spoke, coordination-event, or legacy state write/);
    });

    it('opens an existing Hall store read-only without DDL, seed, migration, or file mutation', async () => {
        const agents = path.join(root, '.agents');
        fs.mkdirSync(agents, { recursive: true });
        fs.writeFileSync(path.join(agents, 'sovereign_state.json'), JSON.stringify({
            framework: {
                status: 'AWAKE',
                active_persona: 'synthetic-persona',
                gungnir_score: 99,
                intent_integrity: 98,
                last_awakening: 123,
            },
            identity: { synthetic: true },
        }));

        const writable = database.getWritableDb(root);
        const repository = writable.prepare(`
            SELECT status, active_persona, baseline_gungnir_score, intent_integrity, metadata_json
            FROM hall_repositories
            WHERE repo_id = ?
        `).get(buildHallRepositoryId(normalizeHallPath(root))) as Record<string, unknown>;
        assert.equal(repository.status, 'DORMANT');
        assert.equal(repository.active_persona, '');
        assert.equal(repository.baseline_gungnir_score, 0);
        assert.equal(repository.intent_integrity, 0);
        assert.equal(JSON.parse(String(repository.metadata_json)).source, 'hall-schema-bootstrap');
        database.close();

        const before = snapshotFiles(root);
        await exerciseHallReadHandlers();
        database.close();

        assert.deepEqual(snapshotFiles(root), before);
    });

    it('persists terminal bead state only in hall_beads without blackboard or coordination projections', () => {
        const agents = path.join(root, '.agents');
        fs.mkdirSync(agents, { recursive: true });
        const statePath = path.join(agents, 'sovereign_state.json');
        const initialState = JSON.stringify({
            framework: { status: 'DORMANT', bead_id: 'unrelated-bead' },
            managed_spokes: [{ slug: 'unrelated-spoke' }],
            blackboard: [{ from: 'existing', message: 'preserve me', type: 'INFO', at: 1 }],
        });
        fs.writeFileSync(statePath, initialState);

        const db = database.getWritableDb(root);
        const repoId = buildHallRepositoryId(normalizeHallPath(root));
        for (const status of ['OPEN', 'BLOCKED', 'RESOLVED'] as const) {
            database.upsertHallBead({
                bead_id: 'bead:synthetic:no-side-effects',
                repo_id: repoId,
                target_kind: 'OTHER',
                rationale: `Synthetic ${status} transition`,
                status,
                created_at: 1,
                updated_at: status === 'OPEN' ? 1 : status === 'BLOCKED' ? 2 : 3,
            });
        }

        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM hall_beads').get().count, 1);
        assert.equal(db.prepare('SELECT status FROM hall_beads WHERE bead_id = ?').get('bead:synthetic:no-side-effects').status, 'RESOLVED');
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM hall_coordination_events').get().count, 0);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM hall_agent_presence').get().count, 0);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM hall_mounted_spokes').get().count, 0);
        assert.equal(fs.readFileSync(statePath, 'utf8'), initialState);
    });

    it('persists and updates validation authority evidence instead of dropping Sterling inputs', () => {
        const repoId = buildHallRepositoryId(normalizeHallPath(root));
        database.getWritableDb(root);
        database.upsertHallBead({
            bead_id: 'bead:synthetic:authority',
            repo_id: repoId,
            target_kind: 'VALIDATION',
            rationale: 'Synthetic validation authority persistence fixture.',
            status: 'IN_PROGRESS',
            created_at: 1,
            updated_at: 1,
        });
        const base = {
            validation_id: 'validation:synthetic:authority',
            repo_id: repoId,
            bead_id: 'bead:synthetic:authority',
            verdict: 'SUCCESS' as const,
            pre_scores: {},
            post_scores: {},
            benchmark: {},
            created_at: 1,
        };
        database.saveValidationRun({
            ...base,
            authority_class: 'reported',
            evidence_sha256: 'a'.repeat(64),
            validator_identity: 'synthetic:reported-validator',
        });
        const artifactPath = path.join(root, 'synthetic-validation-artifact.txt');
        const checkPath = path.join(root, 'synthetic-validation-check.txt');
        fs.writeFileSync(artifactPath, 'artifact\n', 'utf-8');
        fs.writeFileSync(checkPath, 'check passed\n', 'utf-8');
        const manifest: HallValidationEvidenceManifest = {
            schema: 'cstar.validation-evidence.v1',
            validator_identity: 'synthetic:independent-validator',
            validator_identity_source: 'test_fixture',
            independent_of_execution: true,
            artifacts: [{
                path: artifactPath,
                sha256: createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex'),
            }],
            checks: [{
                name: 'synthetic check',
                status: 'pass',
                evidence_path: checkPath,
                sha256: createHash('sha256').update(fs.readFileSync(checkPath)).digest('hex'),
            }],
        };
        assert.throws(() => database.saveValidationRun({
                ...base,
                authority_class: 'verified',
                evidence_sha256: hashValidationEvidenceManifest(manifest),
                validator_identity: manifest.validator_identity,
                validator_identity_source: manifest.validator_identity_source,
                evidence_manifest: manifest,
            }), /verified_validation_v1_retired/);

        const fabricatedV2: HallValidationEvidenceManifest = {
            schema: 'cstar.validation-evidence.v2',
            validator_identity: 'codex-thread:invented-validator:turn:invented-turn',
            validator_identity_source: 'codex_request_meta',
            request_thread_id: 'invented-validator',
            request_turn_id: 'invented-turn',
            session_turn_record_sha256: '6'.repeat(64),
            session_turn_record_set_sha256: '7'.repeat(64),
            session_turn_record_count: 1,
            session_turn_first_timestamp: '2026-07-14T00:00:00.000Z',
            session_turn_timestamp: '2026-07-14T00:00:00.000Z',
            subject: {
                repository_id: repoId,
                bead_id: base.bead_id,
                work_receipt_kind: 'forge_execution',
                work_receipt_id: 'forge-execute-invented',
                forge_request_id: 'dispatch-forge-invented',
                forge_request_sha256: '1'.repeat(64),
                decision_id: 'decision-invented',
                target_paths_sha256: '2'.repeat(64),
                attempt_id: 'forge-attempt-invented',
                result_artifact_sha256: null,
                adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
                adapter_version: 'invented-v1',
                external_execution_id: null,
            },
            independence: {
                policy: 'distinct_codex_root_thread_from_forge_requester_and_executor_v1',
                validator_thread_id: 'invented-validator',
                requester_thread_id: 'invented-requester',
                requester_turn_id: 'invented-request-turn',
                requester_record_set_sha256: '3'.repeat(64),
                executor_binding: 'forge_exact_authorizing_turn_v1',
                authorization_id: 'forge-authorization-invented',
                executor_thread_id: 'invented-executor',
                executor_turn_id: 'invented-executor-turn',
                executor_record_sha256: '4'.repeat(64),
                executor_record_set_sha256: '5'.repeat(64),
                executor_record_count: 1,
            },
            artifacts: [{
                path: artifactPath,
                sha256: createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex'),
            }],
            checks: [{
                name: 'fabricated check',
                status: 'pass',
                evidence_path: checkPath,
                sha256: createHash('sha256').update(fs.readFileSync(checkPath)).digest('hex'),
            }],
        };
        assert.throws(() => database.saveValidationRun({
            ...base,
            authority_class: 'verified_v2',
            evidence_sha256: hashValidationEvidenceManifest(fabricatedV2),
            validator_identity: fabricatedV2.validator_identity,
            validator_identity_source: fabricatedV2.validator_identity_source,
            evidence_manifest: fabricatedV2,
        }), /verified_validation_v2_kernel_proof_required/);

        const persisted = database.getValidationRunById(base.validation_id);
        assert.equal(persisted?.authority_class, 'reported');
        assert.equal(persisted?.validator_identity, 'synthetic:reported-validator');
        assert.equal(persisted?.evidence_manifest, undefined);
    });
});
