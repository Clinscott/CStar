import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('Skill: agent-browser', () => {
    const PROJECT_ROOT = process.cwd();
    const MANIFEST_PATH = path.join(PROJECT_ROOT, '.agents', 'skill_registry.json');
    const INTEGRATION_FLAG = process.env.CSTAR_AGENT_BROWSER_INTEGRATION === '1';
    const INTEGRATION_BINARY_PATH = process.env.CSTAR_AGENT_BROWSER_BINARY_PATH?.trim();
    const HAS_INTEGRATION_BINARY = Boolean(INTEGRATION_BINARY_PATH && fs.existsSync(INTEGRATION_BINARY_PATH));
    const runBrowserIntegration = INTEGRATION_FLAG && HAS_INTEGRATION_BINARY ? it : it.skip;

    it('is registered in the skill registry', () => {
        const registry = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as {
            entries?: Record<string, {
                execution?: { mode?: string; ownership_model?: string; allow_kernel_fallback?: boolean };
                entrypoint_path?: string | null;
                runtime_trigger?: string;
                owner_runtime?: string;
            }>;
        };
        const entry = registry.entries?.['agent-browser'];
        assert.ok(entry, 'agent-browser missing from the skill registry');
        assert.equal(entry?.runtime_trigger, 'agent-browser');
        assert.equal(entry?.owner_runtime, 'host-agent');
        assert.equal(entry?.execution?.mode, 'agent-native');
        assert.equal(entry?.execution?.ownership_model, 'host-workflow');
        assert.equal(entry?.execution?.allow_kernel_fallback, undefined);
        assert.equal(entry?.entrypoint_path, '/home/morderith/Corvus/agent-browser/bin/agent-browser-linux-x64');
    });

    runBrowserIntegration('runs the real browser checks only when explicitly enabled', () => {
        assert.ok(INTEGRATION_BINARY_PATH, 'Set CSTAR_AGENT_BROWSER_BINARY_PATH to run the integration path.');

        const versionOutput = execFileSync(INTEGRATION_BINARY_PATH, ['--version'], {
            cwd: PROJECT_ROOT,
            encoding: 'utf8',
        });
        assert.ok(versionOutput.includes('agent-browser 0.24.1'), `Unexpected version: ${versionOutput}`);

        execFileSync(INTEGRATION_BINARY_PATH, ['open', 'https://example.com'], {
            cwd: PROJECT_ROOT,
            encoding: 'utf8',
        });
        const snapshotOutput = execFileSync(INTEGRATION_BINARY_PATH, ['snapshot', '-i'], {
            cwd: PROJECT_ROOT,
            encoding: 'utf8',
        });
        assert.ok(snapshotOutput.includes('Example Domain'), 'Snapshot did not contain expected heading');
        assert.ok(snapshotOutput.includes('ref=e1'), 'Snapshot did not contain element reference');
    });
});
