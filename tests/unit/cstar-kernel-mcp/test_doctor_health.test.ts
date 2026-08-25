import { describe, it } from 'node:test';

import { assert, handleDoctor } from './shared_test_setup.js';

describe('CStar MCP doctor health', () => {
    it('keeps optional Augury advisory health separate from kernel health', async () => {
        const result = await handleDoctor();
        assert.ok(result.content);
        const parsed = JSON.parse(result.content[0].text);
        if (parsed.error) console.error('Doctor Error:', parsed.error);

        assert.strictEqual(parsed.status, 'healthy');
        assert.strictEqual(parsed.score, null);
        assert.strictEqual(parsed.score_source, 'not_measured');
        assert.ok(parsed.checks);
        assert.strictEqual(parsed.checks.database, true);
        assert.strictEqual(parsed.checks.registry, true);
        assert.strictEqual(parsed.checks.augury_required, false);
        assert.ok(['pass', 'warn', 'fail'].includes(parsed.checks.augury_status));
        assert.ok(Array.isArray(parsed.advisory_warnings));
        assert.ok(parsed.usefulness);
        assert.strictEqual(typeof parsed.usefulness.total_calls_24h, 'number');
        assert.ok(parsed.token_path);
        assert.strictEqual(typeof parsed.token_path.advisor_available, 'boolean');
        assert.strictEqual(typeof parsed.token_path.advice_count_24h, 'number');
    });
});
