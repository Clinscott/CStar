import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    isValidationEvidenceManifestV2StructurallyValid,
    isValidationEvidenceManifestV3StructurallyValid,
} from '../../../src/types/validation_evidence.js';

function source(relativePath: string): string {
    return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Forge validation evidence type boundary', () => {
    it('keeps the validation contract independent of the broad Hall type surface', () => {
        const validationTypes = source('src/types/validation_evidence.ts');
        assert.doesNotMatch(validationTypes, /from\s+['"]\.\/hall\.js['"]/);

        for (const relativePath of [
            'src/tools/cstar-kernel-mcp/tools/validation_evidence.ts',
            'src/tools/pennyone/intel/forge_validation_controller.ts',
        ]) {
            const implementation = source(relativePath);
            assert.match(implementation, /HallValidationEvidenceManifestV2[\s\S]*from\s+['"][^'"]*validation_evidence\.js['"]/);
            assert.doesNotMatch(implementation, /HallValidationEvidenceManifestV2[\s\S]*from\s+['"][^'"]*hall\.js['"]/);
        }
    });

    it('rejects malformed persisted JSON without throwing', () => {
        const hash = 'a'.repeat(64);
        const valid = {
            schema: 'cstar.validation-evidence.v2',
            validator_identity: 'codex-thread:validator-thread:turn:validator-turn',
            validator_identity_source: 'test_fixture',
            request_thread_id: 'validator-thread',
            request_turn_id: 'validator-turn',
            subject: {
                repository_id: 'repository',
                bead_id: 'bead:test',
                work_receipt_kind: 'forge_execution',
                work_receipt_id: 'forge-execute-test',
                forge_request_id: 'dispatch-forge-test',
                forge_request_sha256: hash,
                decision_id: 'decision:test',
                target_paths_sha256: hash,
                attempt_id: 'forge-attempt-test',
                result_artifact_sha256: null,
                adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
                adapter_version: null,
                external_execution_id: null,
            },
            independence: {
                policy: 'distinct_codex_root_thread_from_forge_requester_and_executor_v1',
                validator_thread_id: 'validator-thread',
                requester_thread_id: 'requester-thread',
                requester_turn_id: 'requester-turn',
                requester_record_set_sha256: hash,
                executor_binding: 'forge_exact_authorizing_turn_v1',
                authorization_id: 'forge-authorize-test',
                executor_thread_id: 'executor-thread',
                executor_turn_id: 'executor-turn',
                executor_record_sha256: hash,
                executor_record_set_sha256: hash,
                executor_record_count: 1,
            },
            artifacts: [{ path: 'artifact.json', sha256: hash }],
            checks: [{ name: 'synthetic check', status: 'pass', evidence_path: 'artifact.json', sha256: hash }],
        };
        for (const malformed of [
            null,
            {},
            { subject: null, independence: {} },
            { subject: {}, independence: null },
            { ...valid, artifacts: [null] },
            { ...valid, checks: [null] },
        ]) {
            assert.doesNotThrow(() => isValidationEvidenceManifestV2StructurallyValid(malformed));
            assert.equal(isValidationEvidenceManifestV2StructurallyValid(malformed), false);
        }
    });

    it('accepts only exact host-workflow v3 lineage and receipt bindings', () => {
        const hash = 'a'.repeat(64);
        const valid = {
            schema: 'cstar.validation-evidence.v3',
            validator_identity: 'codex-subagent:validator-thread:turn:validator-turn',
            validator_identity_source: 'test_fixture',
            request_thread_id: 'recorder-thread',
            request_turn_id: 'recorder-turn',
            session_turn_record_sha256: hash,
            session_turn_record_set_sha256: hash,
            session_turn_record_count: 1,
            session_turn_first_timestamp: '2026-07-18T14:00:00.000Z',
            session_turn_timestamp: '2026-07-18T14:00:00.000Z',
            subject: {
                repository_id: 'repository',
                bead_id: 'bead:test',
                target_path: 'src/test.ts',
                work_receipt_kind: 'host_validation_manifest',
                work_receipt_id: `host-validation:${hash}`,
                validation_id: 'val-test',
                validation_manifest_schema: 'cstar.independent_validation_input.v1',
                validation_manifest_path: '/project/evidence/manifest.json',
                validation_manifest_sha256: hash,
            },
            independence: {
                policy: 'depth_one_codex_subagent_from_recording_root_v1',
                recorder_thread_id: 'recorder-thread',
                recorder_turn_id: 'recorder-turn',
                recorder_record_set_sha256: hash,
                validator_thread_id: 'validator-thread',
                validator_turn_id: 'validator-turn',
                validator_parent_thread_id: 'recorder-thread',
                validator_agent_path: '/root/validator',
                validator_session_sha256: hash,
                validator_final_record_sha256: hash,
                validator_task_complete_record_sha256: hash,
                validator_completed_at: 1,
            },
            artifacts: [{ path: '/project/artifact.json', sha256: hash }],
            checks: [{
                name: 'synthetic check', status: 'pass',
                evidence_path: '/project/check.txt', sha256: hash,
            }],
        };
        assert.equal(isValidationEvidenceManifestV3StructurallyValid(valid), true);
        assert.equal(isValidationEvidenceManifestV3StructurallyValid({
            ...valid,
            validator_identity_source: 'codex_subagent_receipt',
            session_turn_record_count: 2,
        }), true);
        for (const malformed of [
            { ...valid, subject: { ...valid.subject, work_receipt_id: 'host-validation:wrong' } },
            { ...valid, independence: { ...valid.independence, validator_parent_thread_id: 'other' } },
            { ...valid, independence: { ...valid.independence, recorder_record_set_sha256: 'b'.repeat(64) } },
            { ...valid, independence: { ...valid.independence, validator_agent_path: '/root/team/nested' } },
            { ...valid, validator_identity: 'codex-subagent:other:turn:validator-turn' },
            { ...valid, session_turn_record_count: 0 },
            { ...valid, session_turn_record_count: 1.5 },
            { ...valid, checks: [{ ...valid.checks[0], status: 'fail' }] },
        ]) {
            assert.doesNotThrow(() => isValidationEvidenceManifestV3StructurallyValid(malformed));
            assert.equal(isValidationEvidenceManifestV3StructurallyValid(malformed), false);
        }
    });
});
