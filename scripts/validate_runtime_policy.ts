import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
    RUNTIME_POLICY_PATH,
    assertSupportedNativeRuntime,
    loadRuntimePolicy,
} from '../src/tools/cstar-kernel-mcp/contracts/runtime_policy.js';

type JsonRecord = Record<string, any>;

function readJson(candidate: string): JsonRecord {
    return JSON.parse(fs.readFileSync(candidate, 'utf8')) as JsonRecord;
}

const root = path.dirname(RUNTIME_POLICY_PATH);
const policy = loadRuntimePolicy();
const packageJson = readJson(path.join(root, 'package.json'));
const packageLock = readJson(path.join(root, 'package-lock.json'));
const lockRoot = packageLock.packages?.[''] as JsonRecord | undefined;
const errors: string[] = [];

if (packageJson.engines?.node !== policy.node.version) errors.push('package_json_node_engine_drift');
if (lockRoot?.engines?.node !== policy.node.version) errors.push('package_lock_node_engine_drift');
if (packageJson.dependencies?.[policy.native.dependency] !== policy.native.version) {
    errors.push('package_json_native_dependency_drift');
}
if (lockRoot?.dependencies?.[policy.native.dependency] !== policy.native.version) {
    errors.push('package_lock_native_dependency_drift');
}
if (fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim() !== policy.node.version) {
    errors.push('nvmrc_runtime_drift');
}
try {
    const npmCommand = path.join(
        path.dirname(process.execPath),
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
    );
    if (execFileSync(npmCommand, ['--version'], { encoding: 'utf8' }).trim() !== policy.npm) {
        errors.push('npm_version_drift');
    }
} catch {
    errors.push('npm_version_unavailable');
}
try {
    assertSupportedNativeRuntime(policy);
} catch (error) {
    errors.push(error instanceof Error ? error.message : 'cstar_runtime_policy_mismatch');
}

if (errors.length > 0) {
    throw new Error(`cstar_runtime_policy_validation_failed:${[...new Set(errors)].join(',')}`);
}
console.log(`[cstar:runtime] OK Node ${policy.node.version} ABI ${policy.node.node_module_version} N-API ${policy.node.napi_version}; ${policy.native.dependency} ${policy.native.version}`);
