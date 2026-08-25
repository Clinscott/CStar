import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { HallMountedSpokeRecord } from '../../../src/types/hall.js';
import { database } from '../../../src/tools/pennyone/intel/database.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { readBoundedUtf8FileInside } from '../../../src/tools/cstar-kernel-mcp/contracts/runtime.js';
import { handleRecordResult } from '../../../src/tools/cstar-kernel-mcp/tools/result.js';
import {
    bindKernelStampedSpokeAnchorMetadata,
    buildKernelStampedSpokeAnchorMetadata,
    mergeCallerMetadataPreservingSpokeAnchor,
    resolveSpokeAnchor,
    resolveValidationEvidenceRoots,
} from '../../../src/tools/cstar-kernel-mcp/tools/shared.js';
import {
    cleanupOperatorAuthorizationFixtures,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';

const MOUNT_TOKEN = 'synthetic-spoke-result-mount-token';
const originalRegistryRoot = registry.getRoot();
const originalTestEnv = {
    NODE_TEST_CONTEXT: process.env.NODE_TEST_CONTEXT,
    CSTAR_FORGE_TEST_MODE: process.env.CSTAR_FORGE_TEST_MODE,
};

describe('trusted registered spoke result validation roots', () => {
    const tempRoots: string[] = [];
    let mountedSpokes: HallMountedSpokeRecord[] = [];
    let beadRow: Record<string, unknown> | undefined;
    let persistedValidationCount = 0;
    let writableRoots: string[] = [];

    const fakeDb = {
        prepare: (sql: string) => ({
            all: () => [],
            get: () => sql.includes('FROM hall_beads b') ? beadRow : undefined,
            run: () => {
                if (sql.includes('INSERT INTO hall_validation_runs')) persistedValidationCount += 1;
                return { changes: 1 };
            },
        }),
        transaction: (operation: (...args: unknown[]) => unknown) =>
            Object.assign(operation, { immediate: operation }),
        exec: () => undefined,
        pragma: () => undefined,
    };

    function makeRoot(prefix: string): string {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
        tempRoots.push(root);
        return root;
    }

    function bindIdentity(root: string, token = MOUNT_TOKEN): void {
        const identityRoot = path.join(root, '.cstar');
        fs.mkdirSync(identityRoot, { recursive: true, mode: 0o700 });
        fs.writeFileSync(
            path.join(identityRoot, 'IDENTITY.json'),
            JSON.stringify({ mount_token: token }),
            { mode: 0o600 },
        );
    }

    function makeSpoke(
        root: string,
        overrides: Partial<HallMountedSpokeRecord> = {},
    ): HallMountedSpokeRecord {
        return {
            spoke_id: 'spoke:enm',
            repo_id: 'repo:hub',
            slug: 'enm',
            kind: 'local',
            root_path: root,
            mount_status: 'active',
            trust_level: 'trusted',
            write_policy: 'read_only',
            projection_status: 'current',
            metadata: { authority: { mount_token: MOUNT_TOKEN } },
            created_at: 1,
            updated_at: 1,
            ...overrides,
        };
    }

    function resolveFixture({
        controlRoot,
        codeRoot,
        repositoryRoot,
        metadata,
    }: {
        controlRoot: string;
        codeRoot: string;
        repositoryRoot: string;
        metadata?: Record<string, unknown>;
    }) {
        return resolveValidationEvidenceRoots({
            controlRoot,
            codeRoot,
            beadRepositoryRoot: repositoryRoot,
            beadMetadataJson: JSON.stringify(metadata ?? {}),
        });
    }

    function sha256(value: string): string {
        return createHash('sha256').update(value, 'utf8').digest('hex');
    }

    function createHostEvidence(
        spokeRoot: string,
        beadId: string,
        validationId: string,
        recorderThreadId: string,
    ) {
        const evidenceRoot = path.join(spokeRoot, 'evidence', validationId);
        fs.mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
        const artifactContent = `artifact:${beadId}\n`;
        const checkContent = `PASS:${validationId}\n`;
        fs.writeFileSync(path.join(evidenceRoot, 'artifact.txt'), artifactContent, { mode: 0o600 });
        fs.writeFileSync(path.join(evidenceRoot, 'check.txt'), checkContent, { mode: 0o600 });
        const payload = {
            artifacts: [{
                path: path.relative(spokeRoot, path.join(evidenceRoot, 'artifact.txt')),
                sha256: sha256(artifactContent),
            }],
            checks: [{
                name: 'synthetic spoke result check',
                status: 'pass' as const,
                evidence_path: path.relative(spokeRoot, path.join(evidenceRoot, 'check.txt')),
                sha256: sha256(checkContent),
            }],
        };
        const manifestContent = `${JSON.stringify({
            schema: 'cstar.independent_validation_input.v1',
            bead_id: beadId,
            validation_id: validationId,
            reported_verdict: 'ACCEPTED',
            artifacts: [{ ...payload.artifacts[0], bytes: Buffer.byteLength(artifactContent) }],
            checks: payload.checks,
        })}\n`;
        const manifestPath = path.join(evidenceRoot, 'manifest.json');
        fs.writeFileSync(manifestPath, manifestContent, { mode: 0o600 });
        const manifestSha256 = sha256(manifestContent);
        const validatorThreadId = randomUUID();
        const validatorTurnId = randomUUID();
        const completedAt = Date.now() - 1_000;
        const finalText = [
            'Synthetic independent validation complete.',
            `Manifest ${manifestSha256}`,
            `Validation ${validationId}`,
        ].join('\n');
        const rows = [{
            timestamp: new Date(completedAt - 1_000).toISOString(),
            type: 'session_meta',
            payload: {
                session_id: recorderThreadId,
                id: validatorThreadId,
                parent_thread_id: recorderThreadId,
                source: { subagent: { thread_spawn: {
                    parent_thread_id: recorderThreadId,
                    depth: 1,
                    agent_path: null,
                    agent_nickname: 'Synthetic validator',
                    agent_role: null,
                } } },
                thread_source: 'subagent',
                agent_nickname: 'Synthetic validator',
                agent_role: null,
            },
        }, {
            timestamp: new Date(completedAt - 500).toISOString(),
            type: 'response_item',
            payload: {
                type: 'message', role: 'assistant', phase: 'final_answer',
                content: [{ type: 'output_text', text: finalText }],
                internal_chat_message_metadata_passthrough: { turn_id: validatorTurnId },
            },
        }, {
            timestamp: new Date(completedAt).toISOString(),
            type: 'event_msg',
            payload: {
                type: 'task_complete', turn_id: validatorTurnId,
                last_agent_message: finalText, completed_at: completedAt / 1_000,
            },
        }];
        const sessionsRoot = path.join(process.env.CODEX_HOME!, 'sessions', '2026', '08', '02');
        fs.mkdirSync(sessionsRoot, { recursive: true, mode: 0o700 });
        fs.writeFileSync(
            path.join(sessionsRoot, `rollout-test-${validatorThreadId}.jsonl`),
            `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`,
            { mode: 0o600 },
        );
        return {
            payload,
            receipt: {
                validator_thread_id: validatorThreadId,
                validator_turn_id: validatorTurnId,
                manifest_path: path.relative(spokeRoot, manifestPath),
                manifest_sha256: manifestSha256,
            },
        };
    }

    beforeEach(() => {
        mountedSpokes = [];
        beadRow = undefined;
        persistedValidationCount = 0;
        writableRoots = [];
        mock.method(database, 'listHallMountedSpokes', () => mountedSpokes);
        mock.method(database, 'getReadDb', () => fakeDb as never);
        mock.method(database, 'getWritableDb', (root: string) => {
            writableRoots.push(root);
            return fakeDb as never;
        });
    });

    afterEach(() => {
        mock.restoreAll();
        registry.setRoot(originalRegistryRoot);
        cleanupOperatorAuthorizationFixtures();
        for (const [name, value] of Object.entries(originalTestEnv)) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
        for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
    });

    it('preserves hub v3 CODE_ROOT and hub v2 CONTROL_ROOT', () => {
        const controlRoot = makeRoot('cstar-spoke-result-control-');
        const codeRoot = makeRoot('cstar-spoke-result-code-');
        const roots = resolveFixture({ controlRoot, codeRoot, repositoryRoot: controlRoot });
        assert.deepEqual(roots, {
            kind: 'hub',
            v2Root: controlRoot,
            v3Root: codeRoot,
        });
    });

    it('resolves shared-tray v2 and v3 evidence inside one trusted read_only spoke root', () => {
        const controlRoot = makeRoot('cstar-spoke-result-control-');
        const codeRoot = makeRoot('cstar-spoke-result-code-');
        const spokeRoot = makeRoot('cstar-spoke-result-enm-');
        bindIdentity(spokeRoot);
        const spoke = makeSpoke(spokeRoot);
        mountedSpokes = [spoke];
        const roots = resolveFixture({
            controlRoot,
            codeRoot,
            repositoryRoot: controlRoot,
            metadata: buildKernelStampedSpokeAnchorMetadata(spoke),
        });
        assert.equal(roots.kind, 'spoke');
        assert.equal(roots.v2Root, fs.realpathSync(spokeRoot));
        assert.equal(roots.v3Root, fs.realpathSync(spokeRoot));

        for (const name of ['manifest.json', 'artifact.txt', 'check.txt']) {
            const candidate = path.join(spokeRoot, name);
            fs.writeFileSync(candidate, name, 'utf8');
            assert.equal(readBoundedUtf8FileInside(roots.v3Root, candidate, 1024).content, name);
        }
        const wrongRootManifest = path.join(codeRoot, 'manifest.json');
        fs.writeFileSync(wrongRootManifest, 'wrong root', 'utf8');
        assert.throws(
            () => readBoundedUtf8FileInside(roots.v3Root, wrongRootManifest, 1024),
            /path_outside_root/,
        );
    });

    it('resolves a spoke-owned repository row by its exact registered root', () => {
        const controlRoot = makeRoot('cstar-spoke-result-control-');
        const codeRoot = makeRoot('cstar-spoke-result-code-');
        const spokeRoot = makeRoot('cstar-spoke-result-enm-');
        bindIdentity(spokeRoot);
        const spoke = makeSpoke(spokeRoot);
        mountedSpokes = [spoke];
        const roots = resolveFixture({
            controlRoot, codeRoot, repositoryRoot: spokeRoot,
            metadata: buildKernelStampedSpokeAnchorMetadata(spoke),
        });
        assert.equal(roots.kind, 'spoke');
        assert.equal(roots.v2Root, fs.realpathSync(spokeRoot));
        assert.equal(roots.v3Root, fs.realpathSync(spokeRoot));
    });

    it('records shared-tray and spoke-owned v3 results through control-root Hall only', async () => {
        const controlRoot = makeRoot('cstar-spoke-result-control-');
        const spokeRoot = makeRoot('cstar-spoke-result-enm-');
        bindIdentity(spokeRoot);
        const spoke = makeSpoke(spokeRoot);
        mountedSpokes = [spoke];
        registry.setRoot(controlRoot);
        const session = createSession({
            textParts: ['Synthetic root-user spoke result recording fixture.'],
        });
        process.env.NODE_TEST_CONTEXT = '1';
        process.env.CSTAR_FORGE_TEST_MODE = '1';
        const context = validRequestContext(session.threadId, session.turnId);

        for (const [kind, repositoryRoot, metadata] of [
            ['shared', controlRoot, buildKernelStampedSpokeAnchorMetadata(spoke)],
            ['owned', spokeRoot, buildKernelStampedSpokeAnchorMetadata(spoke)],
        ] as const) {
            const beadId = `bead:test:spoke-result:${kind}`;
            const validationId = `validation:test:spoke-result:${kind}`;
            beadRow = {
                repo_id: kind === 'shared' ? 'repo:hub' : 'repo:enm',
                target_path: 'src/target.ts',
                metadata_json: JSON.stringify(metadata),
                root_path: repositoryRoot,
            };
            const evidence = createHostEvidence(
                spokeRoot, beadId, validationId, session.threadId,
            );
            const response = await handleRecordResult({
                bead_id: beadId,
                verdict: 'ACCEPTED',
                validation_id: validationId,
                host_validation_receipt: evidence.receipt,
                validation_evidence: evidence.payload,
            }, context);
            const parsed = JSON.parse(response.content[0].text);
            assert.equal(response.isError, undefined);
            assert.equal(parsed.status, 'recorded_verified');
            assert.equal(parsed.validation_persisted, true);
            assert.equal(parsed.validation_authority, 'verified_v3');
        }
        assert.deepEqual(writableRoots, [controlRoot, controlRoot]);
        assert.equal(persistedValidationCount, 2);
    });

    it('removes caller-supplied anchor fields and preserves only kernel-stamped values', () => {
        const spokeRoot = makeRoot('cstar-spoke-result-enm-');
        const spoke = makeSpoke(spokeRoot);
        const anchor = buildKernelStampedSpokeAnchorMetadata(spoke);
        const caller = {
            note: 'preserved',
            spoke_anchor_schema: 'caller-schema',
            spoke_slug: 'evil',
            spoke_id: 'spoke:evil',
            spoke_trust_level: 'trusted',
            spoke_write_policy: 'read_write',
            spoke_root_sha256: '0'.repeat(64),
            spoke_kind: 'archive',
        };
        assert.deepEqual(bindKernelStampedSpokeAnchorMetadata(caller, anchor), {
            note: 'preserved',
            ...anchor,
        });
        assert.deepEqual(bindKernelStampedSpokeAnchorMetadata(caller, null), { note: 'preserved' });
        assert.deepEqual(mergeCallerMetadataPreservingSpokeAnchor({ old: true, ...anchor }, caller),
            { old: true, note: 'preserved', ...anchor });
    });

    it('rejects incomplete, unregistered, and ambiguous shared-tray anchors', () => {
        const controlRoot = makeRoot('cstar-spoke-result-control-');
        const codeRoot = makeRoot('cstar-spoke-result-code-');
        assert.throws(
            () => resolveFixture({
                controlRoot,
                codeRoot,
                repositoryRoot: controlRoot,
                metadata: { spoke_slug: 'enm' },
            }),
            /validation_spoke_anchor_incomplete/,
        );

        const firstRoot = makeRoot('cstar-spoke-result-enm-a-');
        bindIdentity(firstRoot);
        const first = makeSpoke(firstRoot);
        const anchor = buildKernelStampedSpokeAnchorMetadata(first);
        const { spoke_anchor_schema: _schema, ...schemaLess } = anchor;
        mountedSpokes = [first];
        for (const [repositoryRoot, metadata, expected] of [
            [firstRoot, {}, /validation_spoke_anchor_missing/],
            [controlRoot, schemaLess, /validation_spoke_anchor_incomplete/],
            [controlRoot, { ...anchor, spoke_write_policy: 'read_write' }, /validation_spoke_anchor_mismatch/],
        ] as const) {
            assert.throws(() => resolveFixture({ controlRoot, codeRoot, repositoryRoot, metadata }), expected);
        }
        mountedSpokes = [];
        assert.throws(
            () => resolveFixture({
                controlRoot,
                codeRoot,
                repositoryRoot: controlRoot,
                metadata: buildKernelStampedSpokeAnchorMetadata(first),
            }),
            /validation_spoke_not_registered/,
        );

        const secondRoot = makeRoot('cstar-spoke-result-enm-b-');
        bindIdentity(secondRoot);
        mountedSpokes = [first, makeSpoke(secondRoot)];
        assert.throws(
            () => resolveFixture({
                controlRoot,
                codeRoot,
                repositoryRoot: controlRoot,
                metadata: buildKernelStampedSpokeAnchorMetadata(first),
            }),
            /validation_spoke_anchor_ambiguous/,
        );
    });

    it('rejects inactive, quarantined, and observe-only spokes', () => {
        const controlRoot = makeRoot('cstar-spoke-result-control-');
        const codeRoot = makeRoot('cstar-spoke-result-code-');
        const spokeRoot = makeRoot('cstar-spoke-result-enm-');
        bindIdentity(spokeRoot);
        for (const [overrides, expected] of [
            [{ mount_status: 'disconnected' }, /validation_spoke_inactive/],
            [{ trust_level: 'quarantined' }, /validation_spoke_untrusted/],
            [{ trust_level: 'observe' }, /validation_spoke_untrusted/],
        ] as const) {
            const spoke = makeSpoke(spokeRoot, overrides as Partial<HallMountedSpokeRecord>);
            mountedSpokes = [spoke];
            assert.throws(
                () => resolveFixture({
                    controlRoot,
                    codeRoot,
                    repositoryRoot: controlRoot,
                    metadata: buildKernelStampedSpokeAnchorMetadata(spoke),
                }),
                expected,
            );
        }
    });

    it('rejects mount-token mismatch and symlinked spoke roots', () => {
        const controlRoot = makeRoot('cstar-spoke-result-control-');
        const codeRoot = makeRoot('cstar-spoke-result-code-');
        const spokeRoot = makeRoot('cstar-spoke-result-enm-');
        bindIdentity(spokeRoot);
        const mismatch = makeSpoke(spokeRoot, {
            metadata: { authority: { mount_token: 'wrong-token' } },
        });
        mountedSpokes = [mismatch];
        assert.throws(
            () => resolveFixture({
                controlRoot,
                codeRoot,
                repositoryRoot: controlRoot,
                metadata: buildKernelStampedSpokeAnchorMetadata(mismatch),
            }),
            /validation_spoke_mount_token_verification_failed:mismatch/,
        );

        const linkParent = makeRoot('cstar-spoke-result-link-');
        const linkedRoot = path.join(linkParent, 'enm-link');
        fs.symlinkSync(spokeRoot, linkedRoot, 'dir');
        const symlinked = makeSpoke(linkedRoot);
        mountedSpokes = [symlinked];
        assert.throws(
            () => resolveFixture({
                controlRoot,
                codeRoot,
                repositoryRoot: controlRoot,
                metadata: buildKernelStampedSpokeAnchorMetadata(symlinked),
            }),
            /validation_spoke_mount_token_verification_failed:unsafe_root/,
        );
    });

    it('rejects a persisted anchor whose repository root names another location', () => {
        const controlRoot = makeRoot('cstar-spoke-result-control-');
        const codeRoot = makeRoot('cstar-spoke-result-code-');
        const spokeRoot = makeRoot('cstar-spoke-result-enm-');
        const otherRoot = makeRoot('cstar-spoke-result-other-');
        bindIdentity(spokeRoot);
        const spoke = makeSpoke(spokeRoot);
        mountedSpokes = [spoke];
        assert.throws(
            () => resolveFixture({
                controlRoot,
                codeRoot,
                repositoryRoot: otherRoot,
                metadata: buildKernelStampedSpokeAnchorMetadata(spoke),
            }),
            /validation_spoke_root_mismatch/,
        );
    });

    it('requires trusted status for bead anchoring even when the mount token is valid', () => {
        const spokeRoot = makeRoot('cstar-spoke-result-enm-');
        bindIdentity(spokeRoot);
        const observe = makeSpoke(spokeRoot, {
            trust_level: 'observe',
            write_policy: 'read_write',
        });
        mock.method(database, 'getHallMountedSpoke', () => observe);
        assert.throws(() => resolveSpokeAnchor('enm'), /trust_level='observe'/);
    });
});
