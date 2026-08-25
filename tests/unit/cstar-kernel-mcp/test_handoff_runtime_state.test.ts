import { describe, it } from 'node:test';
import {
    assert,
    beadStore,
    handleHandoff,
} from './shared_test_setup.js';

describe('CStar MCP handoff runtime state', () => {
    it('uses the latest valid runtime execution bead as the active handoff board', async () => {
        const now = Date.now();
        const beadId = 'bead:exec:test-current-handoff';
        beadStore.set(beadId, {
            id: beadId,
            repo_id: 'test-repo',
            target_kind: 'WORKFLOW',
            target_path: 'docs/integrations/cstar-kernel-mcp.md',
            status: 'IN_PROGRESS',
            rationale: 'Current runtime handoff should override stale planning-only state.',
            contract_refs: [],
            baseline_scores: {},
            metadata: {
                augury_contract: {
                    intent_category: 'HARDEN',
                    intent: 'Keep the CStar MCP handoff board aligned with the current runtime goal.',
                    selection_tier: 'WEAVE',
                    selection_name: 'contract_hardening',
                    mimirs_well: ['docs/integrations/cstar-kernel-mcp.md'],
                },
            },
            created_at: now,
            updated_at: now,
        });

        const result = await handleHandoff({
            prompt: 'Continue the current MCP hygiene pass.',
            scope: 'brain:CStar',
            target_paths: ['docs/integrations/cstar-kernel-mcp.md'],
        });
        const parsed = JSON.parse(result.content[0].text);

        assert.strictEqual(parsed.status, 'active');
        assert.strictEqual(parsed.authoritative, true);
        assert.strictEqual(parsed.lead_bead_id, beadId);
        assert.strictEqual(parsed.route.intent_category, 'HARDEN');
        assert.deepStrictEqual(parsed.target_paths, ['docs/integrations/cstar-kernel-mcp.md']);
    });
});
