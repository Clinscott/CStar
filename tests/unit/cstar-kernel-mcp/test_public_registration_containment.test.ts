import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerCoreTools } from '../../../src/tools/cstar-kernel-mcp/register_core_tools.js';

interface RegisteredTool {
    name: string;
    schema: Record<string, unknown>;
}

function registeredTools(): RegisteredTool[] {
    const tools: RegisteredTool[] = [];
    registerCoreTools(
        {
            tool: (name: string, _description: string, schema: Record<string, unknown>) => {
                tools.push({ name, schema });
            },
        },
        (_name, handler) => handler,
    );
    return tools;
}

describe('CStar MCP public registration containment', () => {
    it('keeps force, exemption, and caller-authored authorization fields private', () => {
        const tools = registeredTools();
        const beadSchema = tools.find((tool) => tool.name === 'cstar_bead')?.schema;
        assert.ok(beadSchema);
        for (const forbidden of ['force', 'force_reason', 'mandate_exempt', 'exemption_reason']) {
            assert.ok(!Object.hasOwn(beadSchema, forbidden), `cstar_bead must not expose public ${forbidden} input`);
        }

        const mailboxSchema = tools.find((tool) => tool.name === 'cstar_mongo_mailbox')?.schema;
        assert.ok(mailboxSchema);
        assert.ok(
            !Object.hasOwn(mailboxSchema, 'operator_authorization_ref'),
            'cstar_mongo_mailbox must not expose caller-authored authorization text',
        );
    });

    it('registers legacy AutoBot only under the exact server opt-in', () => {
        const previousEnable = process.env.CSTAR_KERNEL_ENABLE_AUTOBOT;
        const previousDelegated = process.env.HERMES_AUTOBOT_DELEGATED;
        try {
            delete process.env.CSTAR_KERNEL_ENABLE_AUTOBOT;
            delete process.env.HERMES_AUTOBOT_DELEGATED;
            assert.ok(!registeredTools().some((tool) => tool.name === 'cstar_autobot'));

            process.env.CSTAR_KERNEL_ENABLE_AUTOBOT = 'true';
            assert.ok(!registeredTools().some((tool) => tool.name === 'cstar_autobot'));

            process.env.CSTAR_KERNEL_ENABLE_AUTOBOT = '1';
            assert.ok(registeredTools().some((tool) => tool.name === 'cstar_autobot'));

            process.env.HERMES_AUTOBOT_DELEGATED = '1';
            assert.ok(!registeredTools().some((tool) => tool.name === 'cstar_autobot'));
        } finally {
            if (previousEnable === undefined) delete process.env.CSTAR_KERNEL_ENABLE_AUTOBOT;
            else process.env.CSTAR_KERNEL_ENABLE_AUTOBOT = previousEnable;
            if (previousDelegated === undefined) delete process.env.HERMES_AUTOBOT_DELEGATED;
            else process.env.HERMES_AUTOBOT_DELEGATED = previousDelegated;
        }
    });
});
