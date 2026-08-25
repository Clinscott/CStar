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
        assert.equal(decision.executionAllowed, true);
    });

    it('ignores historical broker activation flags and keeps primary host transport direct', () => {
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
        assert.equal(decision.transportMode, 'host_session');
        assert.equal(decision.reason, 'interactive-host-session-direct');
        assert.equal(decision.executionAllowed, true);
    });

    it('treats thread-only Codex environments as direct exec-bridge sessions, not an interactive bus', () => {
        const decision = resolveOneMindDecision(
            {
                prompt: 'Explain the bridge.',
                transport_mode: 'auto',
                caller: { source: 'pennyone:intel:batch-intent' },
                metadata: {},
            },
            { CODEX_THREAD_ID: 'thread-1' },
            { brokerActive: true },
        );

        assert.equal(decision.boundary, 'primary');
        assert.equal(decision.transportMode, 'host_session');
        assert.equal(decision.reason, 'ambient-host-session');
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
        assert.equal(decision.reason, 'retired-subagent-execution-boundary');
        assert.equal(decision.executionAllowed, false);
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
        assert.equal(decision.executionAllowed, true);
    });

    it('denies delegated execution even when it requests an explicit host transport', () => {
        const decision = resolveOneMindDecision(
            {
                prompt: 'Implement the bead.',
                transport_mode: 'host_session',
                caller: { source: 'runtime:host-worker' },
                metadata: { execution_role: 'subagent' },
            },
            { CODEX_SHELL: '1', CODEX_THREAD_ID: 'thread-1' },
        );

        assert.equal(decision.executionAllowed, false);
        assert.equal(decision.transportMode, 'synapse_db');
        assert.equal(decision.reason, 'retired-subagent-execution-boundary');
    });
});
