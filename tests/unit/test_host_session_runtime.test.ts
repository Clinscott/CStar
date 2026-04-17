import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    buildAuguryLearningMetadata,
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

    it('injects Augury routing, council overlay, and Mimir targets into host-native skill prompts', () => {
        const prompt = buildHostNativeSkillPrompt({
            skill_id: 'hall',
            intent: 'find the RPG engine state',
            project_root: '/tmp/corvus-host-support-message-',
            target_paths: ['FallowsHallowRPG/src/engine.ts'],
            target_domain: 'spoke',
            spoke_name: 'FallowsHallow-RPG',
            requested_root: '/home/morderith/Corvus/FallowsHallow-RPG',
            payload: { query: 'rpg engine state' },
            augury_contract: {
                intent_category: 'BUILD',
                intent: 'Implement RPG engine code.',
                selection_tier: 'SKILL',
                selection_name: 'hall',
                trajectory_status: 'STABLE',
                trajectory_reason: 'Need engine context before edits.',
                mimirs_well: [
                    'FallowsHallowRPG/src/engine.ts',
                    'FallowsHallowRPG/src/render-loop.ts',
                    'FallowsHallowRPG/src/physics.ts',
                    'FallowsHallowRPG/src/audio.ts',
                ],
                confidence: 0.91,
                council_expert: {
                    id: 'carmack',
                    label: 'CARMACK',
                    protocol: 'Performance, simplicity, measurement, and mechanical-sympathy critique.',
                    lens: 'Attack unnecessary layers and hot-path waste.',
                    root_persona_directive: 'Adapt the root persona into a performance pragmatist.',
                    anti_behavior: ['Do not add layers when a direct mechanism is clear.'],
                },
            },
        });

        assert.match(prompt, /\[CORVUS_STAR_AUGURY\]/);
        assert.match(prompt, /Mode: full/);
        assert.match(prompt, /Route: BUILD -> SKILL: hall/);
        assert.match(prompt, /Scope: spoke:FallowsHallow-RPG/);
        assert.match(prompt, /Corvus Standard: CStar is the engine; spokes are managed extensions; keep work Hall\/Mimir traceable\./);
        assert.match(prompt, /Code Standard: scoped changes; preserve unrelated work; verify focused behavior; leave no known broken surface\./);
        assert.match(prompt, /Council Expert: CARMACK/);
        assert.match(prompt, /Council Lens: Attack unnecessary layers and hot-path waste\./);
        assert.match(prompt, /Guardrails: Do not add layers when a direct mechanism is clear\./);
        assert.match(prompt, /Mimir's Well: FallowsHallowRPG\/src\/engine\.ts/);
        assert.match(prompt, /FallowsHallowRPG\/src\/render-loop\.ts/);
        assert.match(prompt, /FallowsHallowRPG\/src\/physics\.ts/);
        assert.doesNotMatch(prompt, /FallowsHallowRPG\/src\/audio\.ts/);
        assert.match(prompt, /Directive: Use this as routing context only/i);
        assert.doesNotMatch(prompt, /Confidence:/);
        assert.doesNotMatch(prompt, /Root Persona Overlay:/);
    });

    it('can render a lite Augury block for repeated host-native skill prompts', () => {
        const prompt = buildHostNativeSkillPrompt({
            skill_id: 'hall',
            intent: 'find the RPG engine state',
            project_root: '/tmp/corvus-host-support-message-',
            target_paths: ['FallowsHallowRPG/src/engine.ts'],
            target_domain: 'spoke',
            spoke_name: 'FallowsHallow-RPG',
            requested_root: '/home/morderith/Corvus/FallowsHallow-RPG',
            payload: { query: 'rpg engine state' },
            augury_mode: 'lite',
            augury_contract: {
                intent_category: 'BUILD',
                intent: 'Implement RPG engine code.',
                selection_tier: 'SKILL',
                selection_name: 'hall',
                mimirs_well: ['FallowsHallowRPG/src/engine.ts'],
                council_expert: {
                    id: 'carmack',
                    label: 'CARMACK',
                    protocol: 'Performance, simplicity, measurement, and mechanical-sympathy critique.',
                    lens: 'Attack unnecessary layers and hot-path waste.',
                    anti_behavior: ['Do not add layers when a direct mechanism is clear.'],
                },
            },
        });

        assert.match(prompt, /\[CORVUS_STAR_AUGURY\]/);
        assert.match(prompt, /Mode: lite/);
        assert.match(prompt, /Route: BUILD -> SKILL: hall/);
        assert.match(prompt, /Scope: spoke:FallowsHallow-RPG/);
        assert.match(prompt, /Intent: Implement RPG engine code\./);
        assert.match(prompt, /Mimir's Well: FallowsHallowRPG\/src\/engine\.ts/);
        assert.match(prompt, /Council Expert: CARMACK/);
        assert.match(prompt, /Directive: Route only\. Consult targets before choosing a path\. Do not echo\./);
        assert.doesNotMatch(prompt, /Corvus Standard:/);
        assert.doesNotMatch(prompt, /Code Standard:/);
        assert.doesNotMatch(prompt, /Council Lens:/);
        assert.doesNotMatch(prompt, /Guardrails:/);
        assert.doesNotMatch(prompt, /Confidence:/);
    });

    it('grounds foundational Augury work in brain:CStar instead of a spoke', () => {
        const prompt = buildHostNativeSkillPrompt({
            skill_id: 'hall',
            intent: 'inspect Corvus Star Augury',
            project_root: '/home/morderith/Corvus/CStar',
            target_paths: ['src/core/host_session.ts'],
            payload: { query: 'Corvus Star Augury' },
            augury_contract: {
                intent_category: 'OBSERVE',
                intent: 'Inspect Corvus Star Augury usefulness.',
                selection_tier: 'SKILL',
                selection_name: 'hall',
                mimirs_well: ['src/core/host_session.ts'],
                council_expert: {
                    id: 'shannon',
                    label: 'SHANNON',
                    protocol: 'Signal, information-flow, observability, and ambiguity critique.',
                    lens: 'Attack noisy signals and ambiguous encodings.',
                    root_persona_directive: 'Adapt the root persona into an information theorist.',
                    anti_behavior: ['Do not collapse distinct states into one status.'],
                },
            },
        });

        assert.match(prompt, /Scope: brain:CStar/);
        assert.doesNotMatch(prompt, /Scope: spoke:/);
        assert.match(prompt, /Review Standard: findings first; cite files; call out regressions, risks, and missing tests\./);
    });

    it('keeps full Augury consult counts in learning metadata while capping prompt targets', () => {
        const metadata = buildAuguryLearningMetadata({
            intent_category: 'BUILD',
            selection_tier: 'SKILL',
            selection_name: 'hall',
            confidence: 0.91,
            confidence_source: 'explicit',
            mimirs_well: ['one.ts', 'two.ts', 'three.ts', 'four.ts'],
        }, {
            session_id: 'chant-session:cap',
            designation_source: 'explicit_augury_block',
        });

        assert.equal(metadata?.steering_block_version, 2);
        assert.equal(metadata?.steering_mode, 'full');
        assert.equal(metadata?.corvus_standard_version, 1);
        assert.equal(typeof metadata?.contract_hash, 'string');
        assert.equal(metadata?.confidence_source, 'explicit');
        assert.equal(metadata?.mimirs_well_count, 4);
        assert.equal(metadata?.mimirs_well_omitted_count, 1);
        assert.equal(metadata?.session_id, 'chant-session:cap');
    });

    it('stores lite steering mode in learning metadata when provided', () => {
        const metadata = buildAuguryLearningMetadata({
            intent_category: 'BUILD',
            selection_tier: 'SKILL',
            selection_name: 'hall',
            mimirs_well: ['one.ts'],
        }, {
            session_id: 'chant-session:lite',
            steering_mode: 'lite',
        });

        assert.equal(metadata?.steering_mode, 'lite');
        assert.equal(metadata?.session_id, 'chant-session:lite');
    });
});
