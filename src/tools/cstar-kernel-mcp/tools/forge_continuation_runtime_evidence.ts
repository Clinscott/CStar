import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { readBoundedUtf8FileInside } from '../contracts/runtime.js';
import {
    assertSafePrivateArtifact,
    atomicWritePrivateFile,
    ensureSafeDirectoryTree,
    forgeExecutionPathSegment,
    publishPrivateFileNoClobber,
} from './forge_adapter_artifacts.js';
import type { ForgeAdapterRuntimeProof } from './forge_adapter_runtime.js';
import { stableJson, type CanonicalForgeRequest } from './forge_request_contract.js';
import { readSnapshot } from './forge_workspace_projection.js';

const RUNTIME_EVIDENCE_MAX_BYTES = 512 * 1024;
const HERMES_RUNTIME_FILE_MAX_BYTES = 512 * 1024;
const HERMES_RUNTIME_TOTAL_MAX_BYTES = 1024 * 1024;

interface RuntimeSnapshot {
    path: string;
    sha256: string;
    bytes: number;
    content: Buffer;
}

function sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function requireForgeContinuationArtifact(
    artifacts: Map<string, string>, candidate: string, digest: string, role: string,
): void {
    if (artifacts.get(path.resolve(candidate)) !== digest) {
        throw new Error(`forge_continuation_runtime_file_unvalidated:${role}`);
    }
}

export function isInsideForgeContinuationRoot(candidate: string, root: string): boolean {
    const relative = path.relative(root, candidate);
    return relative === '' || (
        relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
    );
}

function runtimeEvidencePath(root: string, executionReceiptId: string): string {
    if (forgeExecutionPathSegment(executionReceiptId) !== executionReceiptId) {
        throw new Error('forge_continuation_runtime_evidence_receipt_invalid');
    }
    return path.join(
        root, 'work', 'forge-executions', executionReceiptId,
        'continuation-runtime-evidence.json',
    );
}

function runtimeEvidenceValue(
    canonical: CanonicalForgeRequest,
    adapterRuntime: ForgeAdapterRuntimeProof,
): Record<string, unknown> {
    return {
        schema: 'cstar.forge_continuation_runtime_evidence.v1',
        adapter_ref: canonical.adapter_ref,
        adapter_runtime: adapterRuntime,
        hermes_runtime: canonical.hermes_runtime,
    };
}

export function ensureForgeContinuationRuntimeEvidence({
    root,
    execution_receipt_id,
    canonical,
    adapter_runtime,
}: {
    root: string;
    execution_receipt_id: string;
    canonical: CanonicalForgeRequest;
    adapter_runtime: ForgeAdapterRuntimeProof;
}): { path: string; sha256: string } {
    const destination = runtimeEvidencePath(root, execution_receipt_id);
    const directory = ensureSafeDirectoryTree(root, path.dirname(destination));
    const content = `${stableJson(runtimeEvidenceValue(canonical, adapter_runtime))}\n`;
    const existing = fs.lstatSync(destination, { throwIfNoEntry: false });
    if (existing) {
        assertSafePrivateArtifact(destination);
        const current = readBoundedUtf8FileInside(root, destination, RUNTIME_EVIDENCE_MAX_BYTES);
        if (current.content !== content) {
            atomicWritePrivateFile(directory, destination, content, true);
        }
    } else {
        publishPrivateFileNoClobber(directory, destination, content);
    }
    return { path: destination, sha256: sha256(content) };
}

export function verifyForgeContinuationRuntimeEvidence(
    root: string,
    executionReceiptId: string,
    canonical: CanonicalForgeRequest,
    adapterRuntime: ForgeAdapterRuntimeProof,
    artifacts: Map<string, string>,
): void {
    const evidencePath = runtimeEvidencePath(root, executionReceiptId);
    const expectedSha256 = artifacts.get(path.resolve(evidencePath));
    if (!expectedSha256) throw new Error('forge_continuation_runtime_evidence_missing');
    const evidence = readBoundedUtf8FileInside(
        root, evidencePath, RUNTIME_EVIDENCE_MAX_BYTES,
    );
    if (sha256(evidence.content) !== expectedSha256) {
        throw new Error('forge_continuation_runtime_evidence_drift');
    }
    let parsed: unknown;
    try { parsed = JSON.parse(evidence.content); } catch {
        throw new Error('forge_continuation_runtime_evidence_invalid');
    }
    if (stableJson(parsed) !== stableJson(runtimeEvidenceValue(canonical, adapterRuntime))) {
        throw new Error('forge_continuation_runtime_evidence_invalid');
    }
}

function captureRuntimeFile(root: string, candidate: string, role: string): RuntimeSnapshot {
    try {
        const captured = readSnapshot(root, candidate, HERMES_RUNTIME_FILE_MAX_BYTES);
        if (!captured.snapshot.exists || captured.directory || !captured.content
            || !captured.snapshot.sha256) throw new Error('unsafe');
        return {
            path: captured.snapshot.path,
            sha256: captured.snapshot.sha256,
            bytes: captured.snapshot.bytes,
            content: captured.content,
        };
    } catch {
        throw new Error(`forge_continuation_hermes_runtime_unvalidated:${role}`);
    }
}

function stableRuntimeRecord(
    root: string, proof: Pick<RuntimeSnapshot, 'path' | 'bytes' | 'sha256'>,
): string {
    const relative = path.relative(root, proof.path).split(path.sep).join('/');
    return `${relative}\0${proof.bytes}\0${proof.sha256}`;
}

function safeRuntimeRelative(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && !path.isAbsolute(value)
        && !value.split('/').some((item) => item === '' || item === '.' || item === '..')
        && path.normalize(value).split(path.sep).join('/') === value;
}

export function verifyForgeHermesRuntimeEvidence(
    canonical: CanonicalForgeRequest,
    adapterRuntime: ForgeAdapterRuntimeProof,
    artifacts: Map<string, string>,
): void {
    const expected = canonical.hermes_runtime;
    if (!expected) {
        if (canonical.adapter_ref === 'cstar-forge-hermes-minimax-worker-adapter') {
            throw new Error('forge_continuation_hermes_runtime_unvalidated:missing');
        }
        return;
    }
    if (expected.runtime_schema === 'synthetic_test_executable_v1') {
        const root = path.dirname(expected.locator_path);
        const executable = captureRuntimeFile(root, expected.locator_path, 'synthetic_executable');
        if (executable.sha256 !== expected.executable_sha256
            || executable.sha256 !== expected.runtime_content_sha256
            || executable.bytes !== expected.source_bytes
            || expected.source_file_count !== 1
            || expected.runtime_manifest_sha256 !== null
            || expected.python_sha256 !== null || expected.system_python_path !== null) {
            throw new Error('forge_continuation_hermes_runtime_unvalidated:synthetic_contract');
        }
        requireForgeContinuationArtifact(
            artifacts, executable.path, executable.sha256, 'hermes_executable',
        );
        return;
    }
    const runtimeRoot = path.resolve(expected.runtime_root);
    let rootStat: fs.Stats;
    try { rootStat = fs.lstatSync(runtimeRoot); } catch {
        throw new Error('forge_continuation_hermes_runtime_unvalidated:root');
    }
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()
        || !expected.runtime_manifest_sha256 || !expected.python_sha256
        || !expected.system_python_path
        || adapterRuntime.python_interpreter.path !== expected.system_python_path
        || adapterRuntime.python_interpreter.sha256 !== expected.python_sha256) {
        throw new Error('forge_continuation_hermes_runtime_unvalidated:contract');
    }
    const manifest = captureRuntimeFile(
        runtimeRoot, path.join(runtimeRoot, 'manifest.json'), 'manifest',
    );
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(manifest.content.toString('utf-8')); } catch {
        throw new Error('forge_continuation_hermes_runtime_unvalidated:manifest');
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.source_files)
        || !safeRuntimeRelative(parsed.launcher)
        || parsed.source_files.length !== expected.source_file_count
        || parsed.source_files.length < 1 || parsed.source_files.length > 32
        || parsed.source_files.some((item) => !safeRuntimeRelative(item))
        || new Set(parsed.source_files).size !== parsed.source_files.length
        || path.resolve(runtimeRoot, parsed.launcher) !== path.resolve(expected.locator_path)) {
        throw new Error('forge_continuation_hermes_runtime_unvalidated:manifest');
    }
    const launcher = captureRuntimeFile(runtimeRoot, expected.locator_path, 'launcher');
    const sources = parsed.source_files.map((relative) => captureRuntimeFile(
        runtimeRoot, path.join(runtimeRoot, relative as string), 'source',
    ));
    const sourceBytes = sources.reduce((total, item) => total + item.bytes, 0);
    const boundedBytes = manifest.bytes + launcher.bytes + sourceBytes;
    if (manifest.sha256 !== expected.runtime_manifest_sha256
        || launcher.sha256 !== expected.executable_sha256
        || sourceBytes !== expected.source_bytes
        || boundedBytes > HERMES_RUNTIME_TOTAL_MAX_BYTES) {
        throw new Error('forge_continuation_hermes_runtime_unvalidated:content');
    }
    const records = [manifest, launcher, adapterRuntime.python_interpreter, ...sources]
        .map((item) => stableRuntimeRecord(runtimeRoot, item)).sort();
    if (sha256(records.join('\n')) !== expected.runtime_content_sha256) {
        throw new Error('forge_continuation_hermes_runtime_unvalidated:content');
    }
    for (const [role, item] of [
        ['hermes_manifest', manifest], ['hermes_launcher', launcher],
        ...sources.map((item, index) => [`hermes_source_${index}`, item] as const),
    ] as const) requireForgeContinuationArtifact(artifacts, item.path, item.sha256, role);
}
