import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.dirname(scriptRoot);
const runtimeRoot = path.join(skillRoot, 'runtime');
const proofFiles = [
    'runtime/host-manifest.json',
    'runtime/host-manifest.schema.json',
    'scripts/codex_host_runtime_lineage.mjs',
];
const expectedManifestKeys = [
    'actual_identity', 'cognition_launch', 'cstar_launch', 'generator_path', 'hash_algorithm',
    'host_launch_required',
    'manifest_schema_path', 'network_policy', 'proof_files',
    'provider_attempted',
    'receipt_schema', 'requested_model', 'requested_reasoning', 'runner_owner',
    'runtime_owner', 'schema', 'selector_status', 'transport', 'workflow_surfaces',
].sort();

function digest(value) {
    return createHash('sha256').update(value).digest('hex');
}

function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => (
            `${JSON.stringify(key)}:${stable(value[key])}`
        )).join(',')}}`;
    }
    return JSON.stringify(value);
}

function readProof(relativePath) {
    const candidate = path.join(skillRoot, ...relativePath.split('/'));
    const stat = fs.lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
        throw new Error(`cstar_host_runtime_file_unsafe:${relativePath}`);
    }
    const bytes = fs.readFileSync(candidate);
    return { path: relativePath, sha256: digest(bytes), bytes: bytes.byteLength, content: bytes };
}

const manifestProof = readProof(proofFiles[0]);
const schemaProof = readProof(proofFiles[1]);
const generatorProof = readProof(proofFiles[2]);
const manifest = JSON.parse(manifestProof.content.toString('utf8'));
const schema = JSON.parse(schemaProof.content.toString('utf8'));
if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(expectedManifestKeys)
    || manifest.schema !== 'cstar.forge_host_runtime_manifest.v2'
    || manifest.runtime_owner !== 'cstar-state-only'
    || manifest.runner_owner !== 'codex-host'
    || JSON.stringify(manifest.workflow_surfaces) !== JSON.stringify(['forge', 'researcher'])
    || manifest.requested_model !== 'gpt-5.6-luna'
    || manifest.requested_reasoning !== 'max'
    || manifest.selector_status !== 'enforced'
    || (manifest.actual_identity !== null && typeof manifest.actual_identity !== 'string')
    || manifest.transport !== 'codex-host'
    || manifest.host_launch_required !== true
    || manifest.provider_attempted !== false
    || manifest.network_policy !== 'codex_host_no_cstar_network'
    || manifest.cognition_launch !== false
    || manifest.cstar_launch !== false
    || manifest.manifest_schema_path !== 'host-manifest.schema.json'
    || manifest.generator_path !== 'scripts/codex_host_runtime_lineage.mjs'
    || JSON.stringify(manifest.proof_files) !== JSON.stringify(proofFiles)
    || manifest.receipt_schema !== 'cstar.forge_host_runtime_receipt.v2'
    || manifest.hash_algorithm !== 'sha256') {
    throw new Error('cstar_host_runtime_manifest_invalid');
}
if (schema.$id !== 'cstar.forge_host_runtime_manifest.v2'
    || schema.additionalProperties !== false) {
    throw new Error('cstar_host_runtime_schema_invalid');
}

const contentSha256 = digest(stable([
    { path: manifestProof.path, sha256: manifestProof.sha256, bytes: manifestProof.bytes },
    { path: schemaProof.path, sha256: schemaProof.sha256, bytes: schemaProof.bytes },
    { path: generatorProof.path, sha256: generatorProof.sha256, bytes: generatorProof.bytes },
]));
const receipt = {
    schema: 'cstar.forge_host_runtime_receipt.v2',
    manifest_sha256: manifestProof.sha256,
    manifest_bytes: manifestProof.bytes,
    schema_sha256: schemaProof.sha256,
    schema_bytes: schemaProof.bytes,
    generator_sha256: generatorProof.sha256,
    generator_bytes: generatorProof.bytes,
    content_sha256: contentSha256,
    runner_owner: 'codex-host',
    requested_model: 'gpt-5.6-luna',
    requested_reasoning: 'max',
    selector_status: 'enforced',
    actual_identity: manifest.actual_identity,
    transport: 'codex-host',
    host_launch_required: true,
    provider_attempted: false,
    provider_requests_started: 0,
    network_accessed: false,
    cognition_launch: false,
    cstar_launch: false,
};
process.stdout.write(`${JSON.stringify({
    ...receipt,
    receipt_sha256: digest(stable(receipt)),
}, null, 2)}\n`);
