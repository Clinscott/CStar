import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type JsonRecord = Record<string, unknown>;

export interface RuntimePolicy {
    schema: 'cstar.node-runtime-policy.v1';
    node: {
        version: string;
        node_module_version: string;
        napi_version: string;
    };
    npm: string;
    native: {
        dependency: string;
        version: string;
        artifact: string;
    };
}

export interface RuntimeObservation {
    node_version: string;
    node_module_version: string | null;
    napi_version: string | null;
    native_package_version: string | null;
}

export interface RuntimePolicyCheck {
    schema: RuntimePolicy['schema'];
    policy_path: string;
    expected: RuntimeObservation;
    observed: RuntimeObservation;
    mismatches: string[];
    compatible: boolean;
}

const PACKAGE_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../',
);
export const RUNTIME_POLICY_PATH = path.join(PACKAGE_ROOT, 'runtime-policy.json');

function asRecord(value: unknown): JsonRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as JsonRecord
        : null;
}

function requiredString(record: JsonRecord, key: string): string | null {
    const value = record[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
}

export function parseRuntimePolicy(value: unknown, source = RUNTIME_POLICY_PATH): RuntimePolicy {
    const record = asRecord(value);
    const node = record ? asRecord(record.node) : null;
    const native = record ? asRecord(record.native) : null;
    const parsed = {
        schema: record ? requiredString(record, 'schema') : null,
        node: {
            version: node ? requiredString(node, 'version') : null,
            node_module_version: node ? requiredString(node, 'node_module_version') : null,
            napi_version: node ? requiredString(node, 'napi_version') : null,
        },
        npm: record ? requiredString(record, 'npm') : null,
        native: {
            dependency: native ? requiredString(native, 'dependency') : null,
            version: native ? requiredString(native, 'version') : null,
            artifact: native ? requiredString(native, 'artifact') : null,
        },
    };
    if (parsed.schema !== 'cstar.node-runtime-policy.v1'
        || !parsed.node.version
        || !parsed.node.node_module_version
        || !parsed.node.napi_version
        || !parsed.npm
        || !parsed.native.dependency
        || !parsed.native.version
        || !parsed.native.artifact) {
        throw new Error(`cstar_runtime_policy_invalid:${source}`);
    }
    return parsed as RuntimePolicy;
}

function safePolicyFile(candidate: string): boolean {
    const stat = fs.lstatSync(candidate, { throwIfNoEntry: false });
    return Boolean(stat && stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
}

export function loadRuntimePolicy(candidate = RUNTIME_POLICY_PATH): RuntimePolicy {
    if (!safePolicyFile(candidate)) throw new Error(`cstar_runtime_policy_file_unsafe:${candidate}`);
    try {
        return parseRuntimePolicy(JSON.parse(fs.readFileSync(candidate, 'utf8')) as unknown, candidate);
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('cstar_runtime_policy_')) throw error;
        throw new Error(`cstar_runtime_policy_unreadable:${candidate}`);
    }
}

function readPackageVersion(packageJsonPath: string): string | null {
    try {
        const stat = fs.lstatSync(packageJsonPath, { throwIfNoEntry: false });
        if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) return null;
        const record = asRecord(JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as unknown);
        return record ? requiredString(record, 'version') : null;
    } catch {
        return null;
    }
}

export function readNativePackageVersion(
    policy: RuntimePolicy,
    nodeModulesRoot?: string,
): string | null {
    if (nodeModulesRoot) {
        const dependencySegments = policy.native.dependency.split('/');
        if (dependencySegments.some((segment) => !segment || segment === '.' || segment === '..')) return null;
        return readPackageVersion(path.join(nodeModulesRoot, ...dependencySegments, 'package.json'));
    }
    try {
        const require = createRequire(import.meta.url);
        return readPackageVersion(require.resolve(`${policy.native.dependency}/package.json`));
    } catch {
        return null;
    }
}

export function currentRuntimeObservation(
    policy: RuntimePolicy = loadRuntimePolicy(),
    nodeModulesRoot?: string,
): RuntimeObservation {
    return {
        node_version: process.version.replace(/^v/, ''),
        node_module_version: process.versions.modules ?? null,
        napi_version: process.versions.napi ?? null,
        native_package_version: readNativePackageVersion(policy, nodeModulesRoot),
    };
}

export function evaluateRuntimePolicy(
    policy: RuntimePolicy,
    observed = currentRuntimeObservation(policy),
    policyPath = RUNTIME_POLICY_PATH,
): RuntimePolicyCheck {
    const expected: RuntimeObservation = {
        node_version: policy.node.version,
        node_module_version: policy.node.node_module_version,
        napi_version: policy.node.napi_version,
        native_package_version: policy.native.version,
    };
    const mismatches = (Object.keys(expected) as Array<keyof RuntimeObservation>)
        .filter((key) => expected[key] !== observed[key]);
    return {
        schema: policy.schema,
        policy_path: policyPath,
        expected,
        observed,
        mismatches,
        compatible: mismatches.length === 0,
    };
}

export function assertSupportedNativeRuntime(
    policy = loadRuntimePolicy(),
): RuntimePolicyCheck {
    const check = evaluateRuntimePolicy(policy, currentRuntimeObservation(policy));
    if (!check.compatible) {
        throw new Error(`cstar_runtime_policy_mismatch:${check.mismatches.join(',')}`);
    }
    return check;
}
