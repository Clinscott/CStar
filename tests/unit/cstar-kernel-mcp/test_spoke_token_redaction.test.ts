import { describe, it } from 'node:test';
import {
    assert,
    fs,
    handleSpoke,
    makeSpoke,
    os,
    path,
    spokeStore,
} from './shared_test_setup.js';
import { redactSpokeTokens } from '../../../src/tools/cstar-kernel-mcp/tools/spoke.js';

describe('CStar MCP spoke token redaction', () => {
    it('recursively removes raw token keys while preserving verdict fields', () => {
        const redacted = redactSpokeTokens({
            mount_token: 'raw-mount',
            nested: {
                hall_token: 'raw-hall',
                identity_token: 'raw-identity',
                mount_token_reason: 'mount token verified',
                mount_token_ok: true,
            },
        }) as any;
        assert.strictEqual(redacted.mount_token, undefined);
        assert.strictEqual(redacted.nested.hall_token, undefined);
        assert.strictEqual(redacted.nested.identity_token, undefined);
        assert.strictEqual(redacted.nested.mount_token_reason, 'mount token verified');
        assert.strictEqual(redacted.nested.mount_token_ok, true);
    });

    it('removes persisted authority from spoke inspection', async () => {
        spokeStore.set('redacted-inspect', makeSpoke({
            slug: 'redacted-inspect',
            root_path: '/tmp/redacted-inspect',
            metadata: {
                authority: {
                    mount_token: 'raw-inspect-token',
                    contract_version: '1',
                },
            },
        }));
        const result = await handleSpoke({ action: 'inspect', slug: 'redacted-inspect' });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.spoke.metadata.authority.mount_token, undefined);
        assert.strictEqual(parsed.spoke.metadata.authority.contract_version, '1');
        assert.ok(!JSON.stringify(parsed).includes('raw-inspect-token'));
    });

    it('returns a bounded verification verdict without either raw token', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spoke-verify-redaction-'));
        const profileRoot = path.join(tmpRoot, '.cstar');
        const rawToken = 'raw-verify-token';
        fs.mkdirSync(profileRoot, { recursive: true });
        fs.writeFileSync(path.join(profileRoot, 'IDENTITY.json'), JSON.stringify({
            schema: 'cstar.spoke.identity',
            mount_token: rawToken,
        }));
        spokeStore.set('verify-redaction', makeSpoke({
            slug: 'verify-redaction',
            root_path: tmpRoot,
            metadata: { authority: { mount_token: rawToken } },
        }));
        try {
            const result = await handleSpoke({ action: 'verify', slug: 'verify-redaction' });
            const parsed = JSON.parse(result.content[0].text);
            assert.strictEqual(parsed.report.mount_token, undefined);
            assert.strictEqual(parsed.report.mount_token_verdict, 'ok');
            assert.strictEqual(parsed.report.hall_token, undefined);
            assert.strictEqual(parsed.report.identity_token, undefined);
            assert.ok(!JSON.stringify(parsed).includes(rawToken));
        } finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });
});
