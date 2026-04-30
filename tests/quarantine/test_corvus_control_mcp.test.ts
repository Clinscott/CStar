import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveControlPlaneAction } from '../../src/tools/corvus-control-mcp.js';

describe('Corvus Control MCP planning', () => {
    it('uses host-supervised normalization when a host provider is active', async () => {
        const result = await resolveControlPlaneAction(
            {
                kind: 'command',
                name: 'start',
                args: ['--task', 'resume mission'],
                env: { CODEX_SHELL: '1' } as NodeJS.ProcessEnv,
            },
            {
                hostTextInvoker: async () => ({
                    provider: 'codex',
                    response: {} as any,
                    text: JSON.stringify({
                        mode: 'execute_now',
                        command_or_workflow: 'start',
                        args: ['--task', 'resume mission', '--loki'],
                        rationale: 'Host wants explicit resume velocity.',
                    }),
                }),
            },
        );

        assert.equal(result.delegated, true);
        assert.equal(result.provider, 'codex');
        assert.equal(result.plan.mode, 'execute_now');
        assert.deepEqual(result.plan.args, ['--task', 'resume mission', '--loki']);
        assert.equal(result.plan.rationale, 'Host wants explicit resume velocity.');
    });

    it('can return observe-only when the host supervisor defers execution', async () => {
        const result = await resolveControlPlaneAction(
            {
                kind: 'workflow',
                name: 'investigate',
                args: ['runtime drift'],
                env: { CODEX_SHELL: '1' } as NodeJS.ProcessEnv,
            },
            {
                hostTextInvoker: async () => ({
                    provider: 'codex',
                    response: {} as any,
                    text: JSON.stringify({
                        mode: 'observe_only',
                        command_or_workflow: 'investigate',
                        args: ['runtime drift'],
                        rationale: 'Needs operator review before execution.',
                    }),
                }),
            },
        );

        assert.equal(result.plan.mode, 'observe_only');
        assert.equal(result.plan.rationale, 'Needs operator review before execution.');
    });

    it('falls back to direct execution when no host provider is active', async () => {
        const result = await resolveControlPlaneAction({
            kind: 'command',
            name: 'ravens',
            args: ['status'],
            env: { CORVUS_HOST_SESSION_ACTIVE: 'false' } as NodeJS.ProcessEnv,
        });

        assert.equal(result.delegated, false);
        assert.equal(result.provider, null);
        assert.equal(result.plan.mode, 'execute_now');
        assert.equal(result.plan.command_or_workflow, 'ravens');
        assert.deepEqual(result.plan.args, ['status']);
    });
});
