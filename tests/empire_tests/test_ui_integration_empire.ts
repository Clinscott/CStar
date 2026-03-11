import { test } from 'node:test';
import assert from 'node:assert';
import { execa } from 'execa';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const CSTAR_PATH = join(PROJECT_ROOT, 'cstar.ts');

test('Control Plane (cstar.ts) displays integration status in Gemini Mode', async () => {
    const { stdout } = await execa('npx', ['tsx', CSTAR_PATH, 'status'], {
        env: { ...process.env, GEMINI_CLI_ACTIVE: 'true' }
    });

    assert.ok(stdout.includes('◤ GEMINI CLI INTEGRATION ACTIVE ◢'), 'HUD should show integration active');
});

test('Control Plane (cstar.ts) displays integration status in Codex Mode', async () => {
    const { stdout } = await execa('npx', ['tsx', CSTAR_PATH, 'status'], {
        env: { ...process.env, CODEX_SHELL: '1', CODEX_THREAD_ID: 'test-thread' }
    });

    assert.ok(stdout.includes('◤ CODEX CLI INTEGRATION ACTIVE ◢'), 'HUD should show Codex integration active');
});
