import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    mergeRuntimeAuguryMetadata,
    resolveInvocationTraceContract,
} from '../../src/node/core/runtime/dispatch_augury.ts';
import { inheritAuguryPayload } from '../../src/node/core/runtime/trace_inheritance.ts';
import { withRuntimeAuguryMetadata } from '../../src/node/core/runtime/weaves/host_bridge.ts';

describe('Augury unscored confidence boundary', () => {
    it('reads legacy payload contracts without promoting their confidence claim', () => {
        const resolution = resolveInvocationTraceContract({
            workspaceRoot: '/tmp/cstar-augury-confidence-boundary',
            weaveId: 'weave:evolve',
            payload: {
                augury_contract: {
                    intent_category: 'EVOLVE',
                    intent: 'Repair the runtime boundary.',
                    selection_tier: 'WEAVE',
                    selection_name: 'evolve',
                    trajectory_status: 'STABLE',
                    mimirs_well: ['src/node/core/runtime/dispatch_augury.ts'],
                    confidence: 0.99,
                    confidence_source: 'explicit',
                },
            },
            operatorMode: 'cli',
            allowObservationFallback: false,
        });

        assert.equal(resolution.contract?.confidence, undefined);
        assert.equal(resolution.contract?.confidence_source, undefined);
    });

    it('synthesizes a route without inventing confidence', () => {
        const resolution = resolveInvocationTraceContract({
            workspaceRoot: '/tmp/cstar-augury-confidence-boundary',
            weaveId: 'weave:evolve',
            payload: { action: 'propose', bead_id: 'bead:test' },
            operatorMode: 'cli',
            allowObservationFallback: false,
        });

        assert.equal(resolution.source, 'dispatcher_synthesized');
        assert.equal(resolution.contract?.confidence, undefined);
        assert.equal(resolution.contract?.confidence_source, undefined);
    });

    it('omits a legacy number from learning metadata and its contract hash', () => {
        const context = {
            operator_mode: 'cli' as const,
            target_domain: 'brain',
            workspace_root: '/tmp/cstar-augury-confidence-boundary',
            requested_root: '/tmp/cstar-augury-confidence-boundary',
            session_id: 'session:test',
        };
        const baseContract = {
            intent_category: 'EVOLVE',
            selection_tier: 'WEAVE',
            selection_name: 'evolve',
            mimirs_well: ['src/node/core/runtime/dispatch_augury.ts'],
        };
        const withoutClaim = mergeRuntimeAuguryMetadata({
            context,
            weaveId: 'weave:evolve',
            auguryContract: baseContract,
            augurySource: 'payload_augury_contract',
        });
        const withLegacyClaim = mergeRuntimeAuguryMetadata({
            context,
            weaveId: 'weave:evolve',
            auguryContract: {
                ...baseContract,
                confidence: 0.99,
                confidence_source: 'explicit',
            },
            augurySource: 'payload_augury_contract',
        });
        const baseLearning = withoutClaim?.augury_learning_metadata as Record<string, unknown>;
        const legacyLearning = withLegacyClaim?.augury_learning_metadata as Record<string, unknown>;

        assert.equal((withLegacyClaim?.augury_contract as Record<string, unknown>).confidence, undefined);
        assert.equal((withLegacyClaim?.trace_contract as Record<string, unknown>).confidence_source, undefined);
        assert.equal(legacyLearning.confidence, undefined);
        assert.equal(legacyLearning.confidence_source, 'missing');
        assert.equal(legacyLearning.contract_hash, baseLearning.contract_hash);
    });

    it('sanitizes confidence from inherited and dormant host-bridge metadata', () => {
        const legacyContract = {
            selection_tier: 'WEAVE',
            selection_name: 'evolve',
            mimirs_well: ['src/node/core/runtime/trace_inheritance.ts'],
            confidence: 0.91,
            confidence_source: 'explicit' as const,
        };
        const context = {
            operator_mode: 'cli' as const,
            target_domain: 'brain',
            workspace_root: '/tmp/cstar-augury-confidence-boundary',
            requested_root: '/tmp/cstar-augury-confidence-boundary',
            session_id: 'session:test',
            augury_contract: legacyContract,
        };
        const inherited = inheritAuguryPayload({ query: 'legacy' }, context);
        const hostMetadata = withRuntimeAuguryMetadata({}, context);

        assert.equal((inherited.augury_contract as Record<string, unknown>).confidence, undefined);
        assert.equal((inherited.trace_contract as Record<string, unknown>).confidence_source, undefined);
        assert.equal((hostMetadata.augury_contract as Record<string, unknown>).confidence, undefined);
        assert.equal((hostMetadata.trace_contract as Record<string, unknown>).confidence_source, undefined);
        assert.equal((hostMetadata.augury_learning_metadata as Record<string, unknown>).confidence, undefined);

        const inheritedLearning = inheritAuguryPayload({
            augury_learning_metadata: { confidence: 0.9, confidence_source: 'explicit' },
        }, context);
        const learning = inheritedLearning.augury_learning_metadata as Record<string, unknown>;
        assert.equal(learning.confidence, undefined);
        assert.equal(learning.confidence_source, 'missing');
    });

    it('sanitizes legacy metadata even when no new contract is attached', () => {
        const legacyMetadata = {
            augury_contract: {
                selection_tier: 'WEAVE', selection_name: 'evolve', mimirs_well: [], confidence: 0.88,
            },
            trace_contract: {
                selection_tier: 'WEAVE', selection_name: 'evolve', mimirs_well: [], confidence_source: 'synthetic',
            },
            augury_learning_metadata: {
                contract_hash: 'legacy', confidence: 0.88, confidence_source: 'synthetic',
            },
        };
        const context = {
            operator_mode: 'cli' as const,
            target_domain: 'brain',
            workspace_root: '/tmp/cstar-augury-confidence-boundary',
            requested_root: '/tmp/cstar-augury-confidence-boundary',
        };
        const noContract = mergeRuntimeAuguryMetadata({
            metadata: legacyMetadata,
            context,
            weaveId: 'weave:evolve',
            auguryContract: null,
            augurySource: null,
        }) as Record<string, unknown>;
        const sourceOnly = mergeRuntimeAuguryMetadata({
            metadata: legacyMetadata,
            context,
            weaveId: 'weave:evolve',
            auguryContract: null,
            augurySource: 'legacy_payload_trace_contract',
        }) as Record<string, unknown>;

        for (const result of [noContract, sourceOnly]) {
            assert.equal((result.augury_contract as Record<string, unknown>).confidence, undefined);
            assert.equal((result.trace_contract as Record<string, unknown>).confidence_source, undefined);
            const learning = result.augury_learning_metadata as Record<string, unknown>;
            assert.equal(learning.confidence, undefined);
            assert.equal(learning.confidence_source, 'missing');
        }
    });
});
