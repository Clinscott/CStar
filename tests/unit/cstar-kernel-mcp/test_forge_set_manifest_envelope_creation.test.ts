import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS }
    from '../../../src/types/forge.js';
import { handleBead } from '../../../src/tools/cstar-kernel-mcp/tools/bead.js';
import {
    bindForgeMissionGrantEnvelopeMetadata,
    hashForgeMissionGrantEnvelope,
} from '../../../src/tools/pennyone/intel/forge_mission_grant_envelope.js';
import {
    beginNaturalAuthorizationTest,
    cleanupNaturalAuthorizationTest,
    parse,
    setupRoot,
} from './forge_natural_authorization_test_support.js';
import {
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';

beforeEach(beginNaturalAuthorizationTest);
afterEach(cleanupNaturalAuthorizationTest);

describe('SET mission envelope creation', () => {
    it('canonicalizes and hashes the complete immutable red-action envelope', async () => {
        const value = setupRoot('set-envelope-creation');
        const session = createSession({ textParts: ['SET'] });
        const metadata = {
            schema: 'cstar.set_manifest.v1',
            decision_id: 'decision:set-envelope-creation',
            design_revision: 1,
            design_sha256: 'a'.repeat(64),
            batch_order: ['bead:set-envelope-child'],
            operator_set: true,
            mission_grant_envelope: {
                schema: 'cstar.forge_mission_grant_envelope.v1',
                allowed_targets: [value.target],
                allowed_outputs: [value.target],
                allowed_actions: ['validation_artifacts', 'response_only'],
                prohibited_actions: [
                    ...FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS,
                ].reverse(),
                adapter_ref: 'cstar-forge-hermes-minimax-adapter',
                write_capability: 'response_only',
                total_provider_attempt_ceiling: 1,
                retry_derived_iteration_ceiling: 0,
                paid_attempt_ceiling: 1,
            },
        };
        const created = parse(await handleBead({
            action: 'create',
            bead_id: 'bead:set-envelope-parent',
            target_kind: 'WORKFLOW',
            target_ref: 'decision:set-envelope-creation',
            rationale: 'Synthetic SET envelope creation probe.',
            status: 'IN_PROGRESS',
            metadata,
        }, validRequestContext(session.threadId, session.turnId)));
        assert.equal(created.status, 'created', JSON.stringify(created));
        const stored = JSON.parse(value.db.prepare(
            'SELECT metadata_json FROM hall_beads WHERE bead_id = ?',
        ).pluck().get('bead:set-envelope-parent') as string);
        assert.deepEqual(
            stored.mission_grant_envelope.prohibited_actions,
            [...FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS].sort(),
        );
        assert.equal(
            stored.mission_grant_envelope_sha256,
            hashForgeMissionGrantEnvelope(stored.mission_grant_envelope),
        );
        const incomplete = structuredClone(metadata);
        incomplete.mission_grant_envelope.prohibited_actions = ['deploy'];
        assert.throws(
            () => bindForgeMissionGrantEnvelopeMetadata(incomplete),
            /forge_mission_grant_envelope_prohibitions_incomplete/,
        );
    });
});
