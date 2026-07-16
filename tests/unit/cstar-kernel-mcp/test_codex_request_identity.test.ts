import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    createCanonicalCodexUserTurnAccumulator,
    readCanonicalCodexUserTurn,
} from '../../../src/tools/cstar-kernel-mcp/tools/codex_request_identity.js';
import { scanFixedCodexSession } from '../../../src/tools/cstar-kernel-mcp/tools/codex_session_authority_projection.js';
import { verifyOperatorAuthorization } from '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';

const THREAD_ID = '019f0000-0000-7000-8000-000000000001';
const TURN_ID = '019f0000-0000-7000-8000-000000000002';
const OTHER_TURN_ID = '019f0000-0000-7000-8000-000000000003';
const BASE_TIMESTAMP = '2026-07-13T12:00:00.000Z';
const NOW = Date.parse('2026-07-13T12:00:10.000Z');
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_RECORD_AGE_MS = 60_000;
const roots: string[] = [];

type JsonRecord = Record<string, unknown>;

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function sessionMeta(overrides: JsonRecord = {}): JsonRecord {
    return {
        timestamp: BASE_TIMESTAMP,
        type: 'session_meta',
        payload: {
            id: THREAD_ID,
            thread_source: 'user',
            parent_thread_id: null,
            agent_path: null,
            forked_from_id: null,
            ...overrides,
        },
    };
}

function userRecord(
    text: string,
    timestamp = BASE_TIMESTAMP,
    turnId = TURN_ID,
    payloadOverrides: JsonRecord = {},
): JsonRecord {
    return {
        timestamp,
        type: 'response_item',
        payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text }],
            internal_chat_message_metadata_passthrough: { turn_id: turnId },
            ...payloadOverrides,
        },
    };
}

function serialize(row: unknown): string {
    return typeof row === 'string' ? row : JSON.stringify(row);
}

function writeSession(rows: unknown[], trailingNewline = true): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-codex-identity-'));
    roots.push(root);
    const sessionFile = path.join(root, 'rollout-synthetic.jsonl');
    const body = rows.map(serialize).join('\n') + (trailingNewline ? '\n' : '');
    fs.writeFileSync(sessionFile, body, { mode: 0o600 });
    return sessionFile;
}

async function scan(
    rows: unknown[],
    options: { trailingNewline?: boolean; maxFileBytes?: number } = {},
) {
    return readCanonicalCodexUserTurn(
        writeSession(rows, options.trailingNewline ?? true),
        THREAD_ID,
        TURN_ID,
        NOW,
        options.maxFileBytes ?? MAX_FILE_BYTES,
        MAX_RECORD_AGE_MS,
    );
}

async function expectFailure(
    rows: unknown[],
    message: string,
    options: { trailingNewline?: boolean; maxFileBytes?: number } = {},
): Promise<void> {
    await assert.rejects(scan(rows, options), (error: unknown) => {
        assert.equal((error as Error).message, message);
        return true;
    });
}

function expectedRecordSetHash(
    records: Array<{ raw: string; timestamp: string }>,
): string {
    return sha256(JSON.stringify({
        schema: 'cstar.codex_root_user_turn_record_set.v1',
        thread_id: THREAD_ID,
        turn_id: TURN_ID,
        records: records.map(({ raw, timestamp }, index) => ({
            index,
            timestamp,
            record_sha256: sha256(raw),
        })),
    }));
}

afterEach(() => {
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('canonical Codex root-user turn scanner', () => {
    it('preserves the exact singleton raw-line hash and binds the indexed domain-separated set', async () => {
        const user = userRecord('authorized singleton request');
        const rawUser = serialize(user);

        const result = await scan([sessionMeta(), user]);

        assert.equal(result.recordSha256, sha256(rawUser));
        assert.equal(result.recordCount, 1);
        assert.equal(result.firstTimestamp, BASE_TIMESTAMP);
        assert.equal(result.timestamp, BASE_TIMESTAMP);
        assert.equal(result.recordSetSha256, expectedRecordSetHash([
            { raw: rawUser, timestamp: BASE_TIMESTAMP },
        ]));
    });

    it('binds physical order with explicit indices and is order-sensitive', async () => {
        const first = userRecord('first steering record');
        const second = userRecord('second steering record');
        const rawFirst = serialize(first);
        const rawSecond = serialize(second);

        const ordered = await scan([sessionMeta(), first, second]);
        const reversed = await scan([sessionMeta(), second, first]);

        assert.equal(ordered.recordSetSha256, expectedRecordSetHash([
            { raw: rawFirst, timestamp: BASE_TIMESTAMP },
            { raw: rawSecond, timestamp: BASE_TIMESTAMP },
        ]));
        assert.equal(reversed.recordSetSha256, expectedRecordSetHash([
            { raw: rawSecond, timestamp: BASE_TIMESTAMP },
            { raw: rawFirst, timestamp: BASE_TIMESTAMP },
        ]));
        assert.notEqual(ordered.recordSetSha256, reversed.recordSetSha256);
    });

    it('projects same-turn assistant, reasoning, tool, and event rows out of the user cohort', async () => {
        const first = userRecord('first', BASE_TIMESTAMP);
        const secondTimestamp = '2026-07-13T12:00:01.000Z';
        const second = userRecord('second', secondTimestamp);
        const targetMetadata = { internal_chat_message_metadata_passthrough: { turn_id: TURN_ID } };
        const assistant = {
            timestamp: BASE_TIMESTAMP,
            type: 'response_item',
            payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok' }], ...targetMetadata },
        };
        const reasoning = { timestamp: BASE_TIMESTAMP, type: 'response_item', payload: { type: 'reasoning', summary: [], ...targetMetadata } };
        const toolCall = { timestamp: BASE_TIMESTAMP, type: 'response_item', payload: { type: 'custom_tool_call', name: 'probe', call_id: 'call-1', input: '{}', ...targetMetadata } };
        const toolOutput = { timestamp: BASE_TIMESTAMP, type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: 'call-1', output: 'ok', ...targetMetadata } };
        const event = { timestamp: BASE_TIMESTAMP, type: 'event_msg', payload: { type: 'user_message', message: 'host duplicate without turn metadata' } };

        const baseline = await scan([sessionMeta(), first, second]);
        const result = await scan([sessionMeta(), first, assistant, reasoning, toolCall, toolOutput, event, second]);
        (reasoning.payload as JsonRecord).summary = [{ type: 'summary_text', text: 'mutated non-user evidence' }];
        const mutated = await scan([sessionMeta(), first, assistant, reasoning, toolCall, toolOutput, event, second]);

        assert.equal(result.recordCount, 2);
        assert.equal(result.firstTimestamp, BASE_TIMESTAMP);
        assert.equal(result.timestamp, secondTimestamp);
        assert.equal(result.recordSetSha256, expectedRecordSetHash([
            { raw: serialize(first), timestamp: BASE_TIMESTAMP },
            { raw: serialize(second), timestamp: secondTimestamp },
        ]));
        assert.equal(result.recordSetSha256, baseline.recordSetSha256);
        assert.equal(mutated.recordSetSha256, baseline.recordSetSha256);
    });

    it('binds identity above the legacy 64 MiB cap without retaining non-user rows', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-codex-large-identity-'));
        roots.push(root);
        const sessionFile = path.join(root, 'rollout-large.jsonl');
        const expectedDigest = createHash('sha256');
        const append = (row: unknown): void => {
            const line = `${JSON.stringify(row)}\n`;
            fs.appendFileSync(sessionFile, line, { mode: 0o600 });
            expectedDigest.update(line, 'utf-8');
        };
        append(sessionMeta());
        const megabyte = 'x'.repeat(1024 * 1024);
        for (let index = 0; index < 65; index += 1) {
            append({ timestamp: BASE_TIMESTAMP, type: 'response_item', payload: {
                type: 'custom_tool_call_output', call_id: `large-${index}`, output: megabyte,
            } });
        }
        append(userRecord('request'));
        const fileBytes = fs.statSync(sessionFile).size;
        const accumulator = createCanonicalCodexUserTurnAccumulator(
            THREAD_ID, TURN_ID, NOW, MAX_RECORD_AGE_MS,
        );

        const scanResult = scanFixedCodexSession(sessionFile, fileBytes, accumulator.consume);
        const result = accumulator.finish();

        assert.ok(fileBytes > 64 * 1024 * 1024);
        assert.equal(scanResult.recordCount, 67);
        assert.equal(scanResult.sha256, expectedDigest.digest('hex'));
        assert.equal(result.recordCount, 1);
    });

    it('rejects an exact replay of a selected-turn record', async () => {
        const user = userRecord('same bytes');
        await expectFailure(
            [sessionMeta(), user, user],
            'codex_request_identity_duplicate_turn_record',
        );
    });

    it('rejects missing, invalid, stale, future, and nonmonotonic timestamps', async () => {
        const missing = userRecord('missing timestamp');
        delete missing.timestamp;
        await expectFailure(
            [sessionMeta(), missing],
            'codex_request_identity_turn_is_incomplete',
        );
        await expectFailure(
            [sessionMeta(), userRecord('invalid timestamp', 'not-a-date')],
            'codex_request_identity_turn_expired_or_future_dated',
        );
        await expectFailure(
            [sessionMeta(), userRecord('stale', '2026-07-13T11:58:00.000Z')],
            'codex_request_identity_turn_expired_or_future_dated',
        );
        await expectFailure(
            [sessionMeta(), userRecord('future', '2026-07-13T12:01:11.000Z')],
            'codex_request_identity_turn_expired_or_future_dated',
        );
        await expectFailure(
            [
                sessionMeta(),
                userRecord('later first', '2026-07-13T12:00:01.000Z'),
                userRecord('earlier second', BASE_TIMESTAMP),
            ],
            'codex_request_identity_turn_timestamps_nonmonotonic',
        );
    });

    it('rejects A/B/A root-user turn reuse as noncontiguous', async () => {
        await expectFailure(
            [
                sessionMeta(),
                userRecord('A1', BASE_TIMESTAMP),
                userRecord('B', '2026-07-13T12:00:01.000Z', OTHER_TURN_ID),
                userRecord('A2', '2026-07-13T12:00:02.000Z'),
            ],
            'codex_request_identity_turn_records_noncontiguous',
        );
    });

    it('rejects A as latest when a tagged noncanonical user-like turn B follows it', async () => {
        const taggedNoncanonicalB = {
            timestamp: '2026-07-13T12:00:01.000Z',
            type: 'event_msg',
            payload: {
                type: 'user_message',
                message: 'later host-projected user turn',
                internal_chat_message_metadata_passthrough: { turn_id: OTHER_TURN_ID },
            },
        };

        await expectFailure(
            [sessionMeta(), userRecord('canonical A'), taggedNoncanonicalB],
            'codex_request_identity_turn_not_latest',
        );
    });

    it('can bind a complete historical turn without permitting A/B/A reuse', async () => {
        const historical = writeSession([
            sessionMeta(),
            userRecord('authorization A'),
            userRecord('later request B', '2026-07-13T12:00:01.000Z', OTHER_TURN_ID),
        ]);
        const result = await readCanonicalCodexUserTurn(
            historical, THREAD_ID, TURN_ID, NOW, MAX_FILE_BYTES, MAX_RECORD_AGE_MS, true,
        );
        assert.equal(result.recordCount, 1);
        await assert.rejects(
            readCanonicalCodexUserTurn(
                writeSession([
                    sessionMeta(), userRecord('A1'),
                    userRecord('B', '2026-07-13T12:00:01.000Z', OTHER_TURN_ID),
                    userRecord('A2', '2026-07-13T12:00:02.000Z'),
                ]),
                THREAD_ID, TURN_ID, NOW, MAX_FILE_BYTES, MAX_RECORD_AGE_MS, true,
            ),
            /codex_request_identity_turn_records_noncontiguous/,
        );
    });

    it('rejects selected tagged records that explicitly claim user authority noncanonically', async () => {
        const targetMetadata = { internal_chat_message_metadata_passthrough: { turn_id: TURN_ID } };
        const invalidRows = [
            {
                timestamp: BASE_TIMESTAMP,
                type: 'response_item',
                payload: { type: 'function_call', role: 'user', name: 'tool', ...targetMetadata },
            },
            {
                timestamp: BASE_TIMESTAMP,
                type: 'event_msg',
                payload: { type: 'user_message', role: 'user', ...targetMetadata },
            },
        ];
        for (const row of invalidRows) {
            await expectFailure(
                [sessionMeta(), row],
                'codex_request_identity_turn_record_is_not_canonical_root_user',
            );
        }
    });

    it('rejects missing, non-array, empty, blank, and structurally invalid content', async () => {
        const invalidContent: unknown[] = [undefined, 'text', {}, [], [
            { type: 'input_text', text: '   ' },
        ], [null], [{ type: 'output_text', text: 'not input' }]];
        for (const content of invalidContent) {
            const record = userRecord('replaced content');
            if (content === undefined) delete (record.payload as JsonRecord).content;
            else (record.payload as JsonRecord).content = content;
            await expectFailure(
                [sessionMeta(), record],
                'codex_request_identity_turn_is_incomplete',
            );
        }
    });

    it('rejects every session-level fork or subagent lineage marker', async () => {
        const invalidLineage = [
            { thread_source: 'subagent' },
            { parent_thread_id: OTHER_TURN_ID },
            { agent_path: '/root/reviewer' },
            { forked_from_id: OTHER_TURN_ID },
        ];
        for (const marker of invalidLineage) {
            await expectFailure(
                [sessionMeta(marker), userRecord('request')],
                'codex_request_identity_session_is_not_canonical_root_user',
            );
        }
    });

    it('rejects every selected-record fork or subagent lineage marker', async () => {
        const invalidLineage = [
            { thread_source: 'subagent' },
            { parent_thread_id: OTHER_TURN_ID },
            { agent_path: '/root/reviewer' },
            { forked_from_id: OTHER_TURN_ID },
        ];
        for (const marker of invalidLineage) {
            await expectFailure(
                [sessionMeta(), userRecord('request', BASE_TIMESTAMP, TURN_ID, marker)],
                'codex_request_identity_turn_record_lineage_invalid',
            );
        }
    });

    it('fails closed on malformed and non-object JSONL records', async () => {
        await expectFailure(
            [sessionMeta(), '{"truncated":', userRecord('request')],
            'codex_request_identity_session_json_malformed',
        );
        for (const nonObject of [null, [], JSON.stringify('json-string'), 42, true]) {
            await expectFailure(
                [sessionMeta(), nonObject, userRecord('request')],
                'codex_request_identity_session_record_invalid',
            );
        }
    });

    it('fails closed before parsing a session snapshot with invalid UTF-8', async () => {
        const sessionFile = writeSession([sessionMeta(), userRecord('request')]);
        const valid = fs.readFileSync(sessionFile);
        fs.writeFileSync(sessionFile, Buffer.concat([valid, Buffer.from([0xff, 0x0a])]), { mode: 0o600 });
        await assert.rejects(
            readCanonicalCodexUserTurn(
                sessionFile, THREAD_ID, TURN_ID, NOW, MAX_FILE_BYTES, MAX_RECORD_AGE_MS,
            ),
            (error: unknown) => {
                assert.equal((error as Error).message, 'codex_request_identity_session_utf8_invalid');
                return true;
            },
        );
    });

    it('rejects a valid final JSON record without the snapshot terminating newline', async () => {
        await expectFailure(
            [sessionMeta(), userRecord('request')],
            'codex_request_identity_session_has_incomplete_final_line',
            { trailingNewline: false },
        );
    });

    it('derives request and authorization identities from exactly one fixed open', async () => {
        const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-single-scan-auth-'));
        roots.push(codexHome);
        const sessions = path.join(codexHome, 'sessions', '2026', '07', '13');
        fs.mkdirSync(sessions, { recursive: true, mode: 0o700 });
        const threadId = randomUUID();
        const turnId = randomUUID();
        const timestamp = new Date().toISOString();
        const content = [{
            type: 'input_text',
            text: 'Corvus CStar 5.6. I authorize you to complete the audit in full through Hermes M3 for bead:repair:single-scan and decision:single-scan, with zero retries, synthetic fixtures only, no live source collection, targeting exactly /home/morderith/Corvus/CStar/AGENTS.md.',
        }];
        const sessionFile = path.join(sessions, `rollout-single-${threadId}.jsonl`);
        fs.writeFileSync(sessionFile, `${[
            sessionMeta({ id: threadId }),
            userRecord(content[0]!.text, timestamp, turnId),
        ].map(serialize).join('\n')}\n`, { mode: 0o600 });
        const reference = `codex-thread:${threadId}:turn:${turnId}:sha256:${sha256(JSON.stringify(content))}`;
        const priorCodexHome = process.env.CODEX_HOME;
        const originalOpenSync = fs.openSync;
        let sessionOpenCount = 0;
        process.env.CODEX_HOME = codexHome;
        fs.openSync = ((...args: Parameters<typeof fs.openSync>) => {
            if (path.resolve(String(args[0])) === sessionFile) sessionOpenCount += 1;
            return originalOpenSync(...args);
        }) as typeof fs.openSync;
        try {
            const verified = await verifyOperatorAuthorization(reference, {
                caller_thread_id: threadId,
                caller_transport: 'direct-stdio',
                target_paths: ['/home/morderith/Corvus/CStar/AGENTS.md'],
                requires_forge_hermes_m3: true,
                bead_id: 'bead:repair:single-scan',
                decision_id: 'decision:single-scan',
                requires_zero_retries: true,
                requires_synthetic_fixtures_only: true,
                requires_no_live_source: true,
                request_context: { _meta: {
                    threadId,
                    'x-codex-turn-metadata': {
                        session_id: threadId, thread_id: threadId, turn_id: turnId,
                        thread_source: 'user', parent_thread_id: null,
                        forked_from_thread_id: null, subagent_kind: null,
                    },
                } },
            });
            assert.equal(verified.thread_id, threadId);
            assert.equal(sessionOpenCount, 1);
        } finally {
            fs.openSync = originalOpenSync;
            if (priorCodexHome === undefined) delete process.env.CODEX_HOME;
            else process.env.CODEX_HOME = priorCodexHome;
        }
    });

    it('enforces the public file-size snapshot cap at its exact boundary', async () => {
        const rows = [sessionMeta(), userRecord('request')];
        const sessionFile = writeSession(rows);
        const fileBytes = fs.statSync(sessionFile).size;

        const accepted = await readCanonicalCodexUserTurn(
            sessionFile, THREAD_ID, TURN_ID, NOW, fileBytes, MAX_RECORD_AGE_MS,
        );
        assert.equal(accepted.recordCount, 1);

        await assert.rejects(
            readCanonicalCodexUserTurn(
                sessionFile, THREAD_ID, TURN_ID, NOW, fileBytes - 1, MAX_RECORD_AGE_MS,
            ),
            (error: unknown) => {
                assert.equal((error as Error).message, 'codex_request_identity_opened_session_file_is_unsafe');
                return true;
            },
        );
    });
});
