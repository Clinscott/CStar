import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    buildHostNativeSkillPrompt,
    explainCapabilityHostSupport,
    getCapabilityExecutionMode,
    getCapabilityHostSupport,
    isHostSupportStatusAllowed,
} from '../../src/core/host_session.js';

describe('Host session runtime support metadata', () => {
    it('reads host support status from the authoritative skill registry', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-host-support-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'skill_registry.json'),
            JSON.stringify({
                entries: {
                    hall: {
                        runtime_trigger: 'hall',
                        execution: {
                            mode: 'agent-native',
                        },
                        host_support: {
                            gemini: 'native-session',
                            codex: 'exec-bridge',
                            claude: 'exec-bridge',
                        },
                    },
                    silver_shield: {
                        runtime_trigger: 'silver_shield',
                        execution: {
                            mode: 'policy-only',
                        },
                        host_support: {
                            gemini: 'policy-only',
                            codex: 'policy-only',
                            claude: 'policy-only',
                        },
                    },
                },
            }),
            'utf-8',
        );

        assert.equal(getCapabilityHostSupport(tmpRoot, 'hall', 'codex'), 'exec-bridge');
        assert.equal(getCapabilityHostSupport(tmpRoot, 'silver_shield', 'codex'), 'policy-only');
        assert.equal(getCapabilityExecutionMode(tmpRoot, 'hall'), 'agent-native');
        assert.equal(getCapabilityExecutionMode(tmpRoot, 'silver_shield'), 'policy-only');
        assert.equal(isHostSupportStatusAllowed(getCapabilityHostSupport(tmpRoot, 'hall', 'codex')), true);
        assert.equal(isHostSupportStatusAllowed(getCapabilityHostSupport(tmpRoot, 'silver_shield', 'codex')), false);
    });

    it('explains unsupported capabilities with registry-backed wording', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-host-support-message-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'skill_registry.json'),
            JSON.stringify({
                entries: {
                    oracle: {
                        runtime_trigger: 'oracle',
                        host_support: {
                            gemini: 'supported',
                            codex: 'unsupported',
                            claude: 'exec-bridge',
                        },
                    },
                },
            }),
            'utf-8',
        );

        assert.match(
            explainCapabilityHostSupport(tmpRoot, 'oracle', 'codex') ?? '',
            /marked unsupported on codex/i,
        );
        assert.equal(explainCapabilityHostSupport(tmpRoot, 'oracle', 'gemini'), null);
    });

    it('builds a host-native skill prompt that explicitly forbids runtime re-entry', () => {
        const prompt = buildHostNativeSkillPrompt({
            skill_id: 'hall',
            intent: 'find the host bridge state',
            project_root: '/tmp/corvus-host-support-message-',
            target_paths: ['src/core/host_session.ts'],
            payload: { query: 'host bridge state' },
        });

        assert.match(prompt, /\[CORVUS_SKILL_ACTIVATION\]/);
        assert.match(prompt, /Do not invoke `cstar`, `node`, or a runtime dispatcher/i);
        assert.match(prompt, /Focus targets: src\/core\/host_session\.ts/);
    });
});
