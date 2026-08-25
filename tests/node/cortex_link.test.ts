import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { CortexLink, type KernelCommandPayload } from '../../src/node/cortex_link.js';

describe('CortexLink kernel bridge', () => {
    it('sendCommand forwards structured payloads to the executor', async () => {
        let captured: KernelCommandPayload | null = null;
        const link = new CortexLink(
            50051,
            '127.0.0.1',
            undefined,
            async (payload) => {
                captured = payload;
                return { status: 'success', data: { ok: true } };
            },
        );

        const response = await link.sendCommand('MATRIX_UPDATED', ['arg1'], '/my/cwd');

        assert.deepEqual(captured, {
            command: 'MATRIX_UPDATED',
            args: ['arg1'],
            cwd: '/my/cwd',
        });
        assert.deepEqual(response, { status: 'success', data: { ok: true } });
    });

    it('ensureDaemon validates the one-shot kernel bridge through ping', async () => {
        const commands: string[] = [];
        const link = new CortexLink(
            50051,
            '127.0.0.1',
            undefined,
            async (payload) => {
                commands.push(payload.command);
                return { status: 'success', data: { message: 'kernel bridge ready' } };
            },
        );

        await link.ensureDaemon();

        assert.deepEqual(commands, ['ping']);
    });

    it('shutdownDaemon sends a compatibility shutdown command', async () => {
        const commands: string[] = [];
        const link = new CortexLink(
            50051,
            '127.0.0.1',
            undefined,
            async (payload) => {
                commands.push(payload.command);
                return { status: 'success' };
            },
        );

        await link.shutdownDaemon();

        assert.deepEqual(commands, ['shutdown']);
    });

    it('sendCommand surfaces executor failures', async () => {
        const link = new CortexLink(
            50051,
            '127.0.0.1',
            undefined,
            async () => {
                throw new Error('Kernel bridge unavailable');
            },
        );

        await assert.rejects(() => link.sendCommand('ping'), /Kernel bridge unavailable/);
    });

    it('rejects retired mutation commands before calling the executor', async () => {
        let calls = 0;
        const link = new CortexLink(50051, '127.0.0.1', undefined, async () => {
            calls += 1;
            return { status: 'success' };
        });

        await assert.rejects(
            () => link.sendCommand('PHYSICAL_MOVE_REQUEST', ['a', 'b']),
            /kernel_bridge_command_decommissioned/,
        );
        assert.equal(calls, 0);
        assert.equal(await link.handleArchitectMove('a.ts', 'b.ts'), false);
        await assert.rejects(
            () => link.interceptWrite('a.ts', 'content'),
            /cortex_write_path_decommissioned/,
        );
    });
});
