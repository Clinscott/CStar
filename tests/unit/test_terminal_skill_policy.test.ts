import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    classifyTerminalSkill,
    collectTerminalSkillPolicyViolations,
    hasTerminalEntrypoint,
} from '../../src/node/core/runtime/terminal_skill_policy.js';

describe('terminal skill policy', () => {
    it('detects script-backed skills that lack an explicit terminal contract', () => {
        const violations = collectTerminalSkillPolicyViolations({
            chant: {
                entry_surface: 'host-only',
                entrypoint_path: null,
                execution: { mode: 'agent-native' },
            },
            legacy_tool: {
                entry_surface: 'cli',
                entrypoint_path: '.agents/skills/legacy_tool/scripts/legacy_tool.py',
                execution: { mode: 'agent-native' },
            },
            terminal_required_tool: {
                entry_surface: 'cli',
                entrypoint_path: '.agents/skills/terminal_required_tool/scripts/tool.py',
                execution: {
                    mode: 'kernel-backed',
                    requires_terminal: true,
                },
            },
        });

        assert.deepEqual(violations, [
            {
                skill_id: 'legacy_tool',
                reason: 'Skill declares a terminal/script entrypoint without an explicit terminal-required contract.',
                entrypoint_path: '.agents/skills/legacy_tool/scripts/legacy_tool.py',
                entry_surface: 'cli',
            },
        ]);
    });

    it('treats SKILL.md-only capabilities as harness-native', () => {
        assert.equal(hasTerminalEntrypoint({
            entry_surface: 'host-only',
            entrypoint_path: null,
            execution: { mode: 'agent-native' },
        }), false);
    });

    it('classifies script entrypoints as compatibility-only by default', () => {
        assert.equal(classifyTerminalSkill({
            entry_surface: 'cli',
            entrypoint_path: '.agents/skills/legacy/scripts/legacy.py',
            execution: { mode: 'agent-native' },
        }), 'compatibility-only');
    });

    it('requires an explicit terminal contract for terminal-required classification', () => {
        assert.equal(classifyTerminalSkill({
            entry_surface: 'cli',
            entrypoint_path: '.agents/skills/tool/scripts/tool.py',
            execution: {
                mode: 'kernel-backed',
                terminal_contract: 'required',
            },
        }), 'terminal-required');
    });
});
