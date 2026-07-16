import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { projectForgeRoleEvidence } from '../../../src/tools/cstar-kernel-mcp/tools/forge_role_evidence.js';

const ROLES = ['specifier', 'coder', 'cleaner', 'architect', 'hardener', 'qa'];
const PLAN_SHA = '61e9b28d65ad80495bce567307dc8e577a5335d6897a46591efdd54b76b62d52';

function evidence(planSha = PLAN_SHA) {
    const receipts = ROLES.map((role, index) => ({
        role, phase: `${index + 1}/6`,
        input_handoff_sha256: index === 0 ? '0'.repeat(64) : `${index}`.repeat(64),
        specification_handoff_sha256: index === 0 ? '0'.repeat(64) : '1'.repeat(64),
        output_handoff_sha256: `${index + 1}`.repeat(64),
        input_tokens: index + 1, output_tokens: index + 2,
    }));
    return {
        status: 'ok', forge_topology: 'bounded-six-role-manifest-v1',
        role_plan_sha256: planSha, role_receipts: receipts,
        provider_requests_started: 6, provider_requests_completed: 6,
        input_tokens: 21, output_tokens: 27,
    };
}

describe('CStar Forge role evidence projection', () => {
    it('accepts the exact fixed plan and complete chained receipts', () => {
        const projected = projectForgeRoleEvidence(evidence());
        assert.equal(projected.valid, true);
        assert.equal(projected.role_plan_sha256, PLAN_SHA);
        assert.deepEqual(projected.role_receipts?.map((item) => item.role), ROLES);
    });

    it('rejects a syntactically valid but noncanonical plan digest', () => {
        const projected = projectForgeRoleEvidence(evidence('f'.repeat(64)));
        assert.equal(projected.valid, false);
        assert.equal(projected.role_plan_sha256, null);
    });
});
