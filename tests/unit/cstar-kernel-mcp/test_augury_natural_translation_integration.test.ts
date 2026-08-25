import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { handleAugury } from '../../../src/tools/cstar-kernel-mcp/tools/augury.js';
import { prepareAuguryMissionBoundary } from
    '../../../src/tools/cstar-kernel-mcp/tools/augury_mission_binding.js';
import type { AuguryMissionBoundaryInput, AuguryMissionBoundaryInputV2 } from
    '../../../src/tools/cstar-kernel-mcp/contracts/augury_mission.js';
import { verifyCodexRequestIdentity } from
    '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import { database, closeDb } from '../../../src/tools/pennyone/intel/database.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import {
    buildAutomaticMissionDispatchRepositoryId,
} from '../../../src/tools/pennyone/intel/automatic_mission_dispatch_store.js';
import {
    appendUserMessage,
    cleanupOperatorAuthorizationFixtures,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';

const DECISION = 'decision:cstar-state-only-luna-host-seam-batch1-20260803';
const PARENT = 'bead:cstar:state-only-luna-host-seam-batch1-20260803:parent';
const DESIGN = 'e775daf70c27f5ca4c455a7494c4fab55434ade314caffd717bb812bea42579a';
const TARGETS = [
    'docs/architecture/mission.md',
    'docs/operations/closeout.md',
    'docs/operations/runbook.md',
    'docs/research/evidence.md',
    'src/contracts/boundary.ts',
    'src/contracts/receipt.ts',
    'src/kernel/augury.ts',
    'src/kernel/identity.ts',
    'src/kernel/materializer.ts',
    'src/kernel/translation.ts',
    'src/tools/augury.ts',
    'src/tools/dispatch.ts',
    'src/tools/receipt.ts',
    'src/tools/set.ts',
    'tests/contracts/mission.test.ts',
    'tests/features/mission.feature',
    'tests/unit/augury.test.ts',
    'tests/unit/identity.test.ts',
    'tests/unit/materializer.test.ts',
    'tests/unit/translation.test.ts',
    'tests/unit/validator.test.ts',
    'tests/unit/catalog.test.ts',
] as const;

const originalRoot = registry.getRoot();
const roots: string[] = [];

afterEach(() => {
    closeDb();
    registry.setRoot(originalRoot);
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
    cleanupOperatorAuthorizationFixtures();
});

function makeRoot(label: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `cstar-natural-augury-${label}-`));
    roots.push(root);
    for (const target of TARGETS) {
        const absolute = path.join(root, target);
        fs.mkdirSync(path.dirname(absolute), { recursive: true });
        fs.writeFileSync(absolute, 'synthetic fixture\n');
    }
    registry.setRoot(root);
    return root;
}

function boundary(
    root: string,
    decision = DECISION,
    parent = PARENT,
    scope: AuguryMissionBoundaryInputV2['scope'] = {
        schema: 'cstar.mission_scope.v1', domain: 'brain', subject: 'CStar',
    },
    repositoryId = buildAutomaticMissionDispatchRepositoryId(root),
): AuguryMissionBoundaryInputV2 {
    return {
        schema: 'cstar.augury_mission_boundary.v2',
        version: 2,
        repository: {
            schema: 'cstar.repository_root_identity.v1',
            repository_id: repositoryId,
            root_path: root,
        },
        mission_decision_id: decision,
        proposed_parent_bead_id: parent,
        design: { revision: 1, sha256: DESIGN },
        scope,
        contained_target_paths: [...TARGETS],
        bead_plan: [{
            bead_id: `${parent}:corvus-eye`,
            dependencies: [parent],
            lane: 'corvus_eye',
            target_paths: [...TARGETS],
            acceptance_obligations: ['The independent validator receives the complete target set.'],
            checker_obligations: ['node --test tests/unit/translation.test.ts'],
            forge_child_request_template: null,
            forge_child_request_template_sha256: null,
            forge_child_request_template_bytes: null,
        }],
    };
}

function registerSpoke(hubRoot: string, spokeRoot: string, slug: string, status: string): void {
    const db = database.getWritableDb(hubRoot);
    db.prepare(`
        INSERT INTO hall_mounted_spokes (
            spoke_id, repo_id, slug, kind, root_path, mount_status, trust_level,
            write_policy, projection_status, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, 'local', ?, ?, 'trusted', 'read_write', 'current', '{}', ?, ?)
    `).run(`spoke:test:${slug}`, buildHallRepositoryId(normalizeHallPath(hubRoot)), slug,
        spokeRoot, status, Date.now(), Date.now());
}

function rowCount(root: string, table: string): number {
    const db = database.getWritableDb(root);
    const exists = db.prepare(`SELECT COUNT(*) FROM sqlite_master
        WHERE type = 'table' AND name = ?`).pluck().get(table);
    return Number(exists) === 0 ? 0
        : Number(db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get());
}

function parse(result: { content: Array<{ text: string }> }): Record<string, any> {
    return JSON.parse(result.content[0]!.text) as Record<string, any>;
}

function insertParent(
    root: string,
    session: Awaited<ReturnType<typeof verifyCodexRequestIdentity>>,
    decision = DECISION,
    parent = PARENT,
): void {
    const db = database.getWritableDb(root);
    const repoId = buildHallRepositoryId(normalizeHallPath(root));
    const now = Date.now();
    db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, target_kind, target_ref, target_path, rationale,
            status, source_kind, metadata_json, created_at, updated_at
        ) VALUES (?, ?, 'WORKFLOW', ?, ?, 'Synthetic v2 natural translation parent',
                  'IN_PROGRESS', 'set_manifest', ?, ?, ?)
    `).run(
        parent,
        repoId,
        decision,
        TARGETS[0],
        JSON.stringify({
            schema: 'cstar.set_manifest.v1',
            operator_set: true,
            decision_id: decision,
            design_revision: 1,
            design_sha256: DESIGN,
            batch_order: [`${parent}:corvus-eye`],
            mutation_request_identity: {
                source: 'codex_request_meta',
                thread_id: session.thread_id,
                turn_id: session.turn_id,
                turn_record_set_sha256: session.turn_record_set_sha256,
            },
        }),
        now,
        now,
    );
}

describe('Augury v2 natural SET translation integration', () => {
    it('materializes the exact Do it mission and consumes its identity once', async () => {
        const root = makeRoot('positive');
        const session = createSession({ textParts: ['Do it'] });
        const context = validRequestContext(session.threadId, session.turnId);
        const identity = await verifyCodexRequestIdentity(context);
        insertParent(root, identity);

        const result = await handleAugury({
            prompt: 'Build the exact CStar mission.',
            target_paths: [...TARGETS],
            scope: 'brain:CStar',
            mission_boundary: boundary(root),
        }, context);
        const payload = parse(result);

        assert.equal(result.isError, undefined);
        assert.equal(payload.mission_boundary_receipt.schema,
            'cstar.augury_mission_receipt.v2');
        assert.equal(payload.mission_boundary_receipt.mission_decision_id, DECISION);
        assert.equal(payload.mission_boundary_receipt.proposed_parent_bead_id, PARENT);
        assert.equal(payload.mission_boundary_receipt.design.sha256, DESIGN);
        assert.equal(payload.mission_boundary_receipt.repository.root_path, root);
        assert.equal(payload.mission_boundary_receipt.set_identity.set_record_sha256,
            identity.turn_record_sha256);
        assert.equal(payload.mission_boundary_receipt.contained_target_paths.length, 22);
        assert.deepEqual(payload.materialization, { replayed: false });
        assert.equal(payload.dispatch_intent_receipt.state, 'queued');
        assert.equal(payload.dispatch_intent_receipt.repository_id,
            buildAutomaticMissionDispatchRepositoryId(root));
        assert.equal(payload.dispatch_intent_receipt.worker_launch_performed, false);

        const db = database.getWritableDb(root);
        assert.equal(Number(db.prepare(
            'SELECT COUNT(*) FROM hall_augury_mission_receipts WHERE parent_bead_id = ?',
        ).pluck().get(PARENT)), 1);
        assert.equal(Number(db.prepare(`
            SELECT COUNT(*) FROM hall_automatic_mission_dispatch_intents
            WHERE decision_id = ?
        `).pluck().get(DECISION)), 1);

        const replay = parse(await handleAugury({
            prompt: 'Build the exact CStar mission.',
            target_paths: [...TARGETS],
            scope: 'brain:CStar',
            mission_boundary: boundary(root),
        }, context));
        assert.equal(replay.error_code, 'augury_mission_set_signal_consumed');
        assert.equal(Number(db.prepare(`
            SELECT COUNT(*) FROM hall_automatic_mission_dispatch_intents
            WHERE decision_id = ?
        `).pluck().get(DECISION)), 1);
    });

    it('materializes an exact SET mission for one active registered spoke', async () => {
        const hub = makeRoot('active-spoke-hub');
        const spoke = makeRoot('active-spoke-root');
        registry.setRoot(hub);
        const slug = 'active-test-spoke';
        registerSpoke(hub, spoke, slug, 'active');
        const decision = `${DECISION}-active-spoke`;
        const parent = `${PARENT}-active-spoke`;
        const session = createSession({ textParts: ['SET'] });
        const context = validRequestContext(session.threadId, session.turnId);
        const identity = await verifyCodexRequestIdentity(context);
        insertParent(hub, identity, decision, parent);

        const result = await handleAugury({
            prompt: 'Materialize the exact registered spoke mission.',
            target_paths: [...TARGETS],
            scope: `spoke:${slug}`,
            mission_boundary: boundary(spoke, decision, parent, {
                schema: 'cstar.mission_scope.v1', domain: 'spoke', subject: slug,
            }),
        }, context);
        const payload = parse(result);
        assert.equal(result.isError, undefined, JSON.stringify(payload));
        assert.equal(payload.mission_boundary_receipt.repository.root_path, spoke);
        assert.equal(payload.dispatch_intent_receipt.root_path, spoke);
        assert.equal(payload.dispatch_intent_receipt.worker_launch_performed, false);
        assert.equal(rowCount(hub, 'hall_augury_mission_receipts'), 1);
        assert.equal(rowCount(hub, 'hall_automatic_mission_dispatch_intents'), 1);
    });

    it('rejects inactive, unknown, and mismatched spokes before persistence', async () => {
        for (const [label, registration, repository, expectedError] of [
            ['inactive', 'pending', 'exact', 'augury_mission_repository_inactive'],
            ['unknown', null, 'exact', 'augury_mission_repository_unknown'],
            ['mismatched', 'active', 'hub', 'augury_mission_repository_id_root_mismatch'],
        ] as const) {
            closeDb();
            const hub = makeRoot(`${label}-hub`);
            const spoke = makeRoot(`${label}-spoke`);
            registry.setRoot(hub);
            const slug = `${label}-test-spoke`;
            if (registration) registerSpoke(hub, spoke, slug, registration);
            const decision = `${DECISION}-${label}-spoke`;
            const parent = `${PARENT}-${label}-spoke`;
            const session = createSession({ textParts: ['SET'] });
            const context = validRequestContext(session.threadId, session.turnId);
            const identity = await verifyCodexRequestIdentity(context);
            insertParent(hub, identity, decision, parent);
            const response = await handleAugury({
                prompt: 'Reject an unauthorized spoke root.',
                target_paths: [...TARGETS],
                scope: `spoke:${slug}`,
                mission_boundary: boundary(spoke, decision, parent, {
                    schema: 'cstar.mission_scope.v1', domain: 'spoke', subject: slug,
                }, repository === 'hub'
                    ? buildAutomaticMissionDispatchRepositoryId(hub)
                    : buildAutomaticMissionDispatchRepositoryId(spoke)),
            }, context);
            const payload = parse(response);
            assert.equal(response.isError, true);
            assert.equal(payload.error_code, expectedError);
            assert.equal(rowCount(hub, 'hall_augury_mission_receipts'), 0);
            assert.equal(rowCount(hub, 'hall_automatic_mission_dispatch_intents'), 0);
        }
    });

    it('fails closed when the complete current turn has duplicate or revoked operative records', async () => {
        for (const [label, second, expectedError] of [
            ['duplicate', 'Do it.', 'augury_mission_set_signal_ambiguous'],
            ['revocation', 'Stop.', 'augury_mission_set_signal_revoked'],
            ['scoped-revocation', 'Stop this mission.', 'augury_mission_set_signal_revoked'],
            ['first-person-denial', 'I am not authorizing this.',
                'augury_mission_set_signal_revoked'],
        ] as const) {
            const root = makeRoot(label);
            const session = createSession({ textParts: ['Do it'] });
            appendUserMessage(
                session.sessionFile,
                session.turnId,
                second,
                new Date(Date.parse(session.timestamp) + 1_000).toISOString(),
            );
            const context = validRequestContext(session.threadId, session.turnId);
            const identity = await verifyCodexRequestIdentity(context);
            const decision = `${DECISION}-${label}`;
            const parent = `${PARENT}-${label}`;
            insertParent(root, identity, decision, parent);
            const response = await handleAugury({
                prompt: 'Build the exact CStar mission.',
                target_paths: [...TARGETS],
                scope: 'brain:CStar',
                mission_boundary: boundary(root, decision, parent),
            }, context);
            const payload = parse(response);
            assert.equal(response.isError, true);
            assert.equal(payload.error_code, expectedError);
        }
    });

    it('keeps the v1 boundary on the exact singleton SET path', async () => {
        const root = makeRoot('legacy');
        const session = createSession({ textParts: ['SET'] });
        const v2 = boundary(root);
        const { version: _version, ...v1Base } = v2;
        const prepared = await prepareAuguryMissionBoundary({
            boundary: {
                ...v1Base,
                schema: 'cstar.augury_mission_boundary.v1',
                bead_plan: v2.bead_plan.map(({ forge_child_request_template,
                    forge_child_request_template_sha256, forge_child_request_template_bytes,
                    ...item }) => item),
            },
            expected_root: root,
            request_context: validRequestContext(session.threadId, session.turnId),
        });
        assert.deepEqual(prepared.target_paths, [...TARGETS].sort());
        assert.equal(prepared.scope_id, 'brain:CStar');
    });
});
