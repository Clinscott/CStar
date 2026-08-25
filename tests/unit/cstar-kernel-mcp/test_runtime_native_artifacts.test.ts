import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    buildKernelRuntimeLineageForRoots,
    evaluateKernelForgeReadiness,
} from '../../../src/tools/cstar-kernel-mcp/contracts/runtime_lineage.js';
import {
    verifyRequiredNativeArtifacts,
} from '../../../src/tools/cstar-kernel-mcp/contracts/runtime_native_artifacts.js';

const roots: string[] = [];
const lockKey = 'node_modules/better-sqlite3';
const relativeArtifact = 'build/Release/better_sqlite3.node';

function writeJson(candidate: string, value: unknown): void {
    fs.mkdirSync(path.dirname(candidate), { recursive: true });
    fs.writeFileSync(candidate, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFile(candidate: string, content: Buffer | string): void {
    fs.mkdirSync(path.dirname(candidate), { recursive: true });
    fs.writeFileSync(candidate, content);
}

function nativeHeader(): Buffer {
    if (process.platform === 'linux') {
        const machine = ({ x64: 0x3e, arm64: 0xb7, ia32: 0x03, arm: 0x28 } as Record<string, number>)[process.arch];
        assert.ok(machine);
        const content = Buffer.alloc(64);
        Buffer.from([0x7f, 0x45, 0x4c, 0x46]).copy(content);
        content[4] = process.arch === 'x64' || process.arch === 'arm64' ? 2 : 1;
        content[5] = 1;
        content.writeUInt16LE(machine, 18);
        return content;
    }
    if (process.platform === 'win32') {
        const machine = ({ x64: 0x8664, arm64: 0xaa64, ia32: 0x014c, arm: 0x01c4 } as Record<string, number>)[process.arch];
        assert.ok(machine);
        const content = Buffer.alloc(128);
        content.write('MZ', 0, 'ascii');
        content.writeUInt32LE(64, 0x3c);
        Buffer.from([0x50, 0x45, 0, 0]).copy(content, 64);
        content.writeUInt16LE(machine, 68);
        return content;
    }
    assert.equal(process.platform, 'darwin');
    const machine = ({ x64: 0x01000007, arm64: 0x0100000c } as Record<string, number>)[process.arch];
    assert.ok(machine);
    const content = Buffer.alloc(64);
    Buffer.from([0xcf, 0xfa, 0xed, 0xfe]).copy(content);
    content.writeUInt32LE(machine, 4);
    return content;
}

function fixture(artifact: Buffer | null = nativeHeader()): {
    codeRoot: string;
    controlRoot: string;
    nodeModulesRoot: string;
    artifactPath: string;
    sourceManifest: Record<string, unknown>;
    expectedPackages: Record<string, unknown>;
    installedPackages: Record<string, unknown>;
} {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-native-proof-'));
    roots.push(root);
    const codeRoot = path.join(root, 'code');
    const controlRoot = path.join(root, 'control');
    const nodeModulesRoot = path.join(codeRoot, 'node_modules');
    const sourceManifest = {
        name: 'synthetic-cstar',
        version: '1.0.1',
        dependencies: { 'better-sqlite3': '12.6.2' },
    };
    const expectedPackages = {
        '': sourceManifest,
        [lockKey]: { version: '12.6.2', hasInstallScript: true },
    };
    const installedPackages = {
        [lockKey]: expectedPackages[lockKey],
    };
    fs.mkdirSync(controlRoot, { recursive: true });
    writeFile(path.join(codeRoot, 'bin', 'cstar-kernel-mcp.js'), 'synthetic\n');
    writeFile(path.join(codeRoot, 'src', 'tools', 'cstar-kernel-mcp.ts'), 'synthetic\n');
    writeJson(path.join(codeRoot, 'package.json'), sourceManifest);
    writeJson(path.join(codeRoot, 'package-lock.json'), {
        name: sourceManifest.name,
        version: sourceManifest.version,
        lockfileVersion: 3,
        packages: expectedPackages,
    });
    writeJson(path.join(nodeModulesRoot, '.package-lock.json'), {
        name: sourceManifest.name,
        version: sourceManifest.version,
        lockfileVersion: 3,
        packages: installedPackages,
    });
    writeJson(path.join(nodeModulesRoot, 'better-sqlite3', 'package.json'), {
        name: 'better-sqlite3', version: '12.6.2',
    });
    const artifactPath = path.join(nodeModulesRoot, 'better-sqlite3', relativeArtifact);
    if (artifact) writeFile(artifactPath, artifact);
    return {
        codeRoot,
        controlRoot,
        nodeModulesRoot,
        artifactPath,
        sourceManifest,
        expectedPackages,
        installedPackages,
    };
}

function proof(value: ReturnType<typeof fixture>, smoke = () => true) {
    return verifyRequiredNativeArtifacts({
        nodeModulesRoot: value.nodeModulesRoot,
        sourceManifest: value.sourceManifest,
        expectedPackages: value.expectedPackages,
        installedPackages: value.installedPackages,
    }, smoke);
}

afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('required native runtime artifact proof', () => {
    it('fails Forge readiness when a matching inventory omits the generated addon', () => {
        const value = fixture(null);
        const lineage = buildKernelRuntimeLineageForRoots({
            codeRoot: value.codeRoot,
            controlRoot: value.controlRoot,
            bindingMode: 'live_launcher',
        });
        assert.equal(lineage.dependency_proof.installed_inventory, 'verified_lock_match');
        assert.equal(lineage.dependency_lineage, 'partial');
        assert.ok(lineage.dependency_proof.mismatch_reasons.includes(
            `required_native_artifact_missing:${lockKey}/${relativeArtifact}`,
        ));
        const readiness = evaluateKernelForgeReadiness(lineage);
        assert.ok(readiness.failures.includes('forge_runtime_dependency_lineage_partial'));
        assert.ok(readiness.failures.includes('forge_runtime_required_native_artifacts_partial'));
    });

    it('does not mistake a platform header for a loadable SQLite runtime', () => {
        const value = fixture();
        const lineage = buildKernelRuntimeLineageForRoots({
            codeRoot: value.codeRoot,
            controlRoot: value.controlRoot,
            bindingMode: 'live_launcher',
        });
        const artifact = lineage.dependency_proof.native_artifact_proof.artifacts[0];
        assert.equal(artifact?.status, 'verified_platform_binary');
        assert.equal(artifact?.runtime_smoke, 'failed');
        assert.ok(lineage.dependency_proof.mismatch_reasons.includes(
            `required_native_artifact_smoke_failed:${lockKey}/${relativeArtifact}`,
        ));
        assert.equal(evaluateKernelForgeReadiness(lineage).ready, false);
    });

    it('binds verified synthetic artifact bytes when the isolated smoke contract passes', () => {
        const value = fixture();
        const before = proof(value);
        assert.equal(before.contract, 'verified_required_native_artifacts');
        assert.equal(before.required_artifacts, 1);
        assert.equal(before.verified_artifacts, 1);
        assert.equal(before.artifacts[0]?.runtime_smoke, 'verified');
        const changed = fs.readFileSync(value.artifactPath);
        changed[changed.length - 1] ^= 0xff;
        fs.writeFileSync(value.artifactPath, changed);
        const after = proof(value);
        assert.notEqual(after.artifacts[0]?.sha256, before.artifacts[0]?.sha256);
    });

    it('rejects final and intermediate symlinks, hardlinks, and invalid binaries', () => {
        const value = fixture(null);
        const outside = path.join(path.dirname(value.codeRoot), 'outside.node');
        writeFile(outside, nativeHeader());
        fs.mkdirSync(path.dirname(value.artifactPath), { recursive: true });
        fs.symlinkSync(outside, value.artifactPath);
        assert.equal(proof(value).artifacts[0]?.status, 'unsafe');
        fs.rmSync(value.artifactPath);
        fs.linkSync(outside, value.artifactPath);
        assert.equal(proof(value).artifacts[0]?.status, 'unsafe');
        fs.rmSync(path.join(value.nodeModulesRoot, 'better-sqlite3', 'build'), { recursive: true });
        const outsideBuild = path.join(path.dirname(value.codeRoot), 'outside-build');
        writeFile(path.join(outsideBuild, 'Release', 'better_sqlite3.node'), nativeHeader());
        fs.symlinkSync(outsideBuild, path.join(value.nodeModulesRoot, 'better-sqlite3', 'build'));
        assert.equal(proof(value).artifacts[0]?.status, 'unsafe');
        fs.rmSync(path.join(value.nodeModulesRoot, 'better-sqlite3', 'build'));
        writeFile(value.artifactPath, 'not-a-native-binary');
        assert.equal(proof(value).artifacts[0]?.status, 'invalid_binary');
    });

    it('rejects oversized artifacts before allocating their declared size', () => {
        const value = fixture(null);
        writeFile(value.artifactPath, nativeHeader());
        fs.truncateSync(value.artifactPath, (64 * 1024 * 1024) + 1);
        const result = proof(value);
        assert.equal(result.artifacts[0]?.status, 'invalid_size');
        assert.ok(result.mismatch_reasons.includes(
            `required_native_artifact_size_invalid:${lockKey}/${relativeArtifact}`,
        ));
    });
});
