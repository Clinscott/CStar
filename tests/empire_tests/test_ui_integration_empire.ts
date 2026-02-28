import { test } from 'node:test';
import assert from 'node:assert';
import { execa } from 'execa';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const CSTAR_PATH = join(PROJECT_ROOT, 'cstar.ts');

test('Control Plane (cstar.ts) displays integration status in Gemini Mode', async () => {
    // GIVEN: GEMINI_CLI_ACTIVE is set to true
    // WHEN: Executing a command that triggers the ceremony (like ravens --status)
    const { stdout } = await execa('npx', ['tsx', CSTAR_PATH, 'ravens', '--status'], {
        env: { ...process.env, GEMINI_CLI_ACTIVE: 'true' }
    });

    // THEN: HUD should show integration active
    assert.ok(stdout.includes('◤ GEMINI CLI INTEGRATION ACTIVE ◢'), 'HUD should show integration active');
    
    // AND: Startup ceremony should show decoupled intelligence
    assert.ok(stdout.includes('INTELLIGENCE: DECOUPLED'), 'Ceremony should show decoupled intelligence');
    assert.ok(stdout.includes('MIND: GEMINI-2.5-FLASH'), 'Ceremony should show active mind');
    
    // AND: Quota Isolation should still be visible
    assert.ok(stdout.includes('◤ QUOTA ISOLATION ◢'), 'Quota isolation should be visible');
});
