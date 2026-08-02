import { createHash } from 'node:crypto';
import type {
    KernelRuntimeGenerationBinding,
    KernelRuntimeGenerationReceipt,
    RuntimeGenerationHandshakeRequest,
} from '../../../types/kernel_runtime_generation.js';
import { KERNEL_RUNTIME_GENERATION_SCHEMA } from '../../../types/kernel_runtime_generation.js';

export type RuntimePathPlatform = 'auto' | 'linux' | 'wsl' | 'darwin' | 'macos';

export const RUNTIME_GENERATION_ERROR_CODES = {
    invalid_receipt: 'kernel_runtime_generation_receipt_invalid',
    stale: 'stale_runtime_generation',
    code_root_mismatch: 'kernel_runtime_generation_code_root_mismatch',
    source_mismatch: 'kernel_runtime_generation_source_fingerprint_mismatch',
    package_mismatch: 'kernel_runtime_generation_package_fingerprint_mismatch',
    launch_nonce_mismatch: 'kernel_runtime_generation_launch_nonce_mismatch',
    non_monotonic: 'kernel_runtime_generation_not_monotonic',
    replay_forbidden: 'kernel_runtime_generation_replay_forbidden',
    fingerprint_path: 'runtime_fingerprint_path_outside_code_root',
} as const;

export type RuntimeGenerationErrorCode =
    typeof RUNTIME_GENERATION_ERROR_CODES[keyof typeof RUNTIME_GENERATION_ERROR_CODES];

export class KernelRuntimeGenerationError extends Error {
    readonly code: RuntimeGenerationErrorCode;
    readonly details: Record<string, unknown>;

    constructor(code: RuntimeGenerationErrorCode, details: Record<string, unknown> = {}) {
        const suffix = Object.entries(details)
            .map(([key, value]) => `${key}=${String(value)}`)
            .join(':');
        super(suffix ? `${code}:${suffix}` : code);
        this.name = 'KernelRuntimeGenerationError';
        this.code = code;
        this.details = { ...details };
    }
}

function fail(code: RuntimeGenerationErrorCode, details: Record<string, unknown> = neverDetails()): never {
    throw new KernelRuntimeGenerationError(code, details);
}

function neverDetails(): Record<string, unknown> {
    return {};
}

function normalizedSegments(value: string, absolute: boolean): string[] {
    const segments: string[] = [];
    for (const segment of value.split('/')) {
        if (!segment || segment === '.') continue;
        if (segment === '..') {
            if (segments.length > 0 && segments[segments.length - 1] !== '..') {
                segments.pop();
            } else if (!absolute) {
                segments.push(segment);
            }
            continue;
        }
        segments.push(segment);
    }
    return segments;
}

function absolutePath(value: string): string {
    const segments = normalizedSegments(value, true);
    return segments.length > 0 ? `/${segments.join('/')}` : '/';
}

function relativePath(value: string): string {
    const segments = normalizedSegments(value, false);
    return segments.length > 0 ? segments.join('/') : '.';
}

function isWindowsDrivePath(value: string): boolean {
    return /^[a-z]:(?:\/|$)/i.test(value);
}

function isAbsolutePath(value: string): boolean {
    return value.startsWith('/')
        || isWindowsDrivePath(value)
        || /^(?:wsl|windows):\/\//i.test(value);
}

/**
 * Normalize paths without using the host OS path rules.  WSL UNC paths and
 * mounted Windows volumes receive a stable `wsl://` identity; Linux and macOS
 * roots remain POSIX paths, independent of the machine running the checker.
 */
export function normalizeRuntimePath(
    input: string,
    platform: RuntimePathPlatform = 'auto',
): string {
    if (typeof input !== 'string' || input.trim() === '' || input.includes('\0')) {
        throw new Error('runtime_path_invalid');
    }
    const value = input.trim().replaceAll('\\', '/');
    const canonical = /^(wsl|windows):\/\/([^/]+)(?:\/(.*))?$/i.exec(value);
    if (canonical) {
        return `${canonical[1].toLowerCase()}://${canonical[2].toLowerCase()}${absolutePath(canonical[3] ?? '')}`;
    }
    const wslUnc = /^\/\/wsl(?:\.localhost|\$)\/([^/]+)(?:\/(.*))?$/i.exec(value);
    if (wslUnc) {
        const distro = relativePath(wslUnc[1]).toLowerCase();
        return `wsl://${distro}${absolutePath(wslUnc[2] ?? '')}`;
    }

    const drive = /^([a-z]):(?:\/(.*))?$/i.exec(value);
    if (drive) {
        const scheme = platform === 'wsl' ? 'wsl' : 'windows';
        return `${scheme}://${drive[1].toLowerCase()}${absolutePath(drive[2] ?? '')}`;
    }

    const mountedDrive = /^\/mnt\/([a-z])(?:\/(.*))?$/i.exec(value);
    if (mountedDrive && (platform === 'auto' || platform === 'wsl')) {
        return `wsl://${mountedDrive[1].toLowerCase()}${absolutePath(mountedDrive[2] ?? '')}`;
    }

    if (!value.startsWith('/')) throw new Error('runtime_path_must_be_absolute');
    if (platform !== 'auto' && !['linux', 'wsl', 'darwin', 'macos'].includes(platform)) {
        throw new Error(`runtime_path_platform_invalid:${platform}`);
    }
    return absolutePath(value);
}

export const normalizeCodeRoot = normalizeRuntimePath;

export function sha256(value: string | Uint8Array): string {
    return createHash('sha256').update(value).digest('hex');
}

export function buildCodeRootIdentity(codeRoot: string): string {
    const normalized = normalizeRuntimePath(codeRoot);
    return sha256(`cstar.kernel_runtime_generation.code_root.v1\0${normalized}`);
}

export interface RuntimeFingerprintFile {
    path: string;
    content: string | Uint8Array;
}

function fingerprintPath(filePath: string, codeRoot?: string): string {
    if (!codeRoot) return normalizeRuntimePath(filePath);
    const normalizedRoot = normalizeRuntimePath(codeRoot);
    const normalizedFile = isAbsolutePath(filePath)
        ? normalizeRuntimePath(filePath)
        : relativePath(filePath);
    if (!isAbsolutePath(filePath)) {
        if (normalizedFile === '..' || normalizedFile.startsWith('../')) {
            fail(RUNTIME_GENERATION_ERROR_CODES.fingerprint_path);
        }
        return normalizedFile;
    }
    if (normalizedFile === normalizedRoot) return '.';
    const prefix = normalizedRoot.endsWith('/') ? normalizedRoot : `${normalizedRoot}/`;
    if (!normalizedFile.startsWith(prefix)) fail(RUNTIME_GENERATION_ERROR_CODES.fingerprint_path);
    return normalizedFile.slice(prefix.length);
}

/** Build a stable content fingerprint from sorted relative paths and bytes. */
export function fingerprintRuntimeFiles(
    files: readonly RuntimeFingerprintFile[],
    codeRoot?: string,
): string {
    if (files.length === 0) return sha256('cstar.kernel_runtime_generation.empty_fingerprint.v1');
    const entries = files
        .map((file) => ({ path: fingerprintPath(file.path, codeRoot), content: file.content }))
        .sort((left, right) => left.path.localeCompare(right.path));
    const digest = createHash('sha256');
    digest.update('cstar.kernel_runtime_generation.files.v1\0');
    for (const entry of entries) {
        const bytes = typeof entry.content === 'string'
            ? Buffer.from(entry.content, 'utf8')
            : Buffer.from(entry.content);
        digest.update(entry.path);
        digest.update('\0');
        digest.update(String(bytes.byteLength));
        digest.update('\0');
        digest.update(bytes);
        digest.update('\0');
    }
    return digest.digest('hex');
}

function requiredText(name: string, value: unknown): string {
    if (typeof value !== 'string' || value.trim() === '') fail(
        RUNTIME_GENERATION_ERROR_CODES.invalid_receipt,
        { field: name },
    );
    return value.trim();
}

export function buildKernelRuntimeGenerationReceipt(
    request: RuntimeGenerationHandshakeRequest,
): KernelRuntimeGenerationReceipt {
    const codeRoot = normalizeRuntimePath(request.code_root);
    const generation = request.generation ?? 1;
    if (!Number.isSafeInteger(generation) || generation < 1) fail(
        RUNTIME_GENERATION_ERROR_CODES.invalid_receipt,
        { field: 'generation', value: generation },
    );
    const issuedAt = request.issued_at ?? Date.now();
    if (!Number.isFinite(issuedAt) || issuedAt < 0) fail(
        RUNTIME_GENERATION_ERROR_CODES.invalid_receipt,
        { field: 'issued_at', value: issuedAt },
    );
    return {
        schema: KERNEL_RUNTIME_GENERATION_SCHEMA,
        code_root: codeRoot,
        code_root_identity: requiredText(
            'code_root_identity',
            request.code_root_identity ?? buildCodeRootIdentity(codeRoot),
        ),
        source_fingerprint: requiredText('source_fingerprint', request.source_fingerprint),
        package_fingerprint: requiredText('package_fingerprint', request.package_fingerprint),
        launch_nonce: requiredText('launch_nonce', request.launch_nonce),
        generation,
        issued_at: issuedAt,
    };
}

export function assertKernelRuntimeGenerationReceipt(
    receipt: KernelRuntimeGenerationReceipt,
): KernelRuntimeGenerationReceipt {
    if (!receipt || receipt.schema !== KERNEL_RUNTIME_GENERATION_SCHEMA) fail(
        RUNTIME_GENERATION_ERROR_CODES.invalid_receipt,
        { field: 'schema' },
    );
    const rebuilt = buildKernelRuntimeGenerationReceipt({
        code_root: receipt.code_root,
        code_root_identity: receipt.code_root_identity,
        source_fingerprint: receipt.source_fingerprint,
        package_fingerprint: receipt.package_fingerprint,
        launch_nonce: receipt.launch_nonce,
        generation: receipt.generation,
        issued_at: receipt.issued_at,
    });
    if (rebuilt.code_root !== receipt.code_root) fail(
        RUNTIME_GENERATION_ERROR_CODES.invalid_receipt,
        { field: 'code_root' },
    );
    return { ...rebuilt };
}

export function runtimeGenerationBindingMismatches(
    expected: KernelRuntimeGenerationBinding,
    actual: KernelRuntimeGenerationReceipt,
): string[] {
    const mismatches: string[] = [];
    if (expected.code_root && normalizeRuntimePath(expected.code_root) !== actual.code_root) {
        mismatches.push('code_root');
    }
    if (expected.code_root_identity && expected.code_root_identity !== actual.code_root_identity) {
        mismatches.push('code_root_identity');
    }
    if (expected.source_fingerprint && expected.source_fingerprint !== actual.source_fingerprint) {
        mismatches.push('source_fingerprint');
    }
    if (expected.package_fingerprint && expected.package_fingerprint !== actual.package_fingerprint) {
        mismatches.push('package_fingerprint');
    }
    if (expected.launch_nonce && expected.launch_nonce !== actual.launch_nonce) {
        mismatches.push('launch_nonce');
    }
    if (expected.generation !== undefined && expected.generation !== actual.generation) {
        mismatches.push('generation');
    }
    return mismatches;
}

export function assertRuntimeGenerationBinding(
    actual: KernelRuntimeGenerationReceipt,
    expected: KernelRuntimeGenerationBinding,
): void {
    const mismatches = runtimeGenerationBindingMismatches(expected, actual);
    const field = mismatches[0];
    if (!field) return;
    const code = field === 'generation'
        ? RUNTIME_GENERATION_ERROR_CODES.stale
        : field === 'source_fingerprint'
        ? RUNTIME_GENERATION_ERROR_CODES.source_mismatch
        : field === 'package_fingerprint'
            ? RUNTIME_GENERATION_ERROR_CODES.package_mismatch
            : field === 'launch_nonce'
                ? RUNTIME_GENERATION_ERROR_CODES.launch_nonce_mismatch
                : RUNTIME_GENERATION_ERROR_CODES.code_root_mismatch;
    throw new KernelRuntimeGenerationError(code, {
        field,
        ...(field === 'generation' ? { expected_generation: expected.generation, actual_generation: actual.generation } : {}),
    });
}

export function assertExpectedGeneration(
    actual: Pick<KernelRuntimeGenerationReceipt, 'generation'>,
    expectedGeneration: number | undefined,
): void {
    if (expectedGeneration === undefined) return;
    if (expectedGeneration !== actual.generation) {
        throw new KernelRuntimeGenerationError(RUNTIME_GENERATION_ERROR_CODES.stale, {
            expected_generation: expectedGeneration,
            actual_generation: actual.generation,
        });
    }
}
