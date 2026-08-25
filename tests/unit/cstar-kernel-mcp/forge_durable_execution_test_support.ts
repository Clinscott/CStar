import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function writeSingleInputSession(codexHome: string, text: string, platformContext = false) {
    const threadId = randomUUID();
    const turnId = randomUUID();
    const timestamp = new Date().toISOString();
    const sessionDir = path.join(codexHome, 'sessions', '2026', '07', '13');
    fs.mkdirSync(sessionDir, { recursive: true });
    const rows: Record<string, unknown>[] = [
        {
            timestamp,
            type: 'session_meta',
            payload: {
                id: threadId,
                thread_source: 'user',
                parent_thread_id: null,
                agent_path: null,
                forked_from_id: null,
            },
        },
        ...(platformContext ? [
            {
                timestamp, type: 'response_item', payload: {
                    type: 'message', role: 'user', content: [{ type: 'input_text', text: [
                        '<environment_context>',
                        '  <current_date>2026-07-15</current_date>',
                        '  <timezone>America/Toronto</timezone>',
                        `  <filesystem><workspace_roots><root>${process.cwd()}</root></workspace_roots><permission_profile type="disabled"><file_system type="unrestricted" /></permission_profile></filesystem>`,
                        '</environment_context>',
                    ].join('\n') }],
                    internal_chat_message_metadata_passthrough: { turn_id: turnId },
                },
            },
            {
                timestamp, type: 'world_state', payload: {
                    full: false, state: { environments: { current_date: '2026-07-15' } },
                },
            },
            {
                timestamp, type: 'turn_context', payload: {
                    turn_id: turnId, current_date: '2026-07-15', timezone: 'America/Toronto',
                    workspace_roots: [process.cwd()], permission_profile: { type: 'disabled' },
                    sandbox_policy: { type: 'danger-full-access' },
                },
            },
        ] : []),
        {
            timestamp,
            type: 'response_item',
            payload: {
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text }],
                internal_chat_message_metadata_passthrough: { turn_id: turnId },
            },
        },
    ];
    const sessionFile = path.join(sessionDir, `rollout-fixture-${threadId}.jsonl`);
    fs.writeFileSync(sessionFile, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, { mode: 0o600 });
    return { threadId, turnId, sessionFile };
}

export function writeCountingAdapter(root: string, writeInvocationMarker = false): string {
    const script = path.join(root, 'sealed-forge-adapter.py');
    fs.writeFileSync(script, [
        '#!/usr/bin/env python3',
        'import argparse, json, os',
        'parser = argparse.ArgumentParser()',
        'parser.add_argument("--intent-file", required=True)',
        'args = parser.parse_args()',
        ...(writeInvocationMarker ? [
            'marker = os.path.join(os.path.dirname(__file__), "forge-adapter-invoked")',
            'with open(marker, "a", encoding="utf-8") as handle:',
            '    handle.write("invoked\\n")',
        ] : []),
        'with open(args.intent_file, encoding="utf-8") as handle:',
        '    intent = json.load(handle)',
        'write_to = intent["payload"]["write_to"]',
        'response = {',
        '    "status": "pass",',
        '    "summary": "sealed durable Forge fixture",',
        '    "files_changed": [],',
        '    "artifacts": {},',
        '    "validation": {"sealed_fixture": "pass"},',
        '    "metrics": {"adapter_invocations": 1},',
        '    "boundaries": {"codex_worker_fallback_allowed": False, "live_source_collection": False},',
        '    "callback_packet": "DURABLE_FORGE_TEST_PACKET",',
        '}',
        'os.makedirs(os.path.dirname(write_to), exist_ok=True)',
        'with open(write_to, "w", encoding="utf-8") as handle:',
        '    json.dump(response, handle)',
        'print(json.dumps({',
        '    "status": "ok",',
        '    "intent_id": "sealed-fixture-intent",',
        '    "model": intent["payload"]["model"],',
        '    "hermes_profile": intent["payload"]["hermes_profile"],',
        '    "wrote_to": write_to,',
        '    "live_spend": False,',
        '    "live_source_collection": False,',
        '}))',
    ].join('\n'));
    fs.chmodSync(script, 0o700);
    return script;
}
