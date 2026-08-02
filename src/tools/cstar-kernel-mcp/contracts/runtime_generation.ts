import { createHash } from 'node:crypto';
import type {
    KernelRuntimeGenerationBinding,
    KernelRuntimeGenerationReceipt,
    RuntimeGenerationHandshakeRequest,
} from '../../../types/kernel_runtime_generation.js';
import { KERNEL_RUNTIME_GENERATION_SCHEMA } from '../../../types/kernel_runtime_generation.js';

export type RuntimePathPlatform = 'auto' | 'linux' | 'wsl' | 'darwin' | 'macos';
export type RuntimePathKind = 'relative' | 'posix' | 'windows' | 'wsl' | 'unc';
export type RuntimePathAlphabet = 'relative' | 'posix' | 'windows';

export interface RuntimePathClassification {
    absolute: boolean;
    alphabet: RuntimePathAlphabet;
    kind: RuntimePathKind;
    normalized: string;
}

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

function normalizedPathInput(input: string): string {
    if (typeof input !== 'string' || input.trim() === '' || input.includes('\0')) {
        throw new Error('runtime_path_invalid');
    }
    return input.trim();
}

function assertPlatform(platform: RuntimePathPlatform): void {
    if (!['auto', 'linux', 'wsl', 'darwin', 'macos'].includes(platform)) {
        throw new Error(`runtime_path_platform_invalid:${platform}`);
    }
}

function authority(value: string, field: string): string {
    if (!value || value === '.' || value === '..') {
        throw new Error(`runtime_path_authority_invalid:${field}`);
    }
    return value.toLowerCase();
}

function uncPath(server: string, share: string, suffix = ''): string {
    if (!share || share === '.' || share === '..') throw new Error('runtime_unc_share_invalid');
    return `unc://${authority(server, 'unc_server')}/${share}${absolutePath(suffix)}`;
}

/** Classify only after both slash alphabets have been normalized. */
export function classifyRuntimePath(
    input: string,
    platform: RuntimePathPlatform = 'auto',
): RuntimePathClassification {
    assertPlatform(platform);
    const value = normalizedPathInput(input);
    const canonicalUnc = /^unc:\/\/([^/]+)\/([^/]+)(?:\/(.*))?$/i.exec(value);
    if (canonicalUnc) {
        return {
            absolute: true,
            alphabet: 'windows',
            kind: 'unc',
            normalized: uncPath(canonicalUnc[1], canonicalUnc[2], canonicalUnc[3]),
        };
    }

    const canonical = /^(wsl|windows):\/\/([^/]+)(?:\/(.*))?$/i.exec(value);
    if (canonical) {
        const kind = canonical[1].toLowerCase() as 'wsl' | 'windows';
        if (kind === 'windows' && !/^[a-z]$/i.test(canonical[2])) {
            throw new Error('runtime_windows_drive_invalid');
        }
        return {
            absolute: true,
            alphabet: kind === 'windows' ? 'windows' : 'posix',
            kind,
            normalized: `${kind}://${authority(canonical[2], `${kind}_authority`)}${absolutePath(canonical[3] ?? '')}`,
        };
    }
    if (/^(?:wsl|windows|unc):\/\//i.test(value)) throw new Error('runtime_path_invalid');

    const hasUncAlphabet = value.startsWith('\\\\')
        || (value.startsWith('//') && !value.startsWith('///'));
    if (hasUncAlphabet) {
        const slashValue = value.replaceAll('\\', '/');
        if (/^\/\/[?.]\//.test(slashValue)) throw new Error('runtime_windows_device_path_forbidden');
        const wslUnc = /^\/\/wsl(?:\.localhost|\$)\/([^/]+)(?:\/(.*))?$/i.exec(slashValue);
        if (wslUnc) {
            return {
                absolute: true,
                alphabet: 'windows',
                kind: 'wsl',
                normalized: `wsl://${authority(wslUnc[1], 'wsl_distro')}${absolutePath(wslUnc[2] ?? '')}`,
            };
        }

        const unc = /^\/\/([^/]+)\/([^/]+)(?:\/(.*))?$/.exec(slashValue);
        if (unc) {
            return {
                absolute: true,
                alphabet: 'windows',
                kind: 'unc',
                normalized: uncPath(unc[1], unc[2], unc[3]),
            };
        }
        throw new Error('runtime_unc_path_invalid');
    }

    const drive = /^([a-z]):[\\/](.*)$/i.exec(value);
    if (drive) {
        const kind = platform === 'wsl' ? 'wsl' : 'windows';
        return {
            absolute: true,
            alphabet: 'windows',
            kind,
            normalized: `${kind}://${drive[1].toLowerCase()}${absolutePath(drive[2].replaceAll('\\', '/'))}`,
        };
    }
    if (/^[a-z]:/i.test(value)) throw new Error('runtime_windows_drive_relative_forbidden');
    if (value.startsWith('\\')) throw new Error('runtime_windows_root_relative_forbidden');

    const mountedDrive = /^\/mnt\/([a-z])(?:\/(.*))?$/i.exec(value);
    if (mountedDrive && (platform === 'auto' || platform === 'wsl')) {
        return {
            absolute: true,
            alphabet: 'posix',
            kind: 'wsl',
            normalized: `wsl://${mountedDrive[1].toLowerCase()}${absolutePath(mountedDrive[2] ?? '')}`,
        };
    }

    if (value.startsWith('/')) {
        return { absolute: true, alphabet: 'posix', kind: 'posix', normalized: absolutePath(value) };
    }
    return {
        absolute: false,
        alphabet: 'relative',
        kind: 'relative',
        normalized: relativePath(value),
    };
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
    const classified = classifyRuntimePath(input, platform);
    if (!classified.absolute) throw new Error('runtime_path_must_be_absolute');
    return classified.normalized;
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
    const root = classifyRuntimePath(codeRoot);
    if (!root.absolute) throw new Error('runtime_path_must_be_absolute');
    const file = classifyRuntimePath(filePath, root.kind === 'wsl' ? 'wsl' : 'auto');
    if (!file.absolute) {
        const normalizedFile = root.alphabet === 'windows'
            ? relativePath(normalizedPathInput(filePath).replaceAll('\\', '/'))
            : file.normalized;
        if (normalizedFile === '..' || normalizedFile.startsWith('../')) {
            fail(RUNTIME_GENERATION_ERROR_CODES.fingerprint_path);
        }
        return normalizedFile;
    }
    if (file.normalized === root.normalized) return '.';
    const prefix = root.normalized.endsWith('/') ? root.normalized : `${root.normalized}/`;
    if (!file.normalized.startsWith(prefix)) fail(RUNTIME_GENERATION_ERROR_CODES.fingerprint_path);
    return file.normalized.slice(prefix.length);
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
