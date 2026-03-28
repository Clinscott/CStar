import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Command } from 'commander';

import {
    buildOraclePrompt,
    fulfillOracleSynapseRequest,
    parseOracleProvider,
    resolveOraclePromptTarget,
    registerOracleCommand,
    sampleOraclePrompt,
} from '../../src/node/core/commands/oracle.ts';

describe('Oracle command spoke (CS-P1-02)', () => {
    it('wraps system prompts in the canonical oracle envelope', () => {
        assert.equal(
            buildOraclePrompt('User intent', 'System intent'),
            'SYSTEM:\nSystem intent\n\nUSER:\nUser intent',
        );
    });

    it('reads prompt content from a file target before sampling', () => {
        const promptPath = path.join(os.tmpdir(), `corvus-oracle-prompt-${Date.now()}.txt`);
        fs.writeFileSync(promptPath, 'File-backed intent', 'utf-8');

        try {
            assert.equal(
                resolveOraclePromptTarget(promptPath, 'Use the file'),
                'SYSTEM:\nUse the file\n\nUSER:\nFile-backed intent',
            );
        } finally {
            fs.unlinkSync(promptPath);
        }
    });

    it('fulfills Synapse records through the shared host bridge and marks them completed', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-oracle-command-'));
        const dbPath = path.join(tmpRoot, '.stats', 'synapse.db');
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });

        const db = new Database(dbPath);
        try {
            db.exec(`
                CREATE TABLE synapse (
                    id INTEGER PRIMARY KEY,
                    prompt TEXT,
                    response TEXT,
                    status TEXT
                )
            `);
            db.prepare('INSERT INTO synapse (id, prompt, status) VALUES (?, ?, ?)')
                .run(7, 'Explain the unified bridge.', 'PENDING');
        } finally {
            db.close();
        }

        const response = await fulfillOracleSynapseRequest(
            7,
            { projectRoot: tmpRoot, env: { CORVUS_HOST_PROVIDER: 'codex' } },
            {
                hostTextInvoker: async (request) => {
                    assert.equal(request.prompt, 'Explain the unified bridge.');
                    assert.equal(request.projectRoot, tmpRoot);
                    assert.equal(request.source, 'cli:oracle:synapse');
                    return {
                        provider: 'codex',
                        text: 'Unified bridge fulfilled.',
                        response: {
                            status: 'success',
                            raw_text: 'Unified bridge fulfilled.',
                            trace: {
                                correlation_id: 'oracle-command-test',
                                transport_mode: 'host_session',
                            },
                        },
                    };
                },
            },
        );

        assert.equal(response, 'Unified bridge fulfilled.');

        const verificationDb = new Database(dbPath, { readonly: true });
        try {
            const row = verificationDb
                .prepare('SELECT response, status FROM synapse WHERE id = ?')
                .get(7) as { response: string; status: string } | undefined;
            assert.deepStrictEqual(row, {
                response: 'Unified bridge fulfilled.',
                status: 'COMPLETED',
            });
        } finally {
            verificationDb.close();
        }
    });

    it('parses valid provider values', () => {
        assert.equal(parseOracleProvider('gemini'), 'gemini');
        assert.equal(parseOracleProvider('codex'), 'codex');
        assert.equal(parseOracleProvider('claude'), 'claude');
    });

    it('accepts valid provider options on the command surface', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-oracle-command-'));
        const program = new Command();
        program.exitOverride();
        program.configureOutput({
            writeErr: () => undefined,
            outputError: () => undefined,
        });
        let seenProvider: string | undefined;
        registerOracleCommand(program, tmpRoot, {
            hostTextInvoker: async (request) => {
                seenProvider = request.provider;
                return {
                    provider: request.provider ?? 'codex',
                    text: 'Response text',
                    response: {
                        status: 'success',
                        raw_text: 'Response text',
                        trace: {
                            correlation_id: 'test',
                            transport_mode: 'host_session',
                        },
                    },
                };
            },
        });

        await program.parseAsync(['node', 'oracle-test.ts', 'oracle', 'prompt', '--provider', 'gemini', '--silent']);
        assert.equal(seenProvider, 'gemini');
    });

    it('rejects invalid provider values through command surface', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-oracle-command-'));
        const program = new Command();
        program.exitOverride();
        program.configureOutput({
            writeErr: () => undefined,
            outputError: () => undefined,
        });
        registerOracleCommand(program, tmpRoot, {
            hostTextInvoker: async () => ({
                provider: 'codex',
                text: 'Response text',
                response: {
                    status: 'success',
                    raw_text: 'Response text',
                    trace: {
                        correlation_id: 'test',
                        transport_mode: 'host_session',
                    },
                },
            }),
        });

        await assert.rejects(
            program.parseAsync(['node', 'oracle-test.ts', 'oracle', 'prompt', '--provider', 'invalid']),
            /Expected one of gemini, codex, claude/i,
        );
    });

    it('threads provider override through direct prompt sampling', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-oracle-command-'));
        const provider = 'codex';

        const response = await sampleOraclePrompt(
            'Test prompt',
            { projectRoot: tmpRoot, provider },
            {
                hostTextInvoker: async (request) => {
                    assert.equal(request.provider, provider);
                    return {
                        provider,
                        text: 'Direct sampling response',
                        response: {
                            status: 'success',
                            raw_text: 'Direct sampling response',
                            trace: {
                                correlation_id: 'test',
                                transport_mode: 'host_session',
                            },
                        },
                    };
                },
            },
        );

        assert.equal(response, 'Direct sampling response');
    });

    it('does not force a provider override when none is supplied', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-oracle-command-'));
        let seenProvider: string | null | undefined = 'unset';

        const response = await sampleOraclePrompt(
            'Test prompt',
            { projectRoot: tmpRoot },
            {
                hostTextInvoker: async (request) => {
                    seenProvider = request.provider;
                    return {
                        provider: 'codex',
                        text: 'Direct sampling response',
                        response: {
                            status: 'success',
                            raw_text: 'Direct sampling response',
                            trace: {
                                correlation_id: 'test',
                                transport_mode: 'host_session',
                            },
                        },
                    };
                },
            },
        );

        assert.equal(response, 'Direct sampling response');
        assert.equal(seenProvider, undefined);
    });

    it('threads provider override through Synapse fulfillment path', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-oracle-command-'));
        const dbPath = path.join(tmpRoot, '.stats', 'synapse.db');
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });

        const db = new Database(dbPath);
        try {
            db.exec(`
                CREATE TABLE synapse (
                    id INTEGER PRIMARY KEY,
                    prompt TEXT,
                    response TEXT,
                    status TEXT
                )
            `);
            db.prepare('INSERT INTO synapse (id, prompt, status) VALUES (?, ?, ?)')
                .run(42, 'Synapse test prompt', 'PENDING');
        } finally {
            db.close();
        }

        const provider = 'claude';
        const response = await fulfillOracleSynapseRequest(
            42,
            { projectRoot: tmpRoot, provider },
            {
                hostTextInvoker: async (request) => {
                    assert.equal(request.provider, provider);
                    return {
                        provider,
                        text: 'Synapse fulfillment response',
                        response: {
                            status: 'success',
                            raw_text: 'Synapse fulfillment response',
                            trace: {
                                correlation_id: 'test',
                                transport_mode: 'host_session',
                            },
                        },
                    };
                },
            },
        );

        assert.equal(response, 'Synapse fulfillment response');

        const verificationDb = new Database(dbPath, { readonly: true });
        try {
            const row = verificationDb
                .prepare('SELECT response, status FROM synapse WHERE id = ?')
                .get(42) as { response: string; status: string } | undefined;
            assert.deepStrictEqual(row, {
                response: 'Synapse fulfillment response',
                status: 'COMPLETED',
            });
        } finally {
            verificationDb.close();
        }
    });
});
