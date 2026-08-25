import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.dirname(scriptRoot);
const proofFiles = [
    'runtime/host-manifest.json',
    'runtime/host-manifest.schema.json',
    'scripts/validate_native_swarm_packet.mjs',
    'scripts/validate_native_swarm_receipt.mjs',
];
const generatorPath = 'scripts/codex_host_runtime_lineage.mjs';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const stable = (value) => Array.isArray(value)
    ? `[${value.map(stable).join(',')}]`
    : value && typeof value === 'object'
        ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
        : JSON.stringify(value);

function readProof(relativePath) {
    const candidate = path.join(skillRoot, ...relativePath.split('/'));
    const stat = fs.lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
        throw new Error(`cstar_native_host_runtime_file_unsafe:${relativePath}`);
    }
    const bytes = fs.readFileSync(candidate);
    return { path: relativePath, sha256: digest(bytes), bytes: bytes.byteLength, content: bytes };
}

const manifestProof = readProof(proofFiles[0]);
const schemaProof = readProof(proofFiles[1]);
const packetProof = readProof(proofFiles[2]);
const receiptProof = readProof(proofFiles[3]);
const generatorProof = readProof(generatorPath);
const manifest = JSON.parse(manifestProof.content.toString('utf8'));
const schema = JSON.parse(schemaProof.content.toString('utf8'));
const expectedKeys = [
    'actual_identity', 'actual_identity_attested', 'capabilities', 'connection_id',
    'cognition_launch', 'cstar_launch', 'descendant_limit', 'hash_algorithm',
    'leaf_limit', 'manifest_schema_path', 'network_accessed', 'parent_limit',
    'proof_files', 'provider_attempted', 'requested_model', 'requested_reasoning',
    'runner_owner', 'runtime_owner', 'schema', 'selector_status',
].sort();
if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(expectedKeys)
    || manifest.schema !== 'cstar.forge_native_host_manifest.v1'
    || manifest.runtime_owner !== 'cstar-native-swarm'
    || manifest.runner_owner !== 'codex-host'
    || manifest.connection_id !== 'forge-native-codex-swarm-v1'
    || manifest.requested_model !== 'gpt-5.6-luna'
    || manifest.requested_reasoning !== 'max'
    || manifest.selector_status !== 'enforced'
    || manifest.actual_identity !== 'unreported'
    || manifest.actual_identity_attested !== false
    || JSON.stringify(manifest.capabilities) !== JSON.stringify(['spawn_agent', 'list_agents', 'send_message', 'followup_task', 'wait_agent', 'interrupt_agent'])
    || manifest.parent_limit !== 1 || manifest.leaf_limit !== 3 || manifest.descendant_limit !== 0
    || manifest.provider_attempted !== false || manifest.network_accessed !== false
    || manifest.cognition_launch !== false || manifest.cstar_launch !== false
    || manifest.manifest_schema_path !== 'host-manifest.schema.json'
    || JSON.stringify(manifest.proof_files) !== JSON.stringify(proofFiles)
    || manifest.hash_algorithm !== 'sha256') {
    throw new Error('cstar_native_host_manifest_invalid');
}
if (schema.$id !== 'cstar.forge_native_host_manifest.v1' || schema.additionalProperties !== false) {
    throw new Error('cstar_native_host_schema_invalid');
}
const contentSha256 = digest(stable([
    { path: manifestProof.path, sha256: manifestProof.sha256, bytes: manifestProof.bytes },
    { path: schemaProof.path, sha256: schemaProof.sha256, bytes: schemaProof.bytes },
    { path: packetProof.path, sha256: packetProof.sha256, bytes: packetProof.bytes },
    { path: receiptProof.path, sha256: receiptProof.sha256, bytes: receiptProof.bytes },
    { path: generatorProof.path, sha256: generatorProof.sha256, bytes: generatorProof.bytes },
]));
const receipt = {
    schema: 'cstar.forge_native_host_runtime_receipt.v1',
    manifest_sha256: manifestProof.sha256,
    manifest_bytes: manifestProof.bytes,
    schema_sha256: schemaProof.sha256,
    schema_bytes: schemaProof.bytes,
    generator_sha256: generatorProof.sha256,
    generator_bytes: generatorProof.bytes,
    content_sha256: contentSha256,
    connection_id: manifest.connection_id,
    requested_model: manifest.requested_model,
    requested_reasoning: manifest.requested_reasoning,
    actual_identity: manifest.actual_identity,
    actual_identity_attested: manifest.actual_identity_attested,
    capabilities: manifest.capabilities,
    provider_attempted: false,
    network_accessed: false,
    cognition_launch: false,
    cstar_launch: false,
};
process.stdout.write(`${JSON.stringify({ ...receipt, receipt_sha256: digest(stable(receipt)) }, null, 2)}\n`);
