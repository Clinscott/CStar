import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Runtime recovery authority boundary', () => {
    it('keeps host recovery advice non-executing', () => {
        const source = fs.readFileSync(
            path.join(import.meta.dirname, '..', '..', 'src', 'node', 'core', 'runtime', 'dispatcher.ts'),
            'utf-8',
        );
        const section = source.slice(
            source.indexOf('private async tryRecoverKernelFailure'),
            source.indexOf('private async tryExecuteSkillBeadViaHostSession'),
        );

        assert.match(section, /execution_attempted:\s*false/);
        assert.match(section, /operator_action_required/);
        assert.doesNotMatch(section, /adapter\.execute\(|auto_execute:\s*true|weave_id:\s*'weave:host-governor'/);
    });

    it('labels the model recovery prompt as advisory', () => {
        const source = fs.readFileSync(
            path.join(import.meta.dirname, '..', '..', 'src', 'node', 'core', 'runtime', 'dispatcher.ts'),
            'utf-8',
        );
        const promptSection = source.slice(
            source.indexOf('function buildKernelRecoveryPrompt'),
            source.indexOf('export class RuntimeDispatcher'),
        );

        assert.match(promptSection, /This is advisory/);
        assert.match(promptSection, /operator must authorize/i);
    });

    it('keeps retired root and TUI routing commands non-mutating', () => {
        const rootSource = fs.readFileSync(
            path.join(import.meta.dirname, '..', '..', 'cstar.ts'),
            'utf-8',
        );
        const retiredSection = rootSource.slice(
            rootSource.indexOf("for (const [command, description, successor]"),
            rootSource.indexOf(".command('status')"),
        );
        const tuiSource = fs.readFileSync(
            path.join(import.meta.dirname, '..', '..', 'src', 'node', 'core', 'tui', 'operator_tui.ts'),
            'utf-8',
        );

        assert.match(retiredSection, /CSTAR_LEGACY_COMMAND_DECOMMISSIONED/);
        assert.doesNotMatch(retiredSection, /\.dispatch\(|postToBlackboard|StateRegistry\.save/);
        assert.doesNotMatch(tuiSource, /StateRegistry\.postToBlackboard|StateRegistry\.save/);
    });
});
