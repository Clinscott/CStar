import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface HostReceiptFixtureValue {
    repositoryRoot: string;
    beadId: string;
    evidencePath: string;
    evidenceSha: string;
    recorderThreadId: string;
    recorderSessionFile: string;
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

export function createHostReceipt(
    value: HostReceiptFixtureValue,
    validationId: string,
    validatorThreadId: string,
    validatorTurnId: string,
) {
    const manifestPath = path.join(value.repositoryRoot, 'evidence', 'manifest.json');
    const manifest = {
        schema: 'cstar.independent_validation_input.v1',
        bead_id: value.beadId,
        validation_id: validationId,
        reported_verdict: 'ACCEPTED',
        artifacts: [{
            path: 'evidence/validation.txt',
            sha256: value.evidenceSha,
            bytes: fs.statSync(value.evidencePath).size,
        }],
        checks: [{
            name: 'host-v3 synthetic validation',
            status: 'pass',
            evidence_path: 'evidence/validation.txt',
            sha256: value.evidenceSha,
        }],
    };
    const manifestContent = `${JSON.stringify(manifest)}\n`;
    fs.writeFileSync(manifestPath, manifestContent, { mode: 0o600 });
    const manifestSha256 = sha256(manifestContent);
    const completedAt = Date.now() - 1_000;
    const finalTimestamp = new Date(completedAt + 500).toISOString();
    const completedTimestamp = new Date(completedAt + 600).toISOString();
    const sessionMeta = {
        id: validatorThreadId,
        session_id: value.recorderThreadId,
        thread_source: 'subagent',
        parent_thread_id: value.recorderThreadId,
        forked_from_id: value.recorderThreadId,
        agent_path: '/root/validator',
        source: {
            subagent: {
                thread_spawn: {
                    parent_thread_id: value.recorderThreadId,
                    depth: 1,
                    agent_path: '/root/validator',
                },
            },
        },
    };
    const finalText = [
        'Independent host validation complete.',
        `Manifest ${manifestSha256}`,
        `Validation ${validationId}`,
    ].join('\n');
    const rows = [
        {
            timestamp: new Date(completedAt - 1_000).toISOString(),
            type: 'session_meta',
            payload: sessionMeta,
        },
        {
            timestamp: finalTimestamp,
            type: 'response_item',
            payload: {
                type: 'message', role: 'assistant', phase: 'final_answer',
                content: [{ type: 'output_text', text: finalText }],
                internal_chat_message_metadata_passthrough: { turn_id: validatorTurnId },
            },
        },
        {
            timestamp: completedTimestamp,
            type: 'event_msg',
            payload: {
                type: 'task_complete',
                turn_id: validatorTurnId,
                last_agent_message: finalText,
                completed_at: completedAt / 1_000,
            },
        },
    ];
    fs.writeFileSync(
        path.join(path.dirname(value.recorderSessionFile), `rollout-test-${validatorThreadId}.jsonl`),
        `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`,
        { mode: 0o600 },
    );
    return {
        validator_thread_id: validatorThreadId,
        validator_turn_id: validatorTurnId,
        manifest_path: 'evidence/manifest.json',
        manifest_sha256: manifestSha256,
    };
}
