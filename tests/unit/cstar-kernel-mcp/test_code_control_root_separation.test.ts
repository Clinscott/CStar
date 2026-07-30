import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    resolveDispatchSurface,
    verifyDispatchPackageLocks,
    type DispatchRequestArgs,
} from '../../../src/tools/cstar-kernel-mcp/tools/dispatch_request.js';
import {
    resolveForgeExecutionAdapterRef,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_adapters.js';
import { synthesizePlanningAuguryContract } from '../../../src/node/core/commands/trace_contract.js';
import { canonicalizeForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request_contract.js';
import { prepareForgeWorkspaceProjection } from '../../../src/tools/cstar-kernel-mcp/tools/forge_workspace_projection.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const NATIVE_TEMP_ROOT = process.platform === 'linux' ? '/tmp' : os.tmpdir();

function makeControlRoot(): string {
    const root = fs.mkdtempSync(path.join(NATIVE_TEMP_ROOT, 'cstar-control-binding-'));
    fs.chmodSync(root, 0o700);
    const stats = path.join(root, '.stats');
    fs.mkdirSync(stats, { mode: 0o700 });
    fs.writeFileSync(path.join(stats, 'pennyone.db'), 'synthetic hall', { mode: 0o600 });
    return root;
}

function request(): DispatchRequestArgs {
    return {
        bead_id: 'bead:synthetic:root-separation',
        decision_id: 'decision:synthetic:root-separation',
        source_callback_thread_id: 'synthetic-thread',
        objective: 'Prove source and state root separation',
        target_paths: ['/synthetic/target'],
        required_output_paths: ['/synthetic/target'],
        scope: 'synthetic-only',
        authority_lane: 'yellow',
        required_metrics: [{ name: 'root_separation', threshold: 'exact' }],
        artifact_expectations: ['synthetic receipt'],
        requested_actions: ['project_files'],
        prohibited_actions: ['git_commit'],
        spend_policy: { mode: 'no_spend' },
        fixture_policy: 'synthetic_only',
        callback_contract: { expected_packet: 'SYNTHETIC_ROOT_PACKET' },
    };
}

describe('CStar code/control root separation', () => {
    it('routes host-validation source evidence through code root while Hall remains control-root state', () => {
        const resultSource = fs.readFileSync(
            path.join(PROJECT_ROOT, 'src/tools/cstar-kernel-mcp/tools/result.ts'),
            'utf-8',
        );
        const beadSource = fs.readFileSync(
            path.join(PROJECT_ROOT, 'src/tools/cstar-kernel-mcp/tools/bead.ts'),
            'utf-8',
        );
        assert.match(
            resultSource,
            /verifyHostWorkflowValidationEvidence\(\s*CODE_ROOT,/,
        );
        assert.match(beadSource, /target_path:\s*bead\.target_path/);
        assert.match(
            beadSource,
            /evidence_manifest\?\.schema === 'cstar\.validation-evidence\.v3'\s*\? CODE_ROOT : hubRoot/,
        );
    });

    it('resolves dispatch contracts and the private Forge adapter from code root only', () => {
        const codeRoot = fs.mkdtempSync(path.join(NATIVE_TEMP_ROOT, 'cstar-code-binding-'));
        const controlRoot = makeControlRoot();
        fs.mkdirSync(path.join(codeRoot, 'docs', 'operations'), { recursive: true });
        fs.writeFileSync(
            path.join(codeRoot, 'docs', 'operations', 'corvus-forge-skill-spec.md'),
            'synthetic clean code contract',
        );
        const adapter = path.join(
            codeRoot,
            '.agents',
            'skills',
            'corvus-forge',
            'scripts',
            'forge_worker_adapter.py',
        );
        fs.mkdirSync(path.dirname(adapter), { recursive: true });
        fs.writeFileSync(adapter, '# synthetic adapter\n', { mode: 0o700 });
        fs.mkdirSync(path.join(controlRoot, 'docs', 'operations'), { recursive: true });
        fs.writeFileSync(
            path.join(controlRoot, 'docs', 'operations', 'corvus-forge-skill-spec.md'),
            'hostile stale control-root contract',
        );
        try {
            const surface = resolveDispatchSurface('forge', request(), codeRoot);
            assert.equal(surface.found, true);
            assert.equal(surface.selected?.path.startsWith(codeRoot), true);
            assert.equal(surface.selected?.path.startsWith(controlRoot), false);

            const resolved = resolveForgeExecutionAdapterRef(
                'cstar-forge-hermes-minimax-worker-adapter',
                codeRoot,
            );
            assert.equal(resolved.found, true);
            assert.equal(resolved.selected?.registered_script, adapter);
        } finally {
            fs.rmSync(codeRoot, { recursive: true, force: true });
            fs.rmSync(controlRoot, { recursive: true, force: true });
        }
    });

    it('binds live PathRegistry to control root and makes the binding immutable', () => {
        const controlRoot = makeControlRoot();
        const script = [
            "import('./src/tools/pennyone/pathRegistry.ts').then(({ registry }) => {",
            "  console.log(registry.getRoot());",
            "  try { registry.setRoot('/tmp/forbidden'); }",
            "  catch (error) { console.error(error.message); process.exit(23); }",
            "  process.exit(24);",
            '});',
        ].join('\n');
        try {
            const result = spawnSync(process.execPath, ['--import', 'tsx', '--eval', script], {
                cwd: PROJECT_ROOT,
                encoding: 'utf8',
                env: {
                    HOME: process.env.HOME ?? os.homedir(),
                    PATH: process.env.PATH ?? '',
                    CSTAR_KERNEL_MCP: '1',
                    CSTAR_CONTROL_ROOT: controlRoot,
                    CSTAR_PROJECT_ROOT: controlRoot,
                    CSTAR_WORKSPACE_ROOT: controlRoot,
                },
            });
            assert.equal(result.status, 23, result.stderr);
            assert.equal(result.stdout.trim(), controlRoot);
            assert.match(result.stderr, /kernel_control_root_immutable/);
        } finally {
            fs.rmSync(controlRoot, { recursive: true, force: true });
        }
    });

    it('exposes distinct live Forge code and control roots through one resolver', () => {
        const controlRoot = makeControlRoot();
        const script = [
            "import('./src/tools/cstar-kernel-mcp/tools/forge_runtime_roots.ts').then(({ resolveForgeRuntimeRoots }) => {",
            '  console.log(JSON.stringify(resolveForgeRuntimeRoots()));',
            '});',
        ].join('\n');
        try {
            const result = spawnSync(process.execPath, ['--import', 'tsx', '--eval', script], {
                cwd: PROJECT_ROOT,
                encoding: 'utf8',
                env: {
                    HOME: process.env.HOME ?? os.homedir(),
                    PATH: process.env.PATH ?? '',
                    CSTAR_KERNEL_MCP: '1',
                    CSTAR_CODE_ROOT: PROJECT_ROOT,
                    CSTAR_CONTROL_ROOT: controlRoot,
                    CSTAR_PROJECT_ROOT: controlRoot,
                    CSTAR_WORKSPACE_ROOT: controlRoot,
                },
            });
            assert.equal(result.status, 0, result.stderr);
            assert.deepEqual(JSON.parse(result.stdout), {
                controlRoot,
                codeRoot: PROJECT_ROOT,
            });
        } finally {
            fs.rmSync(controlRoot, { recursive: true, force: true });
        }
    });

    it('resolves relative Forge source material from code root without control-root fallback', () => {
        const codeRoot = fs.mkdtempSync(path.join(NATIVE_TEMP_ROOT, 'cstar-forge-code-root-'));
        const controlRoot = makeControlRoot();
        const projectionRoot = fs.mkdtempSync(path.join(NATIVE_TEMP_ROOT, 'cstar-forge-projection-'));
        fs.chmodSync(codeRoot, 0o700);
        fs.chmodSync(projectionRoot, 0o700);
        const relative = path.join('src', 'locked.ts');
        const codePath = path.join(codeRoot, relative);
        const stalePath = path.join(controlRoot, relative);
        fs.mkdirSync(path.dirname(codePath), { recursive: true });
        fs.mkdirSync(path.dirname(stalePath), { recursive: true });
        fs.writeFileSync(codePath, 'current code root\n');
        fs.writeFileSync(stalePath, 'stale control root\n');
        const sha256 = createHash('sha256').update(fs.readFileSync(codePath)).digest('hex');
        const args = {
            ...request(),
            target_paths: [relative],
            required_output_paths: [relative],
            package_locks: [{ path: relative, sha256 }],
        };
        try {
            const canonical = canonicalizeForgeRequest(
                args,
                codeRoot,
                args.decision_id!,
                'cstar-forge-hermes-minimax-worker-adapter',
                'project_files',
                1,
            );
            assert.deepEqual(canonical.target_paths, [codePath]);
            assert.deepEqual(canonical.required_output_paths, [codePath]);

            const lockProofs = verifyDispatchPackageLocks(args.package_locks, codeRoot);
            assert.equal(lockProofs[0]?.path, codePath);
            assert.notEqual(lockProofs[0]?.path, stalePath);

            const projection = prepareForgeWorkspaceProjection(
                {
                    ...args,
                    target_paths: canonical.target_paths,
                    required_output_paths: canonical.required_output_paths,
                } as any,
                codeRoot,
                codeRoot,
                projectionRoot,
            );
            assert.equal(projection.source_control_root, codeRoot);
            assert.equal(projection.source_project_root, codeRoot);
            assert.equal(projection.package_lock_preimages[0]?.source_path, codePath);
            assert.notEqual(projection.package_lock_preimages[0]?.source_path, stalePath);
        } finally {
            fs.rmSync(codeRoot, { recursive: true, force: true });
            fs.rmSync(controlRoot, { recursive: true, force: true });
            fs.rmSync(projectionRoot, { recursive: true, force: true });
        }
    });

    it('uses code-root intent grammar while the planning session remains control-root state', () => {
        const codeRoot = fs.mkdtempSync(path.join(NATIVE_TEMP_ROOT, 'cstar-code-grammar-'));
        const controlRoot = makeControlRoot();
        for (const [root, defaultPath] of [
            [codeRoot, 'clean-code-route'],
            [controlRoot, 'stale-control-route'],
        ]) {
            fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
            fs.writeFileSync(path.join(root, '.agents', 'skill_registry.json'), JSON.stringify({
                intent_grammar: {
                    BUILD: { triggers: ['build'], default_path: defaultPath, tier: 'WEAVE' },
                },
            }));
        }
        try {
            const contract = synthesizePlanningAuguryContract({
                session_id: 'synthetic-session',
                user_intent: 'build the bounded repair',
                normalized_intent: 'build the bounded repair',
                status: 'PLAN_READY',
                metadata: {},
            } as any, controlRoot, [], codeRoot);
            assert.equal(contract?.selection_name, 'clean-code-route');
            assert.notEqual(contract?.selection_name, 'stale-control-route');
        } finally {
            fs.rmSync(codeRoot, { recursive: true, force: true });
            fs.rmSync(controlRoot, { recursive: true, force: true });
        }
    });

    it('refuses direct TypeScript server launch without the supported launcher', () => {
        const result = spawnSync(
            process.execPath,
            ['--import', 'tsx', 'src/tools/cstar-kernel-mcp.ts'],
            {
                cwd: PROJECT_ROOT,
                encoding: 'utf8',
                env: {
                    HOME: process.env.HOME ?? os.homedir(),
                    PATH: process.env.PATH ?? '',
                },
            },
        );
        assert.equal(result.status, 1);
        assert.match(result.stderr, /cstar_kernel_supported_launcher_required/);
    });
});
