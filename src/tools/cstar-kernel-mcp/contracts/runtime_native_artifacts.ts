import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type JsonRecord = Record<string, unknown>;

export type NativeBinaryFormat = 'elf' | 'mach_o' | 'pe';

export interface NativeArtifactEvidence {
    dependency_name: string;
    package_lock_key: string;
    relative_path: string;
    status: 'verified_platform_binary' | 'missing' | 'unsafe' | 'invalid_binary' | 'invalid_size';
    runtime_smoke: 'verified' | 'failed' | 'not_run';
    sha256: string | null;
    bytes: number | null;
    binary_format: NativeBinaryFormat | null;
}

export interface NativeArtifactProof {
    contract: 'verified_required_native_artifacts' | 'partial';
    required_artifacts: number;
    verified_artifacts: number;
    artifacts: NativeArtifactEvidence[];
    mismatch_reasons: string[];
}

const REQUIREMENTS = [{
    dependency_name: 'better-sqlite3',
    package_lock_key: 'node_modules/better-sqlite3',
    relative_path: 'build/Release/better_sqlite3.node',
}] as const;
const MAX_NATIVE_ARTIFACT_BYTES = 64 * 1024 * 1024;

function asRecord(value: unknown): JsonRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as JsonRecord
        : null;
}

function machineMatches(format: NativeBinaryFormat, machine: number): boolean {
    if (format === 'elf') {
        return machine === ({ x64: 0x3e, arm64: 0xb7, ia32: 0x03, arm: 0x28 } as Record<string, number>)[process.arch];
    }
    if (format === 'pe') {
        return machine === ({ x64: 0x8664, arm64: 0xaa64, ia32: 0x014c, arm: 0x01c4 } as Record<string, number>)[process.arch];
    }
    return machine === ({
        x64: 0x01000007,
        arm64: 0x0100000c,
        ia32: 0x00000007,
        arm: 0x0000000c,
    } as Record<string, number>)[process.arch];
}

function inspectElf(content: Buffer): NativeBinaryFormat | null {
    if (process.platform !== 'linux' || content.length < 20
        || !content.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) return null;
    const littleEndian = content[5] === 1;
    const bigEndian = content[5] === 2;
    if ((content[4] !== 1 && content[4] !== 2) || (!littleEndian && !bigEndian)) return null;
    const machine = littleEndian ? content.readUInt16LE(18) : content.readUInt16BE(18);
    return machineMatches('elf', machine) ? 'elf' : null;
}

function inspectPe(content: Buffer): NativeBinaryFormat | null {
    if (process.platform !== 'win32' || content.length < 64
        || content[0] !== 0x4d || content[1] !== 0x5a) return null;
    const header = content.readUInt32LE(0x3c);
    if (header + 6 > content.length
        || !content.subarray(header, header + 4).equals(Buffer.from([0x50, 0x45, 0, 0]))) return null;
    return machineMatches('pe', content.readUInt16LE(header + 4)) ? 'pe' : null;
}

function inspectMachO(content: Buffer): NativeBinaryFormat | null {
    if (process.platform !== 'darwin' || content.length < 8) return null;
    const magic = content.readUInt32BE(0);
    const littleEndian = magic === 0xcefaedfe || magic === 0xcffaedfe;
    const bigEndian = magic === 0xfeedface || magic === 0xfeedfacf;
    if (!littleEndian && !bigEndian) return null;
    const machine = littleEndian ? content.readUInt32LE(4) : content.readUInt32BE(4);
    return machineMatches('mach_o', machine) ? 'mach_o' : null;
}

function inspectPlatformBinary(content: Buffer): NativeBinaryFormat | null {
    return inspectElf(content) ?? inspectPe(content) ?? inspectMachO(content);
}

function resolveArtifact(nodeModulesRoot: string, lockKey: string, relativePath: string): {
    status: 'found' | 'missing' | 'unsafe';
    path: string | null;
} {
    const packageSegments = lockKey.split('/');
    if (packageSegments.shift() !== 'node_modules' || packageSegments.length === 0) {
        return { status: 'unsafe', path: null };
    }
    const artifactSegments = relativePath.split('/');
    const segments = [...packageSegments, ...artifactSegments];
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
        return { status: 'unsafe', path: null };
    }
    const rootStat = fs.lstatSync(nodeModulesRoot, { throwIfNoEntry: false });
    if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) return { status: 'unsafe', path: null };
    const canonicalRoot = fs.realpathSync(nodeModulesRoot);
    let candidate = nodeModulesRoot;
    for (const [index, segment] of segments.entries()) {
        candidate = path.join(candidate, segment);
        const stat = fs.lstatSync(candidate, { throwIfNoEntry: false });
        if (!stat) return { status: 'missing', path: null };
        if (stat.isSymbolicLink()) return { status: 'unsafe', path: null };
        const last = index === segments.length - 1;
        if ((!last && !stat.isDirectory()) || (last && (!stat.isFile() || stat.nlink !== 1))) {
            return { status: 'unsafe', path: null };
        }
    }
    const canonical = fs.realpathSync(candidate);
    const relative = path.relative(canonicalRoot, canonical);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)
        || canonical !== path.resolve(candidate)) return { status: 'unsafe', path: null };
    return { status: 'found', path: candidate };
}

function inspectArtifact(candidate: string): Omit<NativeArtifactEvidence,
    'dependency_name' | 'package_lock_key' | 'relative_path' | 'runtime_smoke'> {
    const noFollow = fs.constants.O_NOFOLLOW ?? 0;
    let descriptor: number | null = null;
    try {
        const before = fs.lstatSync(candidate);
        descriptor = fs.openSync(candidate, fs.constants.O_RDONLY | noFollow);
        const stat = fs.fstatSync(descriptor);
        if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1
            || !stat.isFile() || stat.nlink !== 1
            || before.dev !== stat.dev || before.ino !== stat.ino || before.size !== stat.size) {
            return { status: 'unsafe', sha256: null, bytes: null, binary_format: null };
        }
        if (stat.size <= 0 || stat.size > MAX_NATIVE_ARTIFACT_BYTES) {
            return { status: 'invalid_size', sha256: null, bytes: stat.size, binary_format: null };
        }
        const content = Buffer.alloc(stat.size);
        let offset = 0;
        while (offset < content.length) {
            const read = fs.readSync(descriptor, content, offset, content.length - offset, offset);
            if (read === 0) break;
            offset += read;
        }
        if (offset !== content.length) {
            return { status: 'unsafe', sha256: null, bytes: null, binary_format: null };
        }
        const after = fs.fstatSync(descriptor);
        if (after.dev !== stat.dev || after.ino !== stat.ino || after.size !== stat.size
            || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) {
            return { status: 'unsafe', sha256: null, bytes: null, binary_format: null };
        }
        const binaryFormat = inspectPlatformBinary(content);
        if (!binaryFormat) {
            return { status: 'invalid_binary', sha256: null, bytes: content.length, binary_format: null };
        }
        return {
            status: 'verified_platform_binary',
            sha256: createHash('sha256').update(content).digest('hex'),
            bytes: content.length,
            binary_format: binaryFormat,
        };
    } catch {
        return { status: 'unsafe', sha256: null, bytes: null, binary_format: null };
    } finally {
        if (descriptor !== null) fs.closeSync(descriptor);
    }
}

export type NativeRuntimeSmoke = (args: {
    artifactPath: string;
    packageRoot: string;
}) => boolean;

function runBetterSqliteRuntimeSmoke(args: {
    artifactPath: string;
    packageRoot: string;
}): boolean {
    const childEnvironment: NodeJS.ProcessEnv = {
        HOME: os.tmpdir(),
        LANG: 'C',
        LC_ALL: 'C',
        NODE_NO_WARNINGS: '1',
        PATH: path.dirname(process.execPath),
    };
    for (const key of ['ComSpec', 'PATHEXT', 'SystemRoot', 'WINDIR']) {
        if (process.env[key]) childEnvironment[key] = process.env[key];
    }
    const source = [
        "const Database = require(process.argv[1]);",
        "const db = new Database(':memory:');",
        "try {",
        "  const row = db.prepare('SELECT 1 AS value').get();",
        "  if (!row || row.value !== 1) process.exitCode = 17;",
        "} finally { db.close(); }",
    ].join('\n');
    const result = spawnSync(process.execPath, ['--no-warnings', '--eval', source, args.packageRoot], {
        cwd: args.packageRoot,
        env: childEnvironment,
        timeout: 5_000,
        stdio: 'ignore',
        windowsHide: true,
    });
    return !result.error && result.signal === null && result.status === 0;
}

export function verifyRequiredNativeArtifacts(args: {
    nodeModulesRoot: string;
    sourceManifest: JsonRecord;
    expectedPackages: JsonRecord;
    installedPackages: JsonRecord;
}, smoke: NativeRuntimeSmoke = runBetterSqliteRuntimeSmoke): NativeArtifactProof {
    const artifacts: NativeArtifactEvidence[] = [];
    const reasons: string[] = [];
    const declaredDependencies = asRecord(args.sourceManifest.dependencies) ?? {};
    const activeRequirements = REQUIREMENTS.filter(
        (requirement) => typeof declaredDependencies[requirement.dependency_name] === 'string',
    );
    for (const requirement of activeRequirements) {
        const label = `${requirement.package_lock_key}/${requirement.relative_path}`;
        if (!asRecord(args.expectedPackages[requirement.package_lock_key])) {
            reasons.push(`required_native_package_lock_entry_missing:${requirement.package_lock_key}`);
            artifacts.push({ ...requirement, status: 'missing', runtime_smoke: 'not_run', sha256: null, bytes: null, binary_format: null });
            continue;
        }
        if (!asRecord(args.installedPackages[requirement.package_lock_key])) {
            reasons.push(`required_native_package_install_entry_missing:${requirement.package_lock_key}`);
            artifacts.push({ ...requirement, status: 'missing', runtime_smoke: 'not_run', sha256: null, bytes: null, binary_format: null });
            continue;
        }
        const resolved = resolveArtifact(
            args.nodeModulesRoot, requirement.package_lock_key, requirement.relative_path,
        );
        if (resolved.status !== 'found' || !resolved.path) {
            const status = resolved.status === 'missing' ? 'missing' : 'unsafe';
            reasons.push(`required_native_artifact_${status}:${label}`);
            artifacts.push({ ...requirement, status, runtime_smoke: 'not_run', sha256: null, bytes: null, binary_format: null });
            continue;
        }
        const evidence = inspectArtifact(resolved.path);
        const packageRoot = path.join(
            args.nodeModulesRoot,
            ...requirement.package_lock_key.split('/').slice(1),
        );
        const smokeVerified = evidence.status === 'verified_platform_binary'
            && smoke({ artifactPath: resolved.path, packageRoot });
        artifacts.push({
            ...requirement,
            ...evidence,
            runtime_smoke: smokeVerified ? 'verified' : evidence.status === 'verified_platform_binary'
                ? 'failed' : 'not_run',
        });
        if (evidence.status !== 'verified_platform_binary') {
            const detail = evidence.status === 'invalid_size' ? 'size_invalid' : evidence.status;
            reasons.push(`required_native_artifact_${detail}:${label}`);
        } else if (!smokeVerified) {
            reasons.push(`required_native_artifact_smoke_failed:${label}`);
        }
    }
    const verified = artifacts.filter((artifact) => artifact.runtime_smoke === 'verified').length;
    return {
        contract: reasons.length === 0 ? 'verified_required_native_artifacts' : 'partial',
        required_artifacts: activeRequirements.length,
        verified_artifacts: verified,
        artifacts,
        mismatch_reasons: reasons,
    };
}
