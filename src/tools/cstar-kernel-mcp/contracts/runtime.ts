import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveKernelMcpLaunchRoots } from '../../../../bin/cstar-kernel-mcp-env.js';
import {
    buildKernelRuntimeLineageForRoots,
    evaluateKernelForgeReadiness,
    evaluateKernelHostWorkCellReadiness,
    type KernelRuntimeLineage,
} from './runtime_lineage.js';
import {
    formatBootstrapErrorRecord as formatSharedBootstrapErrorRecord,
    logBootstrapError as logSharedBootstrapError,
} from '../../../../bin/cstar-kernel-mcp-bootstrap-log.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const DERIVED_CODE_ROOT = fs.realpathSync(path.resolve(__dirname, '../../../../'));

function resolveRuntimeRoots(): {
    codeRoot: string;
    controlRoot: string;
    bindingMode: 'live_launcher' | 'library_default';
} {
    if (process.env.CSTAR_KERNEL_MCP !== '1') {
        return {
            codeRoot: DERIVED_CODE_ROOT,
            controlRoot: DERIVED_CODE_ROOT,
            bindingMode: 'library_default',
        };
    }

    const suppliedCodeRoot = process.env.CSTAR_CODE_ROOT?.trim();
    if (!suppliedCodeRoot) throw new Error('kernel_code_root_missing');
    if (!path.isAbsolute(suppliedCodeRoot)) throw new Error('kernel_code_root_not_absolute');
    const suppliedCanonicalCodeRoot = fs.realpathSync(path.resolve(suppliedCodeRoot));
    if (
        suppliedCanonicalCodeRoot !== path.resolve(suppliedCodeRoot)
        || suppliedCanonicalCodeRoot !== DERIVED_CODE_ROOT
    ) {
        throw new Error('kernel_code_root_lineage_mismatch');
    }

    const roots = resolveKernelMcpLaunchRoots({
        codeRoot: suppliedCanonicalCodeRoot,
        controlRoot: process.env.CSTAR_CONTROL_ROOT,
    });
    if (
        process.env.CSTAR_PROJECT_ROOT !== roots.controlRoot
        || process.env.CSTAR_WORKSPACE_ROOT !== roots.controlRoot
    ) {
        throw new Error('kernel_control_root_alias_mismatch');
    }
    return {
        codeRoot: roots.codeRoot,
        controlRoot: roots.controlRoot,
        bindingMode: 'live_launcher',
    };
}

const RUNTIME_ROOTS = resolveRuntimeRoots();

export const CODE_ROOT = RUNTIME_ROOTS.codeRoot;
export const CONTROL_ROOT = RUNTIME_ROOTS.controlRoot;
/** Compatibility alias for state-owning callers. New source reads use CODE_ROOT. */
export const PROJECT_ROOT = CONTROL_ROOT;
export const KERNEL_ROOT_BINDING_MODE = RUNTIME_ROOTS.bindingMode;
export const HUB_KERNEL_VERSION = '1.0.0';
export const MCP_ERROR_MESSAGE_MAX = 512;
export const MCP_PROPOSAL_MAX_BYTES = 512 * 1024;
export const MCP_SAFE_PROPOSAL_ID = /^[a-zA-Z0-9._-]+$/;
export const MCP_LOG_DIR = path.join(PROJECT_ROOT, 'logs', 'mcp');
export const MCP_LOG_PATH = path.join(MCP_LOG_DIR, 'mcp_bootstrap_error.log');

export function buildKernelRuntimeLineage(): KernelRuntimeLineage {
    return buildKernelRuntimeLineageForRoots({
        codeRoot: CODE_ROOT,
        controlRoot: CONTROL_ROOT,
        bindingMode: KERNEL_ROOT_BINDING_MODE,
    });
}

export function assertLiveForgeRuntimeReady(): KernelRuntimeLineage {
    const lineage = buildKernelRuntimeLineage();
    const readiness = evaluateKernelForgeReadiness(lineage);
    if (!readiness.ready) {
        const testOnlyBypass = lineage.binding_mode === 'library_default'
            && Boolean(process.env.NODE_TEST_CONTEXT)
            && process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS === '1';
        if (testOnlyBypass) return { ...lineage, test_only_bypass: true };
        throw new Error(`forge_runtime_not_ready:${readiness.failures.join(',')}`);
    }
    return lineage;
}

export type ForgeRuntimeReadinessAssertion = () => { binding_sha256: string };

export function createStableForgeRuntimeReadinessAssertion(
    assertReady: ForgeRuntimeReadinessAssertion = assertLiveForgeRuntimeReady,
): ForgeRuntimeReadinessAssertion {
    let expectedBindingSha256: string | null = null;
    return () => {
        const lineage = assertReady();
        if (expectedBindingSha256 && lineage.binding_sha256 !== expectedBindingSha256) {
            throw new Error('forge_runtime_binding_drift');
        }
        expectedBindingSha256 = lineage.binding_sha256;
        return lineage;
    };
}

export function createForgeHandlerRuntimeReadinessAssertion(
    testOverride?: ForgeRuntimeReadinessAssertion,
): ForgeRuntimeReadinessAssertion {
    if (testOverride && !(
        KERNEL_ROOT_BINDING_MODE === 'library_default'
        && Boolean(process.env.NODE_TEST_CONTEXT)
        && process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS === '1'
    )) throw new Error('forge_runtime_test_assertion_forbidden');
    return createStableForgeRuntimeReadinessAssertion(testOverride);
}

export { evaluateKernelForgeReadiness, evaluateKernelHostWorkCellReadiness, type KernelRuntimeLineage } from './runtime_lineage.js';

export function isPathInside(child: string, parent: string): boolean {
    const resolvedChild = path.resolve(child);
    const resolvedParent = path.resolve(parent);
    if (resolvedChild === resolvedParent) {
        return true;
    }
    const rel = path.relative(resolvedParent, resolvedChild);
    return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function relativeInside(candidate: string, root: string): string | null {
    const relative = path.relative(root, candidate);
    if (relative === '') return '';
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
    return relative;
}

function rejectSymlinkSegments(root: string, relative: string): void {
    let current = root;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink()) {
            throw new Error(`path_symlink_forbidden:${current}`);
        }
    }
}

export function resolveExistingPathInside(
    root: string,
    candidate: string,
    kind: 'any' | 'file' | 'directory' = 'any',
): string {
    const lexicalRoot = path.resolve(root);
    const lexicalCandidate = path.resolve(candidate);
    const relative = relativeInside(lexicalCandidate, lexicalRoot);
    if (relative === null) throw new Error(`path_outside_root:${candidate}`);
    const canonicalRoot = fs.realpathSync(lexicalRoot);
    const rootedCandidate = path.join(canonicalRoot, relative);
    rejectSymlinkSegments(canonicalRoot, relative);
    const canonicalCandidate = fs.realpathSync(rootedCandidate);
    if (relativeInside(canonicalCandidate, canonicalRoot) === null) {
        throw new Error(`path_outside_root:${candidate}`);
    }
    const stat = fs.lstatSync(canonicalCandidate);
    if (stat.isSymbolicLink()) throw new Error(`path_symlink_forbidden:${candidate}`);
    if (kind === 'file' && !stat.isFile()) throw new Error(`path_not_regular_file:${candidate}`);
    if (kind === 'directory' && !stat.isDirectory()) throw new Error(`path_not_directory:${candidate}`);
    return canonicalCandidate;
}

export function resolveExistingRelativePathInside(
    root: string,
    relativePath: string,
    kind: 'any' | 'file' | 'directory' = 'any',
): string {
    return resolveProspectiveRelativePathInside(root, relativePath, true, kind);
}

export function resolveProspectiveRelativePathInside(
    root: string,
    relativePath: string,
    mustExist = false,
    kind: 'any' | 'file' | 'directory' = 'any',
): string {
    if (!relativePath || relativePath.includes('\0') || path.isAbsolute(relativePath)) {
        throw new Error(`path_must_be_safe_relative:${relativePath}`);
    }
    const normalized = path.normalize(relativePath);
    if (normalized === '.' || relativeInside(path.resolve(root, normalized), path.resolve(root)) === null) {
        throw new Error(`path_must_be_safe_relative:${relativePath}`);
    }
    const canonicalRoot = fs.realpathSync(path.resolve(root));
    const segments = normalized.split(path.sep).filter(Boolean);
    let current = canonicalRoot;
    let missing = false;
    for (const segment of segments) {
        current = path.join(current, segment);
        if (missing || !fs.existsSync(current)) {
            missing = true;
            continue;
        }
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink()) throw new Error(`path_symlink_forbidden:${relativePath}`);
    }
    if (mustExist && missing) throw new Error(`path_not_found:${relativePath}`);
    if (mustExist) return resolveExistingPathInside(canonicalRoot, current, kind);
    if (relativeInside(current, canonicalRoot) === null) throw new Error(`path_outside_root:${relativePath}`);
    return current;
}

export function readBoundedUtf8FileInside(
    root: string,
    candidate: string,
    maxBytes: number,
): { path: string; content: string; size: number; mtimeMs: number } {
    const resolved = resolveExistingPathInside(root, candidate, 'file');
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
    const fd = fs.openSync(resolved, flags);
    try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile()) throw new Error(`path_not_regular_file:${candidate}`);
        if (stat.nlink !== 1) throw new Error(`path_hardlink_forbidden:${candidate}`);
        if (stat.size > maxBytes) throw new Error(`path_size_limit_exceeded:${stat.size}:${maxBytes}`);
        return {
            path: resolved,
            content: fs.readFileSync(fd, 'utf-8'),
            size: stat.size,
            mtimeMs: stat.mtimeMs,
        };
    } finally {
        fs.closeSync(fd);
    }
}

export function readBoundedFileInside(
    root: string,
    candidate: string,
    maxBytes: number,
): { path: string; content: Buffer; size: number; mtimeMs: number } {
    const resolved = resolveExistingPathInside(root, candidate, 'file');
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
    const fd = fs.openSync(resolved, flags);
    try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile()) throw new Error(`path_not_regular_file:${candidate}`);
        if (stat.nlink !== 1) throw new Error(`path_hardlink_forbidden:${candidate}`);
        if (stat.size > maxBytes) throw new Error(`path_size_limit_exceeded:${stat.size}:${maxBytes}`);
        return {
            path: resolved,
            content: fs.readFileSync(fd),
            size: stat.size,
            mtimeMs: stat.mtimeMs,
        };
    } finally {
        fs.closeSync(fd);
    }
}

export const formatBootstrapErrorRecord = formatSharedBootstrapErrorRecord;

export function logBootstrapError(error: unknown): void {
    logSharedBootstrapError(PROJECT_ROOT, error);
}
