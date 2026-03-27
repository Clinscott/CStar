import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveOneMindDecision } from '../../src/core/one_mind_bridge.js';

describe('Unified One Mind bridge policy', () => {
    it('routes primary interactive-host requests through direct host transport when no broker is available', () => {
        const decision = resolveOneMindDecision(
            {
                prompt: 'Explain the bridge.',
                transport_mode: 'auto',
                caller: { source: 'pennyone:intel:batch-intent' },
                metadata: {},
            },
            { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
        );

        assert.equal(decision.boundary, 'primary');
        assert.equal(decision.transportMode, 'host_session');
        assert.equal(decision.reason, 'interactive-host-session-direct');
    });

    it('routes primary interactive-host requests through the session bus when an explicit broker is active', () => {
        const decision = resolveOneMindDecision(
            {
                prompt: 'Explain the bridge.',
                transport_mode: 'auto',
                caller: { source: 'pennyone:intel:batch-intent' },
                metadata: {},
            },
            { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
            { brokerActive: true },
        );

        assert.equal(decision.boundary, 'primary');
        assert.equal(decision.transportMode, 'synapse_db');
        assert.equal(decision.reason, 'interactive-host-session-bus');
    });

    it('routes delegated subagent requests away from the primary host', () => {
        const decision = resolveOneMindDecision(
            {
                prompt: 'Implement the bead.',
                transport_mode: 'auto',
                caller: { source: 'runtime:host-worker' },
                metadata: {},
            },
            { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
        );

        assert.equal(decision.boundary, 'subagent');
        assert.equal(decision.transportMode, 'synapse_db');
        assert.equal(decision.reason, 'delegated-subagent-boundary');
    });

    it('routes delegated autobot requests away from the primary host', () => {
        const decision = resolveOneMindDecision(
            {
                prompt: 'Execute bead.',
                transport_mode: 'auto',
                caller: { source: 'runtime:autobot' },
                metadata: { one_mind_boundary: 'autobot' },
            },
            { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
        );

        assert.equal(decision.boundary, 'autobot');
        assert.equal(decision.transportMode, 'synapse_db');
        assert.equal(decision.reason, 'delegated-autobot-boundary');
    });

    it('respects explicit transport overrides', () => {
        const decision = resolveOneMindDecision(
            {
                prompt: 'Explain the bridge.',
                transport_mode: 'host_session',
                caller: { source: 'test-suite' },
                metadata: {},
            },
            { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
        );

        assert.equal(decision.transportMode, 'host_session');
        assert.equal(decision.reason, 'explicit-host-session');
    });
});
