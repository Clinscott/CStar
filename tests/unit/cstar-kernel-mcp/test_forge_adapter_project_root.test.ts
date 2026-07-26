import { beforeEach, describe, it } from 'node:test';
import {
    assert,
    fs,
    os,
    path,
    validForgeExecuteRequest,
    handleForgeExecute,
} from './shared_test_setup.js';

describe('CStar MCP Forge adapter project-root inference', () => {
    beforeEach(() => {
        process.env.CSTAR_KERNEL_ENABLE_LEGACY_LIVE_EXECUTION = '1';
    });

    it('uses the common project root for mixed tools/tests targets without nesting tools twice', async () => {
        const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-worker-project-'));
        const toolsDir = path.join(projectRoot, 'tools');
        const testsDir = path.join(projectRoot, 'tests');
        fs.mkdirSync(toolsDir, { recursive: true });
        fs.mkdirSync(testsDir, { recursive: true });
        const runnerPath = path.join(toolsDir, 'truth_lie_hermes_profile_eval.py');
        fs.writeFileSync(runnerPath, '# runner\n');
        const modelResponse = path.join(projectRoot, 'model-response.json');
        fs.writeFileSync(modelResponse, JSON.stringify({
            status: 'success',
            summary: 'Applied common-root write.',
            files: [
                { path: 'tools/generated_skill_module.py', content: 'VALUE = 1\n' },
            ],
            artifacts: {},
            validation: { common_root: 'pass' },
            metrics: { files_written: 1 },
            boundaries: { no_codex_worker_fallback: true },
            callback_packet: 'TEST_FORGE_COMMON_ROOT_PACKET',
        }));
        process.env.CSTAR_FORGE_WORKER_MODEL_RESPONSE = modelResponse;
        const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-forge-artifacts-'));
        process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = artifactRoot;
        const result = await handleForgeExecute(validForgeExecuteRequest({
            objective: 'Build bounded Python Researcher skill module through the Forge worker adapter',
            target_paths: [runnerPath, testsDir, toolsDir],
            requested_actions: ['build reusable Python module'],
            artifact_expectations: ['changed source file'],
            execution_adapter_ref: 'cstar-forge-edit-files',
            callback_contract: {
                expected_packet: 'TEST_FORGE_COMMON_ROOT_PACKET',
                callback_required: true,
            },
        }));
        assert.ok(result.content);
        const parsed = JSON.parse(result.content[0].text);
        const expectedPath = path.join(toolsDir, 'generated_skill_module.py');
        assert.strictEqual(parsed.status, 'executed');
        assert.strictEqual(parsed.forge_execution.fail_closed_reason, null);
        assert.strictEqual(fs.existsSync(expectedPath), true);
        assert.strictEqual(fs.existsSync(path.join(toolsDir, 'tools', 'generated_skill_module.py')), false);
    });

    it('allows explicit external target roots while keeping writes bounded to those targets', async () => {
        const estateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-worker-estate-'));
        const corvusEyeRoot = path.join(estateRoot, 'CorvusEye');
        const hermesSkillRoot = path.join(estateRoot, '.hermes', 'profiles', 'cstar-hub', 'skills', 'research', 'research-agent-loop');
        const skillModuleDir = path.join(hermesSkillRoot, 'tools', 'researcher_truth_verifier_skill');
        fs.mkdirSync(path.join(corvusEyeRoot, '.git'), { recursive: true });
        fs.mkdirSync(skillModuleDir, { recursive: true });
        const generatedSkillPath = path.join(skillModuleDir, '__init__.py');
        const modelResponse = path.join(estateRoot, 'model-response.json');
        fs.writeFileSync(modelResponse, JSON.stringify({
            status: 'success',
            summary: 'Applied explicit external target root write.',
            files: [
                { path: generatedSkillPath, content: 'PIPELINE_VERSION = "test"\n' },
            ],
            artifacts: {},
            validation: { mixed_roots: 'pass' },
            metrics: { files_written: 1 },
            boundaries: { no_codex_worker_fallback: true },
            callback_packet: 'TEST_FORGE_EXTERNAL_TARGET_PACKET',
        }));
        process.env.CSTAR_FORGE_WORKER_MODEL_RESPONSE = modelResponse;
        const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-forge-artifacts-'));
        process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = artifactRoot;
        const result = await handleForgeExecute(validForgeExecuteRequest({
            objective: 'Refactor Researcher skill files through the Forge worker adapter',
            target_paths: [skillModuleDir, corvusEyeRoot],
            requested_actions: ['build reusable Researcher skill module'],
            artifact_expectations: ['changed source file'],
            execution_adapter_ref: 'cstar-forge-edit-files',
            callback_contract: {
                expected_packet: 'TEST_FORGE_EXTERNAL_TARGET_PACKET',
                callback_required: true,
            },
        }));
        assert.ok(result.content);
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'executed');
        assert.strictEqual(parsed.forge_execution.fail_closed_reason, null);
        assert.strictEqual(parsed.forge_execution.adapter_result.status, 'ok');
        assert.strictEqual(fs.readFileSync(generatedSkillPath, 'utf-8'), 'PIPELINE_VERSION = "test"\n');
    });

    it('treats missing extensionless target paths as future directory roots', async () => {
        const estateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-worker-estate-'));
        const futureSkillsRoot = path.join(estateRoot, 'research-vault', 'skills');
        const generatedSkillPath = path.join(futureSkillsRoot, 'researcher-metric-category-auditor', 'SKILL.md');
        const modelResponse = path.join(estateRoot, 'model-response.json');
        fs.writeFileSync(modelResponse, JSON.stringify({
            status: 'success',
            summary: 'Applied new skill write under future root.',
            files: [
                { path: generatedSkillPath, content: '# Skill\n' },
            ],
            artifacts: {},
            validation: { future_root: 'pass' },
            metrics: { files_written: 1 },
            boundaries: { no_codex_worker_fallback: true },
            callback_packet: 'TEST_FORGE_FUTURE_ROOT_PACKET',
        }));
        process.env.CSTAR_FORGE_WORKER_MODEL_RESPONSE = modelResponse;
        const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-forge-artifacts-'));
        process.env.CSTAR_FORGE_EXECUTION_ARTIFACT_ROOT = artifactRoot;
        const result = await handleForgeExecute(validForgeExecuteRequest({
            objective: 'Build new reusable Researcher metric category audit skill through the Forge worker adapter',
            target_paths: [futureSkillsRoot],
            requested_actions: ['build reusable skill package'],
            artifact_expectations: ['changed skill files'],
            execution_adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
            callback_contract: {
                expected_packet: 'TEST_FORGE_FUTURE_ROOT_PACKET',
                callback_required: true,
            },
        }));
        assert.ok(result.content);
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'executed');
        assert.strictEqual(parsed.forge_execution.fail_closed_reason, null);
        assert.strictEqual(fs.readFileSync(generatedSkillPath, 'utf-8'), '# Skill\n');
    });
});
