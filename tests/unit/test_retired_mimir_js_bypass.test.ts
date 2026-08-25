import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODULE_PATH = path.join(PROJECT_ROOT, 'src', 'core', 'mimir_client.js');

describe('retired JavaScript Mimir bridge', () => {
    it('is import-safe and returns only the stable retirement result', async () => {
        const source = fs.readFileSync(MODULE_PATH, 'utf-8');
        const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
        assert.equal(
            await module.mimir.think('"; touch /tmp/should-never-run; #'),
            'legacy_mimir_js_bridge_retired_use_host_native_researcher',
        );
        assert.equal(
            await module.mimir.get_file_intent('/etc/passwd'),
            'legacy_mimir_js_bridge_retired_use_host_native_researcher',
        );
        assert.equal(await module.mimir.close(), undefined);
    });

    it('contains no subprocess, shell, provider, or ambient-environment access', () => {
        const source = fs.readFileSync(MODULE_PATH, 'utf-8');
        assert.doesNotMatch(source, /child_process|execSync|spawn\s*\(|process\.env|GEMINI_CLI_ACTIVE/);
    });
});
