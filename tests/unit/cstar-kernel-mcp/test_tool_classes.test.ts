import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    MCP_TOOL_CLASS_PREFIXES,
    mcpToolDescription,
    CSTAR_KERNEL_TOOL_CLASSES,
} from '../../../src/tools/cstar-kernel-mcp/contracts/tool_classes.js';
import { CSTAR_KERNEL_TOOL_NAMES } from '../../../src/tools/cstar-kernel-mcp/contracts/tool_catalog.js';

describe('CStar MCP tool class contract', () => {
    it('publishes the only allowed plain-English tool classes', () => {
        assert.deepEqual(MCP_TOOL_CLASS_PREFIXES, ['READ', 'MUTATION', 'REQUEST', 'EXECUTION', 'LEGACY']);
    });

    it('prefixes tool descriptions consistently', () => {
        assert.equal(mcpToolDescription('REQUEST', 'Create a receipt.'), 'REQUEST: Create a receipt.');
    });

    it('classifies the full public tool inventory', () => {
        assert.deepEqual(
            Object.keys(CSTAR_KERNEL_TOOL_CLASSES),
            [...CSTAR_KERNEL_TOOL_NAMES],
        );
        assert.equal(CSTAR_KERNEL_TOOL_CLASSES.cstar_forge_request, 'REQUEST');
        assert.equal(CSTAR_KERNEL_TOOL_CLASSES.cstar_forge_authorize, 'MUTATION');
        assert.equal(CSTAR_KERNEL_TOOL_CLASSES.cstar_forge_execute, 'EXECUTION');
        assert.equal('cstar_autobot' in CSTAR_KERNEL_TOOL_CLASSES, false);
        assert.equal(CSTAR_KERNEL_TOOL_CLASSES.cstar_bead, 'MUTATION');
        assert.equal(CSTAR_KERNEL_TOOL_CLASSES.cstar_doctor, 'READ');
        assert.equal(CSTAR_KERNEL_TOOL_CLASSES.cstar_pennyone_context, 'READ');
        assert.equal(CSTAR_KERNEL_TOOL_CLASSES.cstar_hall_maintenance, 'LEGACY');
        assert.equal(CSTAR_KERNEL_TOOL_CLASSES.cstar_mongo_mailbox, 'LEGACY');
        assert.equal(CSTAR_KERNEL_TOOL_CLASSES.cstar_warden, 'EXECUTION');
    });
});
