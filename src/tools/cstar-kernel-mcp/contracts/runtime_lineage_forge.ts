import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type JsonRecord = Record<string, unknown>;

export const HOST_RUNTIME_MANIFEST_RELATIVE =
    '.agents/skills/corvus-forge/runtime/host-manifest.json';
export const HOST_RUNTIME_SCHEMA_RELATIVE =
    '.agents/skills/corvus-forge/runtime/host-manifest.schema.json';
export const HOST_RUNTIME_GENERATOR_RELATIVE =
    '.agents/skills/corvus-forge/scripts/codex_host_runtime_lineage.mjs';
export const LEGACY_RUNTIME_MANIFEST_RELATIVE =
    '.agents/skills/corvus-forge/runtime/manifest.json';

const HOST_MANIFEST_KEYS = [
    'actual_identity', 'cognition_launch', 'cstar_launch', 'generator_path', 'hash_algorithm',
    'host_launch_required',
    'manifest_schema_path', 'network_policy', 'proof_files',
    'provider_attempted',
    'receipt_schema', 'requested_model', 'requested_reasoning', 'runner_owner',
    'runtime_owner', 'schema', 'selector_status', 'transport', 'workflow_surfaces',
].sort();

const LEGACY_MANIFEST_KEYS = [
    'allow_arbitrary_source_root', 'bootstrap_mode', 'credential_profile',
    'credential_profile_owner', 'dependency_mode', 'launcher', 'model',
    'network_entrypoint', 'oauth_read_only', 'oauth_refresh_allowed',
    'oauth_store_write_allowed', 'provider', 'runtime_owner', 'schema',
    'source_files',
].sort();

const HOST_PROOF_FILES = [
    'runtime/host-manifest.json',
    'runtime/host-manifest.schema.json',
    'scripts/codex_host_runtime_lineage.mjs',
] as const;

const LEGACY_SCHEMA = 'cstar.forge_private_runtime_manifest.v2';

export interface RuntimeFileProof {
    path: string;
    sha256: string;
    bytes: number;
}

export interface ForgeHostRuntimeReceipt {
    schema: 'cstar.forge_host_runtime_receipt.v2';
    manifest_sha256: string;
    manifest_bytes: number;
    schema_sha256: string;
    schema_bytes: number;
    generator_sha256: string;
    generator_bytes: number;
    content_sha256: string;
    runner_owner: 'codex-host';
    requested_model: 'gpt-5.6-luna';
    requested_reasoning: 'max';
    selector_status: 'enforced';
    actual_identity: string | null;
    transport: 'codex-host';
    host_launch_required: true;
    provider_attempted: false;
    provider_requests_started: 0;
    network_accessed: false;
    cognition_launch: false;
    cstar_launch: false;
}

export interface RuntimeForgeProof {
    contract: 'verified_manifest_content' | 'partial';
    actionable: boolean;
    manifest_version: 'host_v2' | 'legacy_v1' | 'unknown';
    manifest_path: string | null;
    manifest_sha256: string | null;
    schema_sha256: string | null;
    generator_sha256: string | null;
    launcher_sha256: string | null;
    source_files: RuntimeFileProof[];
    proof_files: RuntimeFileProof[];
    content_sha256: string | null;
    receipt: ForgeHostRuntimeReceipt | null;
    receipt_sha256: string | null;
    runner_owner: 'codex-host' | 'legacy-hermes' | null;
    requested_model: 'gpt-5.6-luna' | 'MiniMax-M3' | null;
    requested_reasoning: 'max' | null;
    selector_status: 'enforced' | 'unreported' | 'invalid' | null;
    actual_identity: string | null;
    transport: 'codex-host' | 'legacy-hermes' | null;
    executable_launcher_present: boolean;
    mismatch_reasons: string[];
}

function sha256(value: Buffer | string): string {
    return createHash('sha256').update(value).digest('hex');
}

function asRecord(value: unknown): JsonRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as JsonRecord
        : null;
}

function stableValue(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
    const record = asRecord(value);
    if (!record) return JSON.stringify(value);
    return `{${Object.keys(record).sort().map((key) => (
        `${JSON.stringify(key)}:${stableValue(record[key])}`
    )).join(',')}}`;
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
    return stableValue(Object.keys(value).sort()) === stableValue(expected);
}

function hashRegularFile(candidate: string, relativePath: string): RuntimeFileProof | null {
    const stat = fs.lstatSync(candidate, { throwIfNoEntry: false });
    if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) return null;
    const bytes = fs.readFileSync(candidate);
    return { path: relativePath, sha256: sha256(bytes), bytes: bytes.byteLength };
}

function resolveSkillFile(codeRoot: string, relativePath: string): string | null {
    const skillRoot = path.join(codeRoot, '.agents', 'skills', 'corvus-forge');
    const candidate = path.resolve(skillRoot, ...relativePath.split('/'));
    const relative = path.relative(skillRoot, candidate);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
    let current = skillRoot;
    for (const segment of relative.split(path.sep)) {
        current = path.join(current, segment);
        const stat = fs.lstatSync(current, { throwIfNoEntry: false });
        if (stat?.isSymbolicLink()) return null;
    }
    return candidate;
}

function hashSkillFile(codeRoot: string, relativePath: string): RuntimeFileProof | null {
    const candidate = resolveSkillFile(codeRoot, relativePath);
    return candidate ? hashRegularFile(candidate, relativePath) : null;
}

function readJsonFile(
    codeRoot: string,
    relativePath: string,
): { proof: RuntimeFileProof; value: JsonRecord } | null {
    const proof = hashSkillFile(codeRoot, relativePath);
    if (!proof) return null;
    try {
        const value = asRecord(JSON.parse(fs.readFileSync(
            resolveSkillFile(codeRoot, relativePath) as string,
            'utf8',
        )) as unknown);
        return value ? { proof, value } : null;
    } catch {
        return null;
    }
}

function validHostManifest(value: JsonRecord): boolean {
    if (!exactKeys(value, HOST_MANIFEST_KEYS)) return false;
    return value.schema === 'cstar.forge_host_runtime_manifest.v2'
        && value.runtime_owner === 'cstar-state-only'
        && value.runner_owner === 'codex-host'
        && stableValue(value.workflow_surfaces) === stableValue(['forge', 'researcher'])
        && value.requested_model === 'gpt-5.6-luna'
        && value.requested_reasoning === 'max'
        && value.selector_status === 'enforced'
        && (value.actual_identity === null || typeof value.actual_identity === 'string')
        && value.transport === 'codex-host'
        && value.host_launch_required === true
        && value.provider_attempted === false
        && value.network_policy === 'codex_host_no_cstar_network'
        && value.cognition_launch === false
        && value.cstar_launch === false
        && value.manifest_schema_path === 'host-manifest.schema.json'
        && value.generator_path === 'scripts/codex_host_runtime_lineage.mjs'
        && stableValue(value.proof_files) === stableValue(HOST_PROOF_FILES)
        && value.receipt_schema === 'cstar.forge_host_runtime_receipt.v2'
        && value.hash_algorithm === 'sha256';
}

function validLegacyManifest(value: JsonRecord): boolean {
    return exactKeys(value, LEGACY_MANIFEST_KEYS)
        && value.schema === LEGACY_SCHEMA
        && value.runtime_owner === 'cstar'
        && value.credential_profile_owner === 'hermes'
        && value.credential_profile === 'cstar-hub'
        && value.provider === 'minimax-oauth'
        && value.model === 'MiniMax-M3'
        && value.launcher === 'bin/hermes'
        && Array.isArray(value.source_files)
        && value.source_files.length > 0
        && value.source_files.every((item) => typeof item === 'string')
        && value.allow_arbitrary_source_root === false
        && value.oauth_read_only === true
        && value.oauth_refresh_allowed === false
        && value.oauth_store_write_allowed === false;
}

function buildHostReceipt(
    manifest: RuntimeFileProof,
    schema: RuntimeFileProof,
    generator: RuntimeFileProof,
    contentSha256: string,
    actualIdentity: string | null,
): { receipt: ForgeHostRuntimeReceipt; sha256: string } {
    const receipt: ForgeHostRuntimeReceipt = {
        schema: 'cstar.forge_host_runtime_receipt.v2',
        manifest_sha256: manifest.sha256,
        manifest_bytes: manifest.bytes,
        schema_sha256: schema.sha256,
        schema_bytes: schema.bytes,
        generator_sha256: generator.sha256,
        generator_bytes: generator.bytes,
        content_sha256: contentSha256,
        runner_owner: 'codex-host',
        requested_model: 'gpt-5.6-luna',
        requested_reasoning: 'max',
        selector_status: 'enforced',
        actual_identity: actualIdentity,
        transport: 'codex-host',
        host_launch_required: true,
        provider_attempted: false,
        provider_requests_started: 0,
        network_accessed: false,
        cognition_launch: false,
        cstar_launch: false,
    };
    return { receipt, sha256: sha256(stableValue(receipt)) };
}

function partialProof(
    manifestVersion: RuntimeForgeProof['manifest_version'],
    manifestPath: string | null,
    manifestSha256: string | null,
    reasons: string[],
): RuntimeForgeProof {
    return {
        contract: 'partial',
        actionable: false,
        manifest_version: manifestVersion,
        manifest_path: manifestPath,
        manifest_sha256: manifestSha256,
        schema_sha256: null,
        generator_sha256: null,
        launcher_sha256: null,
        source_files: [],
        proof_files: [],
        content_sha256: null,
        receipt: null,
        receipt_sha256: null,
        runner_owner: null,
        requested_model: null,
        requested_reasoning: null,
        selector_status: null,
        actual_identity: null,
        transport: null,
        executable_launcher_present: false,
        mismatch_reasons: [...new Set(reasons)].sort(),
    };
}

function buildLegacyProof(
    codeRoot: string,
    manifest: { proof: RuntimeFileProof; value: JsonRecord },
): RuntimeForgeProof {
    const reasons: string[] = [];
    if (!validLegacyManifest(manifest.value)) reasons.push('forge_runtime_manifest_contract_invalid');
    const sourceFiles = Array.isArray(manifest.value.source_files)
        ? manifest.value.source_files.filter((item): item is string => typeof item === 'string')
        : [];
    const requestedFiles = ['bin/hermes', ...sourceFiles];
    const proofs: RuntimeFileProof[] = [];
    for (const relativePath of requestedFiles) {
        const proof = hashSkillFile(codeRoot, `runtime/${relativePath}`);
        if (proof) proofs.push(proof);
        else reasons.push(`forge_runtime_file_missing_or_unsafe:${relativePath}`);
    }
    const launcher = proofs.find((proof) => proof.path === 'runtime/bin/hermes');
    if (!launcher || !fs.readFileSync(
        resolveSkillFile(codeRoot, 'runtime/bin/hermes') as string,
        'utf8',
    ).includes('# CSTAR_FORGE_RUNTIME_LAUNCHER_V2')) {
        reasons.push('forge_runtime_launcher_marker_missing');
    }
    const uniqueReasons = [...new Set(reasons)].sort();
    const contentSha256 = uniqueReasons.length === 0
        ? sha256(stableValue([manifest.proof, ...proofs]))
        : null;
    return {
        contract: uniqueReasons.length === 0 ? 'verified_manifest_content' : 'partial',
        actionable: false,
        manifest_version: 'legacy_v1',
        manifest_path: LEGACY_RUNTIME_MANIFEST_RELATIVE,
        manifest_sha256: manifest.proof.sha256,
        schema_sha256: null,
        generator_sha256: null,
        launcher_sha256: launcher?.sha256 ?? null,
        source_files: proofs.filter((proof) => proof.path !== 'runtime/bin/hermes'),
        proof_files: [manifest.proof, ...proofs],
        content_sha256: contentSha256,
        receipt: null,
        receipt_sha256: null,
        runner_owner: 'legacy-hermes',
        requested_model: 'MiniMax-M3',
        requested_reasoning: null,
        selector_status: 'unreported',
        actual_identity: null,
        transport: 'legacy-hermes',
        executable_launcher_present: Boolean(launcher),
        mismatch_reasons: uniqueReasons,
    };
}

function buildHostProof(
    codeRoot: string,
    manifest: { proof: RuntimeFileProof; value: JsonRecord },
): RuntimeForgeProof {
    const reasons: string[] = [];
    if (!validHostManifest(manifest.value)) reasons.push('forge_runtime_host_manifest_contract_invalid');
    const schema = readJsonFile(codeRoot, 'runtime/host-manifest.schema.json');
    const generator = hashSkillFile(codeRoot, 'scripts/codex_host_runtime_lineage.mjs');
    if (!schema) reasons.push('forge_runtime_host_schema_missing_or_invalid');
    else if (schema.value.$id !== 'cstar.forge_host_runtime_manifest.v2'
        || schema.value.additionalProperties !== false) {
        reasons.push('forge_runtime_host_schema_contract_invalid');
    }
    if (!generator) reasons.push('forge_runtime_host_generator_missing_or_unsafe');
    else if (!fs.readFileSync(
        resolveSkillFile(codeRoot, 'scripts/codex_host_runtime_lineage.mjs') as string,
        'utf8',
    ).includes('cstar.forge_host_runtime_receipt.v2')) {
        reasons.push('forge_runtime_host_generator_contract_invalid');
    }
    const proofFiles = [manifest.proof, ...(schema ? [schema.proof] : []), ...(generator ? [generator] : [])];
    const contentSha256 = reasons.length === 0
        ? sha256(stableValue(proofFiles))
        : null;
    const hostReceipt = reasons.length === 0 && schema && generator && contentSha256
        ? buildHostReceipt(
            manifest.proof,
            schema.proof,
            generator,
            contentSha256,
            typeof manifest.value.actual_identity === 'string'
                ? manifest.value.actual_identity
                : null,
        )
        : null;
    return {
        contract: reasons.length === 0 ? 'verified_manifest_content' : 'partial',
        actionable: reasons.length === 0,
        manifest_version: 'host_v2',
        manifest_path: HOST_RUNTIME_MANIFEST_RELATIVE,
        manifest_sha256: manifest.proof.sha256,
        schema_sha256: schema?.proof.sha256 ?? null,
        generator_sha256: generator?.sha256 ?? null,
        launcher_sha256: null,
        source_files: [],
        proof_files: proofFiles,
        content_sha256: contentSha256,
        receipt: hostReceipt?.receipt ?? null,
        receipt_sha256: hostReceipt?.sha256 ?? null,
        runner_owner: manifest.value.runner_owner === 'codex-host' ? 'codex-host' : null,
        requested_model: manifest.value.requested_model === 'gpt-5.6-luna'
            ? 'gpt-5.6-luna' : null,
        requested_reasoning: manifest.value.requested_reasoning === 'max' ? 'max' : null,
        selector_status: manifest.value.selector_status === 'enforced'
            ? 'enforced' : 'invalid',
        actual_identity: typeof manifest.value.actual_identity === 'string'
            ? manifest.value.actual_identity : null,
        transport: manifest.value.transport === 'codex-host' ? 'codex-host' : null,
        executable_launcher_present: false,
        mismatch_reasons: [...new Set(reasons)].sort(),
    };
}

export function buildForgeRuntimeProof(codeRoot: string): RuntimeForgeProof {
    const host = readJsonFile(codeRoot, 'runtime/host-manifest.json');
    if (host) return buildHostProof(codeRoot, host);
    const legacy = readJsonFile(codeRoot, 'runtime/manifest.json');
    if (legacy) return buildLegacyProof(codeRoot, legacy);
    return partialProof('unknown', null, null, [
        'forge_runtime_host_manifest_missing',
        'forge_runtime_manifest_missing',
    ]);
}
