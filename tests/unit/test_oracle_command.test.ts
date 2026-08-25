import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';

import {
    ORACLE_ADVISORY_ONLY,
    buildOraclePrompt,
    fulfillOracleSynapseRequest,
    parseOracleProvider,
    resolveOraclePromptTarget,
    registerOracleCommand,
    sampleOraclePrompt,
} from '../../src/node/core/commands/oracle.ts';

describe('Oracle advisory-only command', () => {
    it('wraps an explicit advisory system prompt', () => {
        assert.equal(
            buildOraclePrompt('User intent', 'System intent'),
            'SYSTEM:\nSystem intent\n\nUSER:\nUser intent',
        );
    });

    it('treats an existing path as literal text and never reads it', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-literal-'));
        const promptPath = path.join(root, 'secret.txt');
        fs.writeFileSync(promptPath, 'do not read', 'utf-8');
        assert.equal(resolveOraclePromptTarget(promptPath), promptPath);
    });

    it('samples one advisory response with requested provider identity', async () => {
        const response = await sampleOraclePrompt(
            'Review this',
            { projectRoot: '/tmp/corvus', provider: 'codex' },
            {
                hostTextInvoker: async (request) => {
                    assert.equal(request.source, 'cli:oracle:advisory');
                    assert.equal(request.provider, 'codex');
                    return {
                        provider: 'codex',
                        text: 'Advisory only.',
                        response: {
                            status: 'success',
                            raw_text: 'Advisory only.',
                            trace: { correlation_id: 'oracle-test', transport_mode: 'host_session' },
                        },
                    };
                },
            },
        );
        assert.equal(response, 'Advisory only.');
    });

    it('rejects the retired Synapse mutation path', async () => {
        await assert.rejects(fulfillOracleSynapseRequest(), new RegExp(ORACLE_ADVISORY_ONLY));
    });

    it('accepts only declared host providers', () => {
        assert.equal(parseOracleProvider('gemini'), 'gemini');
        assert.equal(parseOracleProvider('codex'), 'codex');
        assert.equal(parseOracleProvider('claude'), 'claude');
        assert.throws(() => parseOracleProvider('minimax'), /Expected one of/);
    });

    it('registers no file-output or database mutation options', () => {
        const program = new Command();
        registerOracleCommand(program, '/tmp/corvus');
        const oracle = program.commands.find((command) => command.name() === 'oracle');
        assert.ok(oracle);
        const flags = oracle.options.map((option) => option.flags).join(' ');
        assert.doesNotMatch(flags, /--out|--db/);
        assert.match(oracle.description(), /non-authoritative.*stdout only/i);
    });
});
