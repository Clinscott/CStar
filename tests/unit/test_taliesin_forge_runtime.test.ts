import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildTaliesinForgeInvocation } from  '../../src/node/core/commands/dispatcher.js';
import type { RuntimeContext } from  '../../src/node/core/runtime/contracts.js';
import { TaliesinForgeWeave } from  '../../src/node/core/runtime/weaves/taliesin_forge.js';

function createContext(workspaceRoot: string): RuntimeContext {
    return {
        mission_id: 'MISSION-TALIESIN',
        trace_id: 'TRACE-TALIESIN',
        persona: 'TALIESIN',
        workspace_root: workspaceRoot,
        operator_mode: 'cli',
        target_domain: 'brain',
        interactive: true,
        env: {},
        timestamp: Date.now(),
    };
}

describe('TALIESIN forge runtime (CS-P4-00)', () => {
    it('builds a canonical forge invocation from CLI flags', () => {
        assert.deepEqual(
            buildTaliesinForgeInvocation(
                ['--bead-id', 'bead-1', '--persona', 'TALIESIN', '--model', 'gemini-test'],
                'C:\\Users\\Craig\\Corvus\\CorvusStar',
                'C:\\Users\\Craig\\Corvus\\CorvusStar',
            ),
            {
                weave_id: 'weave:taliesin-forge',
                payload: {
                    bead_id: 'bead-1',
                    persona: 'TALIESIN',
                    model: 'gemini-test',
                    project_root: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                    cwd: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                    source: 'cli',
                },
                target: {
                    domain: 'brain',
                    workspace_root: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                    requested_path: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                },
                session: {
                    mode: 'cli',
                    interactive: true,
                },
            },
        );
    });

    it('returns the staged candidate envelope from the runtime weave', async () => {
        const weave = new TaliesinForgeWeave((async () => ({
            stdout: `${'__CORVUS_TALIESIN__'}${JSON.stringify({
                status: 'SUCCESS',
                summary: 'Candidate forged for src/core/forge_target.py',
                candidate: {
                    status: 'STAGED',
                    candidate_id: 'candidate-1',
                    bead_id: 'bead-1',
                    target_path: 'src/core/forge_target.py',
                    staged_path: '.agents/forge_staged/candidate_1__forge_target.py',
                    candidate_patch: 'patch-body',
                    candidate_content: 'def execute(args):\n    return None\n',
                    summary: 'Forge target refactor candidate',
                    generated_tests: [],
                    required_validations: ['crucible', 'generated_tests'],
                    validation_request: {
                        bead_id: 'bead-1',
                        candidate_id: 'candidate-1',
                        repo_id: 'repo-1',
                        scan_id: 'scan-1',
                        target_path: 'src/core/forge_target.py',
                        staged_path: '.agents/forge_staged/candidate_1__forge_target.py',
                        contract_refs: ['contracts:forge-target'],
                        acceptance_criteria: 'Raise the baseline above 5.0.',
                        required_validations: ['crucible', 'generated_tests'],
                        baseline_scores: { overall: 2.3 },
                        generated_tests: [],
                    },
                    trace_metadata: { request_source: 'bead' },
                    errors: [],
                },
                validation_request: {
                    bead_id: 'bead-1',
                    candidate_id: 'candidate-1',
                    repo_id: 'repo-1',
                    scan_id: 'scan-1',
                    target_path: 'src/core/forge_target.py',
                    staged_path: '.agents/forge_staged/candidate_1__forge_target.py',
                    contract_refs: ['contracts:forge-target'],
                    acceptance_criteria: 'Raise the baseline above 5.0.',
                    required_validations: ['crucible', 'generated_tests'],
                    baseline_scores: { overall: 2.3 },
                    generated_tests: [],
                },
            })}`,
        })) as any);

        const result = await weave.execute(
            {
                weave_id: 'weave:taliesin-forge',
                payload: {
                    bead_id: 'bead-1',
                    project_root: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                    cwd: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                    source: 'cli',
                },
            },
            createContext('C:\\Users\\Craig\\Corvus\\CorvusStar'),
        );

        assert.equal(result.status, 'SUCCESS');
        const metadata = result.metadata as any;
        assert.equal(metadata.candidate.status, 'STAGED');
        assert.equal(metadata.validation_request.acceptance_criteria, 'Raise the baseline above 5.0.');
        assert.equal(metadata.validation_request.staged_path, '.agents/forge_staged/candidate_1__forge_target.py');
    });

    it('fails fast when bead id is missing', async () => {
        const weave = new TaliesinForgeWeave((async () => ({ stdout: '' })) as any);

        const result = await weave.execute(
            {
                weave_id: 'weave:taliesin-forge',
                payload: {
                    project_root: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                    cwd: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                    source: 'cli',
                },
            },
            createContext('C:\\Users\\Craig\\Corvus\\CorvusStar'),
        );

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /requires --bead-id/i);
    });
});
