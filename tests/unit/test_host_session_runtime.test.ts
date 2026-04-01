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
    getCapabilityKernelFallbackPolicy,
    getCapabilityOwnershipModel,
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
                            ownership_model: 'host-workflow',
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
                            ownership_model: 'host-workflow',
                        },
                        host_support: {
                            gemini: 'policy-only',
                            codex: 'policy-only',
                            claude: 'policy-only',
                        },
                    },
                    chant: {
                        runtime_trigger: 'chant',
                        execution: {
                            mode: 'agent-native',
                            adapter_id: 'weave:chant',
                            allow_kernel_fallback: false,
                            ownership_model: 'host-workflow',
                        },
                        host_support: {
                            gemini: 'native-session',
                            codex: 'exec-bridge',
                            claude: 'exec-bridge',
                        },
                    },
                    ravens: {
                        runtime_trigger: 'ravens',
                        execution: {
                            mode: 'agent-native',
                            allow_kernel_fallback: false,
                            ownership_model: 'host-workflow',
                        },
                        host_support: {
                            gemini: 'native-session',
                            codex: 'exec-bridge',
                            claude: 'exec-bridge',
                        },
                    },
                    start: {
                        runtime_trigger: 'start',
                        execution: {
                            mode: 'agent-native',
                            allow_kernel_fallback: false,
                            ownership_model: 'host-workflow',
                        },
                        host_support: {
                            gemini: 'native-session',
                            codex: 'exec-bridge',
                            claude: 'exec-bridge',
                        },
                    },
                    research: {
                        runtime_trigger: 'research',
                        execution: {
                            mode: 'agent-native',
                            allow_kernel_fallback: false,
                            ownership_model: 'host-workflow',
                        },
                        host_support: {
                            gemini: 'native-session',
                            codex: 'exec-bridge',
                            claude: 'exec-bridge',
                        },
                    },
                    critique: {
                        runtime_trigger: 'critique',
                        execution: {
                            mode: 'agent-native',
                            allow_kernel_fallback: false,
                            ownership_model: 'host-workflow',
                        },
                        host_support: {
                            gemini: 'native-session',
                            codex: 'exec-bridge',
                            claude: 'exec-bridge',
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
        assert.equal(getCapabilityOwnershipModel(tmpRoot, 'hall'), 'host-workflow');
        assert.equal(getCapabilityOwnershipModel(tmpRoot, 'critique'), 'host-workflow');
        assert.equal(getCapabilityExecutionMode(tmpRoot, 'weave:chant'), 'agent-native');
        assert.equal(getCapabilityOwnershipModel(tmpRoot, 'weave:chant'), 'host-workflow');
        assert.equal(getCapabilityKernelFallbackPolicy(tmpRoot, 'weave:chant'), 'forbidden');
        assert.equal(getCapabilityKernelFallbackPolicy(tmpRoot, 'chant'), 'forbidden');
        assert.equal(getCapabilityKernelFallbackPolicy(tmpRoot, 'ravens'), 'forbidden');
        assert.equal(getCapabilityKernelFallbackPolicy(tmpRoot, 'start'), 'forbidden');
        assert.equal(getCapabilityKernelFallbackPolicy(tmpRoot, 'research'), 'forbidden');
        assert.equal(getCapabilityKernelFallbackPolicy(tmpRoot, 'critique'), 'forbidden');
        assert.equal(getCapabilityKernelFallbackPolicy(tmpRoot, 'hall'), 'allowed');
        assert.equal(isHostSupportStatusAllowed(getCapabilityHostSupport(tmpRoot, 'hall', 'codex')), true);
        assert.equal(isHostSupportStatusAllowed(getCapabilityHostSupport(tmpRoot, 'silver_shield', 'codex')), false);
    });

    it('defaults ownership by execution mode when the registry omits an explicit model', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-host-ownership-defaults-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'skill_registry.json'),
            JSON.stringify({
                entries: {
                    autobot: {
                        runtime_trigger: 'autobot',
                        execution: {
                            mode: 'kernel-backed',
                        },
                    },
                    hall: {
                        runtime_trigger: 'hall',
                        execution: {
                            mode: 'agent-native',
                        },
                    },
                },
            }),
            'utf-8',
        );

        assert.equal(getCapabilityOwnershipModel(tmpRoot, 'autobot'), 'kernel-primitive');
        assert.equal(getCapabilityOwnershipModel(tmpRoot, 'hall'), 'host-workflow');
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
