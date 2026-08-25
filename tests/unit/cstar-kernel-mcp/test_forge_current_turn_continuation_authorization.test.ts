import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
    getForgeAuthorizationByRequest,
    getForgeRequest,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { handleForgeAuthorize } from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import { handleForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import {
    verifyCurrentForgeOperatorIntent,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_operator_intent_attestation.js';
import {
    classifyCurrentTurnContinuation,
    classifyReservedCurrentTurnRecord,
    classifyReservedSubagentNotification,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_current_turn_continuation.js';
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

beforeEach(beginNaturalAuthorizationTest);
afterEach(cleanupNaturalAuthorizationTest);

const EXACT_OPERATOR_TEXT = [
    'honestly. I am very tired of this. i am tired of the cstar mcp not working properly.',
    'i am tired of it all. if things do not start working. if cstar is so broken we cannot fix it I may start it all from scratch.',
    'so. the option I give you. this is one last chance to get it right. I don\'t want to answer any questions.',
    'I have already answered so many for CStar and corvus. my answers exist in the hall, they exist in the code base, they exist in everything under Corvus.',
    'the spoke architecture, augury, council, augury token path, taliesin, everything I have built. the answers are in there.',
    'the answers exist with OS in that I want the new framework. they exist. I answer nothing more.',
    'You do. You get one go at it. one full major run.',
    'if it doesnt work I need a go no go from you on building cstar and the corvus framework from the ground up again.',
].join(' ');
const AGENT_A = '019f1111-2222-7333-8444-555555555555';
const AGENT_B = '019f6666-7777-7888-8999-aaaaaaaaaaaa';
const EXACT_ENVIRONMENT_CONTEXT = [
    '<environment_context>',
    '  <current_date>2026-08-08</current_date>',
    '  <timezone>America/Toronto</timezone>',
    '  <filesystem><workspace_roots><root>/home/morderith/Corvus</root><root>/home/morderith/.codex/visualizations/2026/07/17/019f71dc-af61-7a73-a72d-1ec3a638a011</root></workspace_roots><permission_profile type="disabled"><file_system type="unrestricted" /></permission_profile></filesystem>',
    '  <subagents>',
    '    - 019fdf2f-c5d8-7002-9fe0-856cc364d50f: Linnaeus',
    '    - 019fdf3e-2bf0-7093-a49c-7dea530346cd: Dirac',
    '  </subagents>',
    '</environment_context>',
].join('\n');

function binding(beadId: string, decisionId: string) {
    return {
        request_id: `dispatch-forge-${'1'.repeat(32)}`,
        request_sha256: '2'.repeat(64),
        bead_id: beadId,
        decision_id: decisionId,
    };
}

function notification(
    agentPath: string,
    status: Record<string, string>,
    extra: Record<string, unknown> = {},
): string {
    return `<subagent_notification>\n${JSON.stringify({
        agent_path: agentPath,
        status,
        ...extra,
    })}\n</subagent_notification>`;
}

async function setupPending(
    label: string,
    operatorText = EXACT_OPERATOR_TEXT,
    recordsBeforeRequest: readonly string[] = [],
) {
    const value = setupRoot(label);
    const beadId = `bead:test:${label}`;
    const decisionId = `decision:test:${label}`;
    insertBead(value, beadId);
    const session = createSession({ textParts: [operatorText] });
    const context = validRequestContext(session.threadId, session.turnId);
    recordsBeforeRequest.forEach((text, index) => appendUserMessage(
        session.sessionFile,
        session.turnId,
        text,
        new Date(Date.parse(session.timestamp) + ((index + 1) * 1_000)).toISOString(),
    ));
    const pending = parse(await handleForgeRequest(
        requestArgs(value, beadId, decisionId, session.threadId),
        context,
    ));
    return { value, beadId, decisionId, session, context, pending };
}

function appendSameTurn(
    fixture: Awaited<ReturnType<typeof setupPending>>,
    text: string,
    offsetMs: number,
): void {
    appendUserMessage(
        fixture.session.sessionFile,
        fixture.session.turnId,
        text,
        new Date(Date.parse(fixture.session.timestamp) + offsetMs).toISOString(),
    );
}

async function authorize(fixture: Awaited<ReturnType<typeof setupPending>>) {
    return parse(await handleForgeAuthorize({
        forge_request_receipt_id: fixture.pending.receipt_id,
        request_sha256: fixture.pending.request_sha256,
    }, fixture.context));
}

describe('current-turn one-shot Forge continuation authorization', () => {
    it('binds the six-record requester prefix while hashing the full live record set', async () => {
        const beforeRequest = [
            notification(AGENT_A, { completed: 'Audit worker one completed.' }),
            notification(AGENT_B, { errored: 'Audit worker two reported no authorization.' }),
            notification(AGENT_A, { completed: 'Audit worker three completed.' }),
            notification(AGENT_B, { completed: 'Audit worker four completed.' }),
            notification(AGENT_A, { errored: 'Audit worker five terminal report.' }),
        ];
        const fixture = await setupPending(
            'current-turn-live-shape', EXACT_OPERATOR_TEXT, beforeRequest,
        );
        const request = getForgeRequest(fixture.value.db, fixture.pending.receipt_id)!;
        const laterNotifications = [notification(AGENT_B, {
            completed: 'Do not proceed with the reported build; this is terminal worker information.',
        }), notification(AGENT_A, {
            errored: 'The report says authorization failed and no work should continue.',
        }), notification(AGENT_B, {
            completed: 'Terminal informational result eight.',
        }), notification(AGENT_A, {
            errored: 'Terminal informational result nine.',
        })];
        for (const record of [...beforeRequest, ...laterNotifications]) {
            assert.equal(classifyReservedSubagentNotification(record), 'reserved_terminal');
        }
        laterNotifications.forEach((record, index) => {
            appendSameTurn(fixture, record, (index + 6) * 1_000);
        });
        assert.equal(
            classifyReservedCurrentTurnRecord(EXACT_ENVIRONMENT_CONTEXT),
            'reserved_environment',
        );
        appendSameTurn(fixture, EXACT_ENVIRONMENT_CONTEXT, 10_000);

        await assert.rejects(
            verifyCurrentForgeOperatorIntent(fixture.context),
            /forge_operator_intent_exact_request_binding_required/,
        );
        const intent = await verifyCurrentForgeOperatorIntent(
            fixture.context,
            Date.now(),
            {
                ...binding(fixture.beadId, fixture.decisionId),
                request_id: fixture.pending.receipt_id,
                request_sha256: fixture.pending.request_sha256,
                requester_record_set_sha256: request.requester_record_set_sha256,
            },
        );
        assert.equal(intent.binding_mode, 'current_turn_continuation');
        assert.equal(intent.action, 'route_to_forge');
        assert.equal(intent.work_reference_text, fixture.beadId);
        assert.equal(intent.session_record_count, 11);
        assert.equal(intent.selected_record_set_sha256, request.requester_record_set_sha256);
        assert.notEqual(intent.session_record_set_sha256, request.requester_record_set_sha256);
        assert.match(intent.operator_authorization_ref, /^cstar-forge-intent:v2:/);
        assert.match(intent.operator_authorization_ref, new RegExp(intent.session_record_set_sha256));

        const lines = fs.readFileSync(fixture.session.sessionFile, 'utf-8').trimEnd().split('\n');
        const expectedRequesterPrefix = createHash('sha256').update(JSON.stringify({
            schema: 'cstar.codex_root_user_turn_record_set.v1',
            thread_id: fixture.session.threadId,
            turn_id: fixture.session.turnId,
            records: lines.slice(1, 7).map((line, index) => ({
                index,
                timestamp: (JSON.parse(line) as { timestamp: string }).timestamp,
                record_sha256: createHash('sha256').update(line, 'utf-8').digest('hex'),
            })),
        }), 'utf-8').digest('hex');
        assert.equal(request.requester_record_set_sha256, expectedRequesterPrefix);
        const operatorLine = lines[1]!;
        const operatorRecord = JSON.parse(operatorLine) as Record<string, any>;
        const operatorRecordSha256 = createHash('sha256')
            .update(operatorLine, 'utf-8').digest('hex');
        const expectedMessageSha256 = createHash('sha256').update(JSON.stringify({
            schema: 'cstar.forge_operator_intent_message.v2',
            thread_id: fixture.session.threadId,
            turn_id: fixture.session.turnId,
            turn_record_set_sha256: intent.session_record_set_sha256,
            selected_record_sha256: operatorRecordSha256,
            records: [{
                index: 0,
                record_sha256: operatorRecordSha256,
                content: operatorRecord.payload.content,
            }],
        }), 'utf-8').digest('hex');
        assert.equal(intent.message_sha256, expectedMessageSha256);

        const granted = await authorize(fixture);
        assert.equal(granted.status, 'authorized', JSON.stringify(granted));
        assert.equal(granted.authorization_profile, 'root_user_forge_intent_v1');
        const stored = getForgeAuthorizationByRequest(
            fixture.value.db, fixture.pending.receipt_id,
        )!;
        assert.equal(stored.operator_record_count, 11);
        assert.equal(stored.operator_record_set_sha256, intent.session_record_set_sha256);
        assert.match(stored.operator_intent_json ?? '', /explicit_request_receipt_binding/);
    });

    it('ignores unrelated SET revocation prose in an earlier canonical turn', async () => {
        const label = 'current-turn-after-historical-revocation';
        const value = setupRoot(label);
        const beadId = `bead:test:${label}`;
        const decisionId = `decision:test:${label}`;
        insertBead(value, beadId);
        const earlier = createSession({
            textParts: ['Do not proceed.'],
            timestamp: new Date(Date.now() - 10_000).toISOString(),
        });
        const currentTurnId = randomUUID();
        const currentTimestamp = new Date(
            Date.parse(earlier.timestamp) + 1_000,
        ).toISOString();
        appendUserMessage(
            earlier.sessionFile, currentTurnId, EXACT_OPERATOR_TEXT, currentTimestamp,
        );
        assert.notEqual(earlier.turnId, currentTurnId);
        const context = validRequestContext(earlier.threadId, currentTurnId);
        const pending = parse(await handleForgeRequest(
            requestArgs(value, beadId, decisionId, earlier.threadId), context,
        ));
        const fixture = {
            value, beadId, decisionId,
            session: { ...earlier, turnId: currentTurnId, timestamp: currentTimestamp },
            context,
            pending,
        };
        const granted = await authorize(fixture);
        assert.equal(granted.status, 'authorized', JSON.stringify(granted));
        assert.ok(getForgeAuthorizationByRequest(value.db, pending.receipt_id));
    });

    it('keeps the singleton-created requester record set exact', async () => {
        const fixture = await setupPending('current-turn-singleton');
        const request = getForgeRequest(fixture.value.db, fixture.pending.receipt_id)!;
        const stableBinding = {
            ...binding(fixture.beadId, fixture.decisionId),
            request_id: fixture.pending.receipt_id,
            request_sha256: fixture.pending.request_sha256,
        };
        await assert.rejects(
            verifyCurrentForgeOperatorIntent(fixture.context, Date.now(), stableBinding),
            /forge_operator_intent_current_turn_requester_record_set_invalid/,
        );
        await assert.rejects(
            verifyCurrentForgeOperatorIntent(fixture.context, Date.now(), {
                ...stableBinding,
                requester_record_set_sha256: 'A'.repeat(64),
            }),
            /forge_operator_intent_current_turn_requester_record_set_invalid/,
        );
        const intent = await verifyCurrentForgeOperatorIntent(fixture.context, Date.now(), {
            ...stableBinding,
            requester_record_set_sha256: request.requester_record_set_sha256,
        });
        assert.equal(intent.session_record_count, 1);
        assert.equal(intent.selected_record_set_sha256, request.requester_record_set_sha256);
        assert.equal(intent.session_record_set_sha256, request.requester_record_set_sha256);
        assert.equal((await authorize(fixture)).status, 'authorized');
    });

    it('rejects a requester prefix that ends before the operative grant', async () => {
        const fixture = await setupPending(
            'current-turn-prefix-before-grant',
            notification(AGENT_A, { completed: 'Earlier terminal information.' }),
        );
        appendSameTurn(fixture, EXACT_OPERATOR_TEXT, 1_000);
        const request = getForgeRequest(fixture.value.db, fixture.pending.receipt_id)!;
        await assert.rejects(
            verifyCurrentForgeOperatorIntent(fixture.context, Date.now(), {
                ...binding(fixture.beadId, fixture.decisionId),
                request_id: fixture.pending.receipt_id,
                request_sha256: fixture.pending.request_sha256,
                requester_record_set_sha256: request.requester_record_set_sha256,
            }),
            /forge_operator_intent_current_turn_operative_record_not_in_requester_prefix/,
        );
        assert.equal((await authorize(fixture)).error_code, 'forge_operator_authorization_required');
        assert.equal(getForgeAuthorizationByRequest(
            fixture.value.db, fixture.pending.receipt_id,
        ), null);
    });

    it('rejects a stored requester hash that matches no ordered prefix', async () => {
        const fixture = await setupPending('current-turn-prefix-missing');
        fixture.value.db.prepare(`
            UPDATE hall_forge_requests SET requester_record_set_sha256 = ? WHERE request_id = ?
        `).run('f'.repeat(64), fixture.pending.receipt_id);
        assert.equal(
            getForgeRequest(fixture.value.db, fixture.pending.receipt_id)!
                .requester_record_set_sha256,
            'f'.repeat(64),
        );
        const rejected = await authorize(fixture);
        assert.equal(rejected.error_code, 'forge_operator_authorization_required');
        assert.equal(getForgeAuthorizationByRequest(
            fixture.value.db, fixture.pending.receipt_id,
        ), null);
    });

    it('whitelists only the complete exact operator record', () => {
        const stableBinding = binding(
            'bead:test:current-turn-adversarial',
            'decision:test:current-turn-adversarial',
        );
        assert.equal(classifyCurrentTurnContinuation(
            EXACT_OPERATOR_TEXT.toUpperCase().replaceAll(' ', ' \n '),
            stableBinding,
        ).action, 'route_to_forge');
        assert.equal(classifyCurrentTurnContinuation(
            EXACT_OPERATOR_TEXT.slice(0, -1),
            stableBinding,
        ).action, 'route_to_forge');
        for (const [label, text] of [
            ['missing fallback', EXACT_OPERATOR_TEXT.replace(
                / if it doesnt work I need a go no go.*$/,
                '',
            )],
            ['changed fallback', EXACT_OPERATOR_TEXT.replace('doesnt', 'does not')],
            ['suffix', `${EXACT_OPERATOR_TEXT} Please proceed.`],
            ['arbitrary prefix', `Operator narrative. ${EXACT_OPERATOR_TEXT}`],
            ['quote', `"${EXACT_OPERATOR_TEXT}"`],
            ['report', `The report says ${EXACT_OPERATOR_TEXT}`],
            ['example', `For example, ${EXACT_OPERATOR_TEXT}`],
            ['modal', `Maybe ${EXACT_OPERATOR_TEXT}`],
            ['conditional', `If approval arrives, ${EXACT_OPERATOR_TEXT}`],
            ['question', `${EXACT_OPERATOR_TEXT}?`],
            ['revocation before', `Do not proceed. ${EXACT_OPERATOR_TEXT}`],
            ['revocation after', `${EXACT_OPERATOR_TEXT} Do not continue.`],
        ] as const) {
            assert.throws(
                () => classifyCurrentTurnContinuation(text, stableBinding),
                /forge_operator_intent_nonoperative_text/,
                `accepted ${label}`,
            );
        }
    });

    for (const [label, extraRecord] of [
        ['malformed wrapper', `<subagent_notification>${JSON.stringify({
            agent_path: AGENT_A, status: { completed: 'done' },
        })}\n</subagent_notification>`],
        ['extra JSON key', notification(
            AGENT_A, { completed: 'done' }, { source: 'spoof' },
        )],
        ['invalid agent UUID', notification('not-a-uuid', { completed: 'done' })],
        ['invalid status', notification(AGENT_A, { running: 'still running' })],
        ['multiple terminal states', notification(
            AGENT_A, { completed: 'done', errored: 'also failed' },
        )],
        ['malformed environment wrapper', EXACT_ENVIRONMENT_CONTEXT.replace(
            '2026-08-08', '2026-02-30',
        )],
        ['ordinary informational record', 'Worker finished; this is ordinary information.'],
    ] as const) {
        it(`rejects ${label} beside the continuation`, async () => {
            const fixture = await setupPending(`current-turn-${label.replaceAll(' ', '-')}`);
            appendSameTurn(fixture, extraRecord, 1_000);
            const rejected = await authorize(fixture);
            assert.equal(rejected.error_code, 'forge_operator_authorization_required');
            assert.equal(getForgeAuthorizationByRequest(
                fixture.value.db, fixture.pending.receipt_id,
            ), null);
        });
    }

    it('rejects a mixed exact receipt and continuation', async () => {
        const fixture = await setupPending('current-turn-mixed-grants');
        appendSameTurn(
            fixture,
            `Authorize and execute only ${fixture.pending.receipt_id} with request SHA-256 ${fixture.pending.request_sha256} for ${fixture.beadId} now.`,
            1_000,
        );
        const rejected = await authorize(fixture);
        assert.equal(rejected.error_code, 'forge_operator_authorization_required');
        assert.equal(getForgeAuthorizationByRequest(
            fixture.value.db, fixture.pending.receipt_id,
        ), null);
    });

    it('rejects duplicate continuation records', async () => {
        const fixture = await setupPending('current-turn-duplicate');
        appendSameTurn(fixture, EXACT_OPERATOR_TEXT, 1_000);
        const rejected = await authorize(fixture);
        assert.equal(rejected.error_code, 'forge_operator_authorization_required');
        assert.equal(getForgeAuthorizationByRequest(
            fixture.value.db, fixture.pending.receipt_id,
        ), null);
    });

    it('scans non-reserved records for revocation before and after the grant', async () => {
        const after = await setupPending('current-turn-revocation-after');
        appendSameTurn(after, 'Do not proceed.', 1_000);
        assert.equal((await authorize(after)).error_code, 'forge_operator_authorization_required');

        const before = await setupPending('current-turn-revocation-before', 'Do not continue.');
        appendSameTurn(before, EXACT_OPERATOR_TEXT, 1_000);
        assert.equal((await authorize(before)).error_code, 'forge_operator_authorization_required');
    });

    it('rejects two pending requests created from the original turn', async () => {
        const fixture = await setupPending('current-turn-ambiguous');
        const second = parse(await handleForgeRequest(
            requestArgs(
                fixture.value,
                fixture.beadId,
                'decision:test:current-turn-ambiguous-second',
                fixture.session.threadId,
            ),
            fixture.context,
        ));
        appendSameTurn(fixture, notification(AGENT_A, { completed: 'done' }), 1_000);
        appendSameTurn(fixture, notification(AGENT_B, { completed: 'done' }), 2_000);
        const rejected = await authorize(fixture);
        assert.equal(rejected.error_code, 'forge_operator_authorization_required');
        assert.equal(getForgeAuthorizationByRequest(
            fixture.value.db, fixture.pending.receipt_id,
        ), null);
        assert.equal(getForgeAuthorizationByRequest(fixture.value.db, second.receipt_id), null);
    });

    it('rejects sequential reuse for a later request from the expanded turn', async () => {
        const fixture = await setupPending('current-turn-sequential-reuse');
        appendSameTurn(fixture, notification(AGENT_A, { completed: 'done' }), 1_000);
        appendSameTurn(fixture, notification(AGENT_B, { errored: 'failed' }), 2_000);
        assert.equal((await authorize(fixture)).status, 'authorized');

        const second = parse(await handleForgeRequest(
            requestArgs(
                fixture.value,
                fixture.beadId,
                'decision:test:current-turn-sequential-reuse-second',
                fixture.session.threadId,
            ),
            fixture.context,
        ));
        const rejected = parse(await handleForgeAuthorize({
            forge_request_receipt_id: second.receipt_id,
            request_sha256: second.request_sha256,
        }, fixture.context));
        assert.equal(rejected.error_code, 'forge_operator_authorization_required');
        assert.equal(getForgeAuthorizationByRequest(fixture.value.db, second.receipt_id), null);
    });
});
