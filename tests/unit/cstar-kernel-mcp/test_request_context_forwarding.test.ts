import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { McpRequestContext } from '../../../src/tools/cstar-kernel-mcp/contracts/request_context.js';
import { textResponse } from '../../../src/tools/cstar-kernel-mcp/contracts/responses.js';
import { instrumentTool } from '../../../src/tools/cstar-kernel-mcp/telemetry/usage.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';

const originalRoot = registry.getRoot();
const roots: string[] = [];

afterEach(() => {
    registry.setRoot(originalRoot);
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('MCP request context forwarding', () => {
    it('preserves host-injected request identity metadata through telemetry instrumentation', async () => {
        const root = fs.mkdtempSync(path.join(process.platform === 'linux' ? '/tmp' : os.tmpdir(), 'cstar-context-forward-'));
        roots.push(root);
        registry.setRoot(root);
        const context: McpRequestContext = {
            requestId: 'request:test',
            _meta: {
                threadId: '019f0000-0000-7000-8000-000000000111',
                'x-codex-turn-metadata': { turn_id: '019f0000-0000-7000-8000-000000000112' },
            },
        };
        let observed: McpRequestContext | undefined;
        const wrapped = instrumentTool('cstar_bead', async (_args: { action: string }, requestContext) => {
            observed = requestContext;
            return textResponse({ status: 'ok' });
        });

        await wrapped({ action: 'get' }, context);

        assert.strictEqual(observed, context);
        assert.equal(observed?._meta?.threadId, context._meta?.threadId);
    });
});
