import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    bindSharedHostSessionInvoker,
    clearAuguryPromptHistory,
    clearSharedHostSessionInvoker,
    requestHostText,
} from  '../../src/core/host_intelligence.js';

describe('Host intelligence bridge (CS-P1-02)', () => {
    afterEach(() => {
        clearAuguryPromptHistory();
    });

    it('threads an explicitly bound hostSessionInvoker into the shared Mimir bridge', async () => {
        let capturedOptions: Record<string, unknown> | undefined;
        const boundInvoker = async () => 'Bound host session response';

        const restore = bindSharedHostSessionInvoker(boundInvoker);
        try {
            const result = await requestHostText(
                {
                    prompt: 'Explain the bound host bridge.',
                    projectRoot: '/tmp/corvus-host-intelligence',
                    source: 'test-suite',
                    env: { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
                },
                {
                    clientFactory: (options) => {
                        capturedOptions = options as Record<string, unknown>;
                        return {
                            request: async () => ({
                                status: 'success',
                                raw_text: 'Bound bridge response.',
                                trace: {
                                    correlation_id: 'host-intelligence-bound-test',
                                    transport_mode: 'host_session',
                                    cached: false,
                                },
                            }),
                        };
                    },
                },
            );

            assert.equal(result.provider, 'codex');
            assert.equal(result.text, 'Bound bridge response.');
            assert.equal(capturedOptions?.hostSessionInvoker, boundInvoker);
        } finally {
            restore();
            clearSharedHostSessionInvoker();
        }
    });

    it('defaults to auto transport through the shared Mimir bridge', async () => {
        let capturedRequest: Record<string, unknown> | undefined;

        const result = await requestHostText(
            {
                prompt: 'Explain the host bridge.',
                systemPrompt: 'Respond in one sentence.',
                projectRoot: '/tmp/corvus-host-intelligence',
                source: 'test-suite',
                env: { CORVUS_HOST_PROVIDER: 'claude' },
            },
            {
                clientFactory: () => ({
                    request: async (request) => {
                        capturedRequest = request as Record<string, unknown>;
                        return {
                            status: 'success',
                            raw_text: '  Shared bridge response.  ',
                            trace: {
                                correlation_id: 'host-intelligence-test',
                                transport_mode: 'host_session',
                                cached: false,
                            },
                        };
                    },
                }),
            },
        );

        assert.equal(result.provider, 'claude');
        assert.equal(result.text, 'Shared bridge response.');
        assert.equal(capturedRequest?.transport_mode, 'host_session');
        assert.match(String(capturedRequest?.system_prompt ?? ''), /^Respond in one sentence\./);
    });

    it('injects Augury steering into host text system prompts when metadata carries the contract', async () => {
        let capturedRequest: Record<string, unknown> | undefined;

        const result = await requestHostText(
            {
                prompt: 'Choose the next inference path.',
                systemPrompt: 'Return JSON only.',
                projectRoot: '/tmp/corvus-host-intelligence',
                source: 'test-suite',
                env: { CORVUS_HOST_PROVIDER: 'codex' },
                metadata: {
                    augury_contract: {
                        intent_category: 'BUILD',
                        intent: 'Implement Fallows Hallow RPG combat engine code.',
                        selection_tier: 'SKILL',
                        selection_name: 'hall',
                        mimirs_well: ['FallowsHallow-RPG/src/combat/engine.ts'],
                        gungnir_verdict: 'Proceed after retrieving engine context.',
                        confidence: 0.88,
                        council_expert: {
                            id: 'carmack',
                            label: 'CARMACK',
                            protocol: 'Performance, simplicity, measurement, and mechanical-sympathy critique.',
                            lens: 'Attack unnecessary layers and hot-path waste.',
                            root_persona_directive: 'Adapt the root persona into a performance pragmatist.',
                            anti_behavior: ['Do not add layers when a direct mechanism is clear.'],
                        },
                    },
                },
            },
            {
                clientFactory: () => ({
                    request: async (request) => {
                        capturedRequest = request as Record<string, unknown>;
                        return {
                            status: 'success',
                            raw_text: 'Augury-guided response.',
                            trace: {
                                correlation_id: 'host-intelligence-augury-test',
                                transport_mode: 'host_session',
                                cached: false,
                            },
                        };
                    },
                }),
            },
        );

        const systemPrompt = String(capturedRequest?.system_prompt ?? '');
        assert.equal(result.provider, 'codex');
        assert.equal(result.text, 'Augury-guided response.');
        assert.match(systemPrompt, /^\[CORVUS_STAR_AUGURY\]/);
        assert.match(systemPrompt, /Mode: full/);
        assert.match(systemPrompt, /Route: BUILD -> SKILL: hall/);
        assert.match(systemPrompt, /Council Expert: CARMACK/);
        assert.match(systemPrompt, /Mimir's Well: FallowsHallow-RPG\/src\/combat\/engine\.ts/);
        assert.match(systemPrompt, /Directive: Use this as routing context only/i);
        assert.doesNotMatch(systemPrompt, /Confidence:/);
        assert.doesNotMatch(systemPrompt, /Root Persona Overlay:/);
        assert.match(systemPrompt, /Return JSON only\./);
        const learningMetadata = (capturedRequest?.metadata as Record<string, any>)?.augury_learning_metadata;
        assert.equal(learningMetadata.schema_version, 1);
        assert.equal(learningMetadata.steering_block_version, 2);
        assert.equal(learningMetadata.steering_mode, 'full');
        assert.equal(learningMetadata.corvus_standard_version, 1);
        assert.equal(learningMetadata.optimizer_ready, true);
        assert.equal(learningMetadata.optimizer_family, 'GEPA_DSPY');
        assert.equal(typeof learningMetadata.contract_hash, 'string');
        assert.equal(learningMetadata.contract_hash.length, 64);
        assert.equal(learningMetadata.confidence, 0.88);
        assert.equal(learningMetadata.confidence_source, 'explicit');
        assert.equal(learningMetadata.route, 'BUILD -> SKILL: hall');
        assert.equal(learningMetadata.expert_id, 'carmack');
        assert.equal(learningMetadata.expert_label, 'CARMACK');
        assert.equal(learningMetadata.mimirs_well_count, 1);
        assert.equal(learningMetadata.mimirs_well_omitted_count, 0);
        assert.equal(learningMetadata.session_id, null);
        assert.equal(learningMetadata.designation_source, null);
        assert.equal(learningMetadata.prompt_surface, 'test-suite');
        assert.equal(learningMetadata.provider, 'codex');
        assert.equal(learningMetadata.target_domain, null);
        assert.equal(learningMetadata.spoke_name, null);
        assert.equal(typeof learningMetadata.prompt_token_estimate, 'number');
    });

    it('uses full Augury once per prompt key, then switches subsequent calls to lite', async () => {
        const capturedRequests: Array<Record<string, unknown>> = [];
        const auguryContract = {
            intent_category: 'BUILD',
            intent: 'Implement Fallows Hallow RPG combat engine code.',
            selection_tier: 'SKILL',
            selection_name: 'hall',
            mimirs_well: ['FallowsHallow-RPG/src/combat/engine.ts'],
            gungnir_verdict: 'Proceed after retrieving engine context.',
            council_expert: {
                id: 'carmack',
                label: 'CARMACK',
                lens: 'Attack unnecessary layers and hot-path waste.',
                anti_behavior: ['Do not add layers when a direct mechanism is clear.'],
            },
        };
        const request = {
            prompt: 'Choose the next inference path.',
            systemPrompt: 'Return JSON only.',
            projectRoot: '/tmp/corvus-host-intelligence',
            source: 'test-suite',
            env: { CORVUS_HOST_PROVIDER: 'codex' },
            metadata: {
                planning_session_id: 'chant-session:FULL-LITE',
                augury_contract: auguryContract,
            },
        };
        const dependencies = {
            clientFactory: () => ({
                request: async (request: unknown) => {
                    capturedRequests.push(request as Record<string, unknown>);
                    return {
                        status: 'success' as const,
                        raw_text: 'Augury response.',
                        trace: {
                            correlation_id: 'host-intelligence-augury-lite-test',
                            transport_mode: 'host_session',
                            cached: false,
                        },
                    };
                },
            }),
        };

        await requestHostText(request, dependencies);
        await requestHostText(request, dependencies);

        assert.equal(capturedRequests.length, 2);
        const firstSystemPrompt = String(capturedRequests[0].system_prompt ?? '');
        const secondSystemPrompt = String(capturedRequests[1].system_prompt ?? '');
        assert.match(firstSystemPrompt, /Mode: full/);
        assert.match(firstSystemPrompt, /Corvus Standard:/);
        assert.match(firstSystemPrompt, /Code Standard:/);
        assert.match(firstSystemPrompt, /Council Lens:/);
        assert.match(firstSystemPrompt, /Guardrails:/);
        assert.match(secondSystemPrompt, /Mode: lite/);
        assert.match(secondSystemPrompt, /Route: BUILD -> SKILL: hall/);
        assert.match(secondSystemPrompt, /Mimir's Well: FallowsHallow-RPG\/src\/combat\/engine\.ts/);
        assert.match(secondSystemPrompt, /Council Expert: CARMACK/);
        assert.doesNotMatch(secondSystemPrompt, /Corvus Standard:/);
        assert.doesNotMatch(secondSystemPrompt, /Code Standard:/);
        assert.doesNotMatch(secondSystemPrompt, /Council Lens:/);
        assert.doesNotMatch(secondSystemPrompt, /Guardrails:/);
        assert.equal((capturedRequests[0].metadata as Record<string, any>).augury_steering_mode, 'full');
        assert.equal((capturedRequests[1].metadata as Record<string, any>).augury_steering_mode, 'lite');
        assert.equal((capturedRequests[0].metadata as Record<string, any>).augury_learning_metadata.steering_mode, 'full');
        assert.equal((capturedRequests[1].metadata as Record<string, any>).augury_learning_metadata.steering_mode, 'lite');
        assert.equal(
            (capturedRequests[0].metadata as Record<string, any>).augury_prompt_key,
            (capturedRequests[1].metadata as Record<string, any>).augury_prompt_key,
        );
    });

    it('bounds Augury prompt history so old keys can receive a fresh full block', async () => {
        const capturedModes: string[] = [];
        const auguryContract = {
            intent_category: 'BUILD',
            intent: 'Test bounded prompt key cache.',
            selection_tier: 'SKILL',
            selection_name: 'hall',
            mimirs_well: ['src/core/host_intelligence.ts'],
        };
        const dependencies = {
            clientFactory: () => ({
                request: async (request: unknown) => {
                    capturedModes.push(String((request as Record<string, any>).metadata?.augury_steering_mode ?? ''));
                    return {
                        status: 'success' as const,
                        raw_text: 'Augury response.',
                        trace: {
                            correlation_id: 'host-intelligence-augury-cache-test',
                            transport_mode: 'host_session',
                            cached: false,
                        },
                    };
                },
            }),
        };

        for (const planningSessionId of ['chant-session:A', 'chant-session:B', 'chant-session:C', 'chant-session:A']) {
            await requestHostText({
                prompt: 'Choose the next inference path.',
                projectRoot: '/tmp/corvus-host-intelligence-cache',
                source: 'test-suite',
                env: {
                    CORVUS_HOST_PROVIDER: 'codex',
                    CSTAR_AUGURY_PROMPT_HISTORY_LIMIT: '2',
                    CSTAR_AUGURY_LEARNING_DISABLED: '1',
                },
                metadata: {
                    planning_session_id: planningSessionId,
                    augury_contract: auguryContract,
                },
            }, dependencies);
        }

        assert.deepEqual(capturedModes, ['full', 'full', 'full', 'full']);
    });

    it('persists Augury learning events as compact JSONL rows', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-augury-ledger-'));
        const ledgerPath = path.join(tmpRoot, '.agents', 'state', 'augury-learning.jsonl');
        const auguryContract = {
            intent_category: 'BUILD',
            intent: 'Persist Augury learning metadata.',
            selection_tier: 'SKILL',
            selection_name: 'hall',
            mimirs_well: ['src/core/host_intelligence.ts'],
            confidence: 0.82,
            council_expert: {
                id: 'shannon',
                label: 'SHANNON',
            },
        };

        await requestHostText(
            {
                prompt: 'Choose the next inference path.',
                projectRoot: tmpRoot,
                source: 'test-suite',
                env: {
                    CORVUS_HOST_PROVIDER: 'codex',
                    CSTAR_AUGURY_LEARNING_LEDGER: ledgerPath,
                },
                metadata: {
                    planning_session_id: 'chant-session:LEDGER',
                    augury_contract: auguryContract,
                },
            },
            {
                clientFactory: () => ({
                    request: async () => ({
                        status: 'success',
                        raw_text: 'Ledger response.',
                        trace: {
                            correlation_id: 'host-intelligence-augury-ledger-test',
                            transport_mode: 'host_session',
                            cached: false,
                        },
                    }),
                }),
            },
        );

        const rows = fs.readFileSync(ledgerPath, 'utf-8').trim().split('\n').map((row) => JSON.parse(row));
        assert.equal(rows.length, 1);
        assert.equal(rows[0].event_type, 'host_prompt');
        assert.equal(rows[0].steering_mode, 'full');
        assert.equal(rows[0].result_status, 'success');
        assert.equal(rows[0].planning_session_id, 'chant-session:LEDGER');
        assert.equal(rows[0].expert_id, 'shannon');
        assert.equal(rows[0].expert_label, 'SHANNON');
        assert.equal(rows[0].mimirs_well_count, 1);
        assert.equal(rows[0].confidence, 0.82);
        assert.equal(typeof rows[0].contract_hash, 'string');
        assert.equal(rows[0].contract_hash.length, 64);
        assert.equal(typeof rows[0].recorded_at, 'string');
    });

    it('fails closed when no host session is active', async () => {
        await assert.rejects(
            requestHostText({
                prompt: 'Explain the host bridge.',
                projectRoot: '/tmp/corvus-host-intelligence',
                source: 'test-suite',
                env: {},
            }),
            /Host Agent session inactive/i,
        );
    });

    it('leaves transport resolution to Mimir in an interactive Codex session when no broker is configured', async () => {
        let capturedRequest: Record<string, unknown> | undefined;

        const result = await requestHostText(
            {
                prompt: 'Explain the host bridge.',
                projectRoot: '/tmp/corvus-host-intelligence',
                source: 'test-suite',
                env: { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
            },
            {
                clientFactory: () => ({
                    request: async (request) => {
                        capturedRequest = request as Record<string, unknown>;
                        return {
                            status: 'success',
                            raw_text: 'Synapse-backed response.',
                            trace: {
                                correlation_id: 'host-intelligence-codex-test',
                                transport_mode: 'host_session',
                                cached: false,
                            },
                        };
                    },
                }),
            },
        );

        assert.equal(result.provider, 'codex');
        assert.equal(result.text, 'Synapse-backed response.');
        assert.equal(capturedRequest?.transport_mode, 'host_session');
    });

    it('leaves broker-aware transport resolution to Mimir when an interactive broker is explicitly configured', async () => {
        let capturedRequest: Record<string, unknown> | undefined;

        const result = await requestHostText(
            {
                prompt: 'Explain the host bridge.',
                projectRoot: '/tmp/corvus-host-intelligence',
                source: 'test-suite',
                env: { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1', CORVUS_ONE_MIND_BROKER_ACTIVE: '1' },
            },
            {
                clientFactory: () => ({
                    request: async (request) => {
                        capturedRequest = request as Record<string, unknown>;
                        return {
                            status: 'success',
                            raw_text: 'Broker-backed response.',
                            trace: {
                                correlation_id: 'host-intelligence-codex-broker-test',
                                transport_mode: 'synapse_db',
                                cached: false,
                            },
                        };
                    },
                }),
            },
        );

        assert.equal(result.provider, 'codex');
        assert.equal(result.text, 'Broker-backed response.');
        assert.equal(capturedRequest?.transport_mode, 'host_session');
    });

    it('honors an explicit transport override when provided', async () => {
        let capturedRequest: Record<string, unknown> | undefined;

        const result = await requestHostText(
            {
                prompt: 'Explain the host bridge.',
                projectRoot: '/tmp/corvus-host-intelligence',
                source: 'test-suite',
                env: { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
                metadata: { transport_mode: 'synapse_db' },
            },
            {
                clientFactory: () => ({
                    request: async (request) => {
                        capturedRequest = request as Record<string, unknown>;
                        return {
                            status: 'success',
                            raw_text: 'Explicit transport response.',
                            trace: {
                                correlation_id: 'host-intelligence-codex-explicit-test',
                                transport_mode: 'synapse_db',
                                cached: false,
                            },
                        };
                    },
                }),
            },
        );

        assert.equal(result.provider, 'codex');
        assert.equal(result.text, 'Explicit transport response.');
        assert.equal(capturedRequest?.transport_mode, 'synapse_db');
    });
});
