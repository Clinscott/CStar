import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { handleForgeRequest } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import {
    readExactForgeNaturalSetTranslation,
    type AuguryMissionV2SetBinding,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_set_manifest_signal.js';
import { verifyCodexRequestIdentity } from
    '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
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
import {
    NATURAL_SET_INFORMATIONAL_CASES,
    NATURAL_SET_REVOCATION_CASES,
} from './forge_set_manifest_natural_revocation_test_cases.js';

const BINDING: AuguryMissionV2SetBinding = {
    schema: 'cstar.augury_mission_binding.v2',
    version: 2,
    scope_id: 'brain:CStar',
    mission_decision_id: 'decision:cstar:state-only-luna-host-seam-batch1-20260803',
    proposed_parent_bead_id: 'bead:cstar:state-only-luna-host-seam-batch1-20260803:parent',
    design_sha256: 'e'.repeat(64),
    target_set_sha256: 'f'.repeat(64),
};
const CONSUMED_BEAD = 'bead:cstar:natural-translation-consumed';
const CONSUMED_DECISION = 'decision:cstar:natural-translation-consumed';

beforeEach(beginNaturalAuthorizationTest);
afterEach(cleanupNaturalAuthorizationTest);

function contextFor(session: ReturnType<typeof createSession>) {
    return validRequestContext(session.threadId, session.turnId);
}

async function identityFor(session: ReturnType<typeof createSession>) {
    return verifyCodexRequestIdentity(contextFor(session));
}

function appendSameTurn(session: ReturnType<typeof createSession>, text: string, seconds: number): void {
    appendUserMessage(
        session.sessionFile,
        session.turnId,
        text,
        new Date(Date.parse(session.timestamp) + seconds * 1_000).toISOString(),
    );
}

describe('CoS natural SET translation boundary', () => {
    for (const [label, text] of [
        ['exact', 'Do it'],
        ['case', 'dO IT'],
        ['whitespace', '\n\t Do   it \r\n'],
        ['terminal-period', ' Do it . '],
    ] as const) {
        it(`accepts only the exact direct imperative (${label})`, async () => {
            const session = createSession({ textParts: [text] });
            const identity = await identityFor(session);
            const translation = readExactForgeNaturalSetTranslation(identity, BINDING);

            assert.ok(translation);
            assert.equal(translation.schema, 'cstar.forge_set_manifest_natural_translation.v1');
            assert.equal(translation.instruction, 'do_it');
            assert.equal(translation.normalized_text, 'do it');
            assert.equal(translation.authority_effect, 'deterministic_translation_only');
            assert.equal(translation.scope_id, 'brain:CStar');
            assert.equal(translation.turn_record_set_sha256, identity.turn_record_set_sha256);
            assert.equal(translation.turn_record_count, 1);
            assert.equal(translation.selected_record_sha256, identity.turn_record_sha256);
            assert.equal(translation.selected_record_index, 0);
            assert.deepEqual(translation.consumption.mode, 'one_use');
            assert.deepEqual(translation.consumption.status, 'unspent');
            assert.match(translation.consumption.key_sha256, /^[a-f0-9]{64}$/);
        });
    }

    it('binds the complete ordered turn and one selected operative record', async () => {
        const session = createSession({ textParts: ['Do it'] });
        appendSameTurn(session, 'The kernel is ready.', 1);
        const identity = await identityFor(session);
        const translation = readExactForgeNaturalSetTranslation(identity, BINDING);

        assert.ok(translation);
        assert.equal(translation.turn_record_count, 2);
        assert.equal(translation.selected_record_index, 0);
        assert.notEqual(translation.selected_record_sha256, identity.turn_record_sha256);
        assert.equal(translation.turn_record_set_sha256, identity.turn_record_set_sha256);
    });

    for (const [label, text] of [
        ['prefix', 'Please do it'],
        ['suffix', 'Do it now'],
        ['identifier-suffix-dot', 'Do it.extra'],
        ['identifier-suffix-slash', 'Do it/extra'],
        ['question', 'Could you do it?'],
        ['conditional', 'If later, do it'],
        ['quoted', 'The report says "Do it".'],
        ['modal', 'Maybe do it'],
        ['discussion', 'We should discuss whether to do it.'],
        ['recommendation', 'The report recommends we do it.'],
        ['scoped-negation', 'Do it, but without execution.'],
    ] as const) {
        it(`rejects ${label} without interpreting it`, async () => {
            const session = createSession({ textParts: [text] });
            const identity = await identityFor(session);
            assert.equal(readExactForgeNaturalSetTranslation(identity, BINDING), null);
        });
    }

    it('classifies an exact first-person denial as a revocation', async () => {
        const session = createSession({ textParts: ['I am not authorizing this.'] });
        const identity = await identityFor(session);

        assert.throws(
            () => readExactForgeNaturalSetTranslation(identity, BINDING),
            { message: 'forge_set_manifest_natural_signal_revoked' },
        );
    });

    it('rejects duplicate operative records in one complete turn', async () => {
        const session = createSession({ textParts: ['Do it'] });
        appendSameTurn(session, 'Do it.', 1);
        const identity = await identityFor(session);

        assert.throws(
            () => readExactForgeNaturalSetTranslation(identity, BINDING),
            { message: 'forge_set_manifest_natural_signal_ambiguous' },
        );
    });

    for (const [label, records] of [
        ['revocation-after', ['Do it', 'Stop.']],
        ['revocation-before', ['Stop.', 'Do it']],
        ['withdrawal-after', ['Do it', 'Withdraw this.']],
        ['never-mind-after', ['Do it', 'Never mind.']],
    ] as const) {
        it(`rejects ${label} in the complete ordered turn`, async () => {
            const session = createSession({ textParts: [records[0]] });
            appendSameTurn(session, records[1], 1);
            const identity = await identityFor(session);

            assert.throws(
                () => readExactForgeNaturalSetTranslation(identity, BINDING),
                { message: 'forge_set_manifest_natural_signal_revoked' },
            );
        });
    }

    for (const [label, revocation] of NATURAL_SET_REVOCATION_CASES) {
        for (const [order, records] of [
            ['after', ['Do it', revocation]],
            ['before', [revocation, 'Do it']],
        ] as const) {
            it(`rejects finite ${label} revocation ${order} the operative record`, async () => {
                const session = createSession({ textParts: [records[0]] });
                appendSameTurn(session, records[1], 1);
                const identity = await identityFor(session);

                assert.throws(
                    () => readExactForgeNaturalSetTranslation(identity, BINDING),
                    { message: 'forge_set_manifest_natural_signal_revoked' },
                );
            });
        }
    }

    for (const informational of NATURAL_SET_INFORMATIONAL_CASES) {
        it(`accepts unrelated informational context: ${informational}`, async () => {
            const session = createSession({ textParts: ['Do it'] });
            appendSameTurn(session, informational, 1);
            const identity = await identityFor(session);

            assert.ok(readExactForgeNaturalSetTranslation(identity, BINDING));
        });
    }

    it('rejects a non-CStar scope binding before reading authority', async () => {
        const session = createSession({ textParts: ['Do it'] });
        const identity = await identityFor(session);
        const invalid = { ...BINDING, scope_id: 'estate:Corvus' } as unknown as AuguryMissionV2SetBinding;

        assert.throws(
            () => readExactForgeNaturalSetTranslation(identity, invalid),
            { message: 'forge_set_manifest_natural_binding_invalid' },
        );
    });

    it('rejects a root record-set already consumed by a Forge request', async () => {
        const value = setupRoot('natural-translation-consumed');
        const session = createSession({ textParts: ['Do it'] });
        const identity = await identityFor(session);
        insertBead(value, CONSUMED_BEAD, CONSUMED_DECISION);
        const pending = parse(await handleForgeRequest(
            requestArgs(value, CONSUMED_BEAD, CONSUMED_DECISION, session.threadId),
            contextFor(session),
        ));
        assert.equal(pending.status, 'pending_authorization_recorded');

        assert.throws(
            () => readExactForgeNaturalSetTranslation(identity, BINDING),
            { message: 'forge_set_manifest_natural_signal_consumed' },
        );
    });

    it('rejects nested root lineage through the canonical identity boundary', async () => {
        const session = createSession({
            textParts: ['Do it'],
            sessionMeta: { parent_thread_id: '019fc8a7-f1f2-7670-9b2e-2667f4441161' },
        });

        await assert.rejects(identityFor(session), {
            message: 'codex_request_identity_session_is_not_canonical_root_user',
        });
    });

    it('changes the one-use key when the exact mission binding changes', async () => {
        const session = createSession({ textParts: ['Do it'] });
        const identity = await identityFor(session);
        const original = readExactForgeNaturalSetTranslation(identity, BINDING)!;
        const changed = readExactForgeNaturalSetTranslation(identity, {
            ...BINDING,
            target_set_sha256: 'a'.repeat(64),
        })!;

        assert.notEqual(original.consumption.key_sha256, changed.consumption.key_sha256);
        assert.equal(changed.target_set_sha256, 'a'.repeat(64));
    });
});
