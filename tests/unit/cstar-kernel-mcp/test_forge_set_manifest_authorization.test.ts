import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
    getForgeAuthorizationByRequest,
    getForgeRequest,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { handleForgeAuthorize } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import { handleForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import {
    revalidateForgeSetManifestAuthority,
    verifyCurrentForgeSetManifestAuthority,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_set_manifest_authority.js';
import { verifyCodexRequestIdentity } from
    '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import {
    appendUserMessage,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';
import {
    beginNaturalAuthorizationTest,
    cleanupNaturalAuthorizationTest,
    insertBead,
    parse,
    requestArgs,
    setupRoot,
} from './forge_natural_authorization_test_support.js';

const PARENT_BEAD = 'bead:cstar:operating-pipeline-v1-test';
const CHILD_BEAD = 'bead:cstar:pipeline-v1:01-set-core-test';
const MISSION_DECISION = 'decision:cstar-operating-pipeline-v1-test';
const CHILD_DECISION = `${MISSION_DECISION}:batch-1`;
const DESIGN_SHA256 = 'd'.repeat(64);

beforeEach(beginNaturalAuthorizationTest);
afterEach(cleanupNaturalAuthorizationTest);

type RootFixture = ReturnType<typeof setupRoot>;
type Identity = Awaited<ReturnType<typeof verifyCodexRequestIdentity>>;

function mutationIdentity(identity: Identity) {
    return {
        source: 'codex_request_meta',
        thread_id: identity.thread_id,
        turn_id: identity.turn_id,
        turn_record_set_sha256: identity.turn_record_set_sha256,
    };
}

function parentMetadata(identity: Identity, batchOrder = [CHILD_BEAD]) {
    return {
        source: 'cstar-kernel-mcp',
        schema: 'cstar.set_manifest.v1',
        decision_id: MISSION_DECISION,
        design_revision: 1,
        design_sha256: DESIGN_SHA256,
        batch_order: batchOrder,
        operator_set: true,
        mutation_request_identity: mutationIdentity(identity),
    };
}

function childMetadata(
    identity: Identity,
    parentBeadId = PARENT_BEAD,
    order = 1,
    designSha256 = DESIGN_SHA256,
) {
    return {
        source: 'cstar-kernel-mcp',
        parent_bead_id: parentBeadId,
        order,
        depends_on: [],
        design_sha256: designSha256,
        owning_lane: 'Forge',
        mutation_request_identity: mutationIdentity(identity),
    };
}

function writeMetadata(value: RootFixture, beadId: string, metadata: object): void {
    value.db.prepare('UPDATE hall_beads SET metadata_json = ? WHERE bead_id = ?')
        .run(JSON.stringify(metadata), beadId);
}

function rewriteMetadata(
    value: RootFixture,
    beadId: string,
    update: (metadata: Record<string, any>) => void,
): void {
    const raw = value.db.prepare(
        'SELECT metadata_json FROM hall_beads WHERE bead_id = ?',
    ).pluck().get(beadId) as string;
    const metadata = JSON.parse(raw) as Record<string, any>;
    update(metadata);
    writeMetadata(value, beadId, metadata);
}

function insertManifest(value: RootFixture, identity: Identity): void {
    insertBead(value, PARENT_BEAD, MISSION_DECISION);
    insertBead(value, CHILD_BEAD, CHILD_DECISION);
    writeMetadata(value, PARENT_BEAD, parentMetadata(identity));
    writeMetadata(value, CHILD_BEAD, childMetadata(identity));
}

interface PreparedFixture {
    value: RootFixture;
    session: ReturnType<typeof createSession>;
    context: ReturnType<typeof validRequestContext>;
    identity: Identity;
    pending: Record<string, any>;
}

async function prepare(
    label: string,
    text = 'SET',
    extraRecords: string[] = [],
    requestDecision = CHILD_DECISION,
): Promise<PreparedFixture> {
    const value = setupRoot(label);
    const session = createSession({
        textParts: [text],
        timestamp: new Date(Date.now() - 10_000).toISOString(),
    });
    extraRecords.forEach((record, index) => appendUserMessage(
        session.sessionFile,
        session.turnId,
        record,
        new Date(Date.parse(session.timestamp) + (index + 1) * 1_000).toISOString(),
    ));
    const context = validRequestContext(session.threadId, session.turnId);
    const identity = await verifyCodexRequestIdentity(context);
    insertManifest(value, identity);
    const pending = parse(await handleForgeRequest(
        requestArgs(value, CHILD_BEAD, requestDecision, session.threadId), context,
    ));
    assert.equal(pending.status, 'pending_authorization_recorded', JSON.stringify(pending));
    return { value, session, context, identity, pending };
}

async function authorize(fixture: PreparedFixture): Promise<Record<string, any>> {
    return parse(await handleForgeAuthorize({
        forge_request_receipt_id: fixture.pending.receipt_id,
        request_sha256: fixture.pending.request_sha256,
    }, fixture.context));
}

async function assertRejected(fixture: PreparedFixture): Promise<void> {
    const result = await authorize(fixture);
    assert.equal(result.error_code, 'forge_operator_authorization_required', JSON.stringify(result));
    assert.equal(getForgeAuthorizationByRequest(
        fixture.value.db, fixture.pending.receipt_id,
    ), null);
}

async function addSecondBatchRequest(fixture: PreparedFixture): Promise<Record<string, any>> {
    const child = 'bead:cstar:pipeline-v1:02-second-test';
    const decision = `${MISSION_DECISION}:batch-2`;
    insertBead(fixture.value, child, decision);
    writeMetadata(fixture.value, child, childMetadata(fixture.identity, PARENT_BEAD, 2));
    rewriteMetadata(fixture.value, PARENT_BEAD, (metadata) => {
        metadata.batch_order = [CHILD_BEAD, child];
    });
    return parse(await handleForgeRequest(
        requestArgs(fixture.value, child, decision, fixture.session.threadId),
        fixture.context,
    ));
}

async function verifiedAuthority(fixture: PreparedFixture) {
    const request = getForgeRequest(fixture.value.db, fixture.pending.receipt_id)!;
    const authority = await verifyCurrentForgeSetManifestAuthority({
        db: fixture.value.db,
        request,
        identity: fixture.identity,
    });
    assert.ok(authority);
    return { request, authority };
}

function revalidate(fixture: PreparedFixture, verified: Awaited<
    ReturnType<typeof verifiedAuthority>
>): void {
    revalidateForgeSetManifestAuthority({
        db: fixture.value.db,
        request: verified.request,
        identity: fixture.identity,
        authorityManifestSha256: verified.authority.authority_manifest_sha256,
    });
}

describe('operator SET manifest Forge authorization', () => {
    for (const [label, text] of [
        ['exact', 'SET'],
        ['case', 'set'],
        ['whitespace', '\n\t SeT \r\n'],
        ['terminal-period', ' SET . \n'],
    ] as const) {
        it(`accepts ${label} normalization and mints the existing narrow input`, async () => {
            const fixture = await prepare(`accepted-${label}`, text);
            const result = await authorize(fixture);
            assert.equal(result.status, 'authorized', JSON.stringify(result));
            assert.equal(result.authorization_profile, 'root_user_forge_intent_v1');
            assert.match(result.operator_authorization_ref, /^cstar-forge-set-manifest:[a-f0-9]{64}$/);
            const stored = getForgeAuthorizationByRequest(
                fixture.value.db, fixture.pending.receipt_id,
            )!;
            assert.equal(stored.operator_record_count, 1);
            assert.deepEqual(JSON.parse(stored.operator_intent_json!), {
                schema: 'cstar.forge_operator_intent_projection.v1',
                action: 'implement',
                requester_lineage_mode: 'same_turn_request',
                subject: { kind: 'bead', value: CHILD_BEAD, repo_id: buildHallRepositoryId(
                    normalizeHallPath(fixture.value.root),
                ) },
            });
        });
    }

    for (const [label, text] of [
        ['prefix', 'Please SET'],
        ['suffix', 'SET now'],
        ['identifier-suffix-dot', 'SET.extra'],
        ['identifier-suffix-slash', 'SET/extra'],
        ['quoted', '"SET"'],
        ['question', 'SET?'],
        ['conditional', 'SET if validation passes'],
        ['modal', 'Maybe SET'],
        ['negation', 'Do not SET'],
        ['revocation', 'Revoke SET'],
        ['double-period', 'SET..'],
        ['unicode-space', 'SET\u00a0'],
        ['bidi', 'SET\u202e'],
    ] as const) {
        it(`rejects ${label} without authorization`, async () => {
            await assertRejected(await prepare(`rejected-${label}`, text));
        });
    }

    it('rejects duplicate SET records in one root-user turn', async () => {
        await assertRejected(await prepare('duplicate-set', 'SET', ['SET']));
    });

    it('rejects SET combined with informational or revocation records', async () => {
        await assertRejected(await prepare(
            'set-plus-revocation', 'Status is informational.', ['SET', 'Do not proceed.'],
        ));
    });

    it('rejects revocation before an exact SET record', async () => {
        await assertRejected(await prepare('revocation-before-set', 'Stop.', ['SET']));
    });

    it('rejects a different requester thread and turn', async () => {
        const fixture = await prepare('different-requester');
        const other = createSession({ textParts: ['SET'] });
        fixture.context = validRequestContext(other.threadId, other.turnId);
        await assertRejected(fixture);
    });

    for (const [label, corrupt] of [
        ['legacy SET row', (fixture: PreparedFixture) => {
            fixture.value.db.prepare("UPDATE hall_beads SET status = 'SET' WHERE bead_id = ?")
                .run(PARENT_BEAD);
        }],
        ['non-manifest schema', (fixture: PreparedFixture) => rewriteMetadata(
            fixture.value, PARENT_BEAD, (metadata) => { metadata.schema = 'legacy.set'; },
        )],
        ['missing operator SET', (fixture: PreparedFixture) => rewriteMetadata(
            fixture.value, PARENT_BEAD, (metadata) => { metadata.operator_set = false; },
        )],
        ['decision lineage drift', (fixture: PreparedFixture) => rewriteMetadata(
            fixture.value, PARENT_BEAD, (metadata) => { metadata.decision_id += ':other'; },
        )],
        ['parent lineage drift', (fixture: PreparedFixture) => rewriteMetadata(
            fixture.value, CHILD_BEAD, (metadata) => { metadata.parent_bead_id += ':other'; },
        )],
        ['design lineage drift', (fixture: PreparedFixture) => rewriteMetadata(
            fixture.value, CHILD_BEAD, (metadata) => { metadata.design_sha256 = 'e'.repeat(64); },
        )],
        ['batch order drift', (fixture: PreparedFixture) => rewriteMetadata(
            fixture.value, PARENT_BEAD, (metadata) => { metadata.batch_order = [PARENT_BEAD]; },
        )],
        ['request spend drift', (fixture: PreparedFixture) => {
            fixture.value.db.prepare(
                'UPDATE hall_forge_requests SET live_source_allowed = 1 WHERE request_id = ?',
            ).run(fixture.pending.receipt_id);
        }],
        ['request scope drift', (fixture: PreparedFixture) => {
            const request = getForgeRequest(fixture.value.db, fixture.pending.receipt_id)!;
            const summary = JSON.parse(request.request_summary_json);
            summary.scope = `${summary.scope} expanded`;
            fixture.value.db.prepare(
                'UPDATE hall_forge_requests SET request_summary_json = ? WHERE request_id = ?',
            ).run(JSON.stringify(summary), fixture.pending.receipt_id);
        }],
    ] as Array<[string, (fixture: PreparedFixture) => void]>) {
        it(`rejects ${label}`, async () => {
            const fixture = await prepare(`lineage-${label.replaceAll(' ', '-')}`);
            corrupt(fixture);
            await assertRejected(fixture);
        });
    }

    it('rejects a request decision that does not match the child manifest', async () => {
        await assertRejected(await prepare(
            'request-decision-drift', 'SET', [], `${CHILD_DECISION}:other`,
        ));
    });

    it('rejects two pending requests reusing the SET requester turn', async () => {
        const fixture = await prepare('candidate-ambiguity');
        const second = await addSecondBatchRequest(fixture);
        assert.equal(second.status, 'pending_authorization_recorded', JSON.stringify(second));
        await assertRejected(fixture);
    });

    it('does not widen SET into replay authority', async () => {
        const fixture = await prepare('no-replay');
        const first = await authorize(fixture);
        assert.equal(first.status, 'authorized', JSON.stringify(first));
        const replay = await authorize(fixture);
        assert.equal(replay.error_code, 'forge_operator_authorization_required');
        assert.equal(replay.authorization_replayed, undefined);
        assert.equal(fixture.value.db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_authorizations',
        ).get().count, 1);
    });

    it('does not reuse SET for a later request', async () => {
        const fixture = await prepare('later-request');
        assert.equal((await authorize(fixture)).status, 'authorized');
        const later = await addSecondBatchRequest(fixture);
        fixture.pending = later;
        await assertRejected(fixture);
    });

    it('accepts transaction-time revalidation when the root session is unchanged', async () => {
        const fixture = await prepare('unchanged-revalidation');
        const verified = await verifiedAuthority(fixture);
        assert.doesNotThrow(() => revalidate(fixture, verified));
    });

    it('rejects a duplicate SET appended after initial authority verification', async () => {
        const fixture = await prepare('duplicate-after-verification');
        const verified = await verifiedAuthority(fixture);
        appendUserMessage(
            fixture.session.sessionFile,
            fixture.session.turnId,
            'SET',
            new Date(Date.parse(fixture.session.timestamp) + 1_000).toISOString(),
        );
        assert.throws(
            () => revalidate(fixture, verified),
            /forge_set_manifest_request_identity_drift|forge_set_manifest_operator_signal_ambiguous/,
        );
    });

    for (const [label, revocation] of [
        ['explicit', 'Do not proceed.'],
        ['terse', 'Stop.'],
    ] as const) {
        it(`rejects ${label} revocation appended after authority verification`, async () => {
            const fixture = await prepare(`revocation-after-verification-${label}`);
            const verified = await verifiedAuthority(fixture);
            appendUserMessage(
                fixture.session.sessionFile,
                fixture.session.turnId,
                revocation,
                new Date(Date.parse(fixture.session.timestamp) + 1_000).toISOString(),
            );
            assert.throws(
                () => revalidate(fixture, verified),
                /forge_set_manifest_request_identity_drift|forge_set_manifest_operator_signal_ambiguous/,
            );
        });
    }

    it('revalidates the manifest candidate set before mutation', async () => {
        const fixture = await prepare('candidate-drift');
        const verified = await verifiedAuthority(fixture);
        const otherParent = `${PARENT_BEAD}:other`;
        insertBead(fixture.value, otherParent, `${MISSION_DECISION}:other`);
        writeMetadata(fixture.value, otherParent, {
            ...parentMetadata(fixture.identity),
            decision_id: `${MISSION_DECISION}:other`,
        });
        assert.throws(
            () => revalidate(fixture, verified),
            /forge_set_manifest_candidate_ambiguous/,
        );
    });
});
