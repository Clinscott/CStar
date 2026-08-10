import { createPublicKey } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
    COUNCIL_AUTORESEARCH_SCHEMA,
    COUNCIL_EXECUTION_INPUT_CHANNELS,
    FrozenCouncilPacket,
    assertExactObjectKeys,
    assertSha256,
    canonicalPrivateDirectory,
    canonicalJson,
    fail,
    readJson,
    sha256,
} from './contracts.js';

export interface CouncilExecutionTrustPolicy {
    schema_version: typeof COUNCIL_AUTORESEARCH_SCHEMA;
    policy_version: '1.0.0';
    execution_authority: FrozenCouncilPacket['execution_authority'];
    receipt_issuer: 'cstar-host-invocation-bridge-v1';
    enforced_input_channels: typeof COUNCIL_EXECUTION_INPUT_CHANNELS;
    token_path_runtime_access: 'forbidden';
    runner_repository_url: string;
    runner_branch: string;
    runner_commit: string;
    runner_checkpoint_sha256: string;
    policy_sha256: string;
}

function policyDigest(policy: Omit<CouncilExecutionTrustPolicy, 'policy_sha256'>): string {
    return sha256(canonicalJson(policy));
}

export function freezeExecutionTrustPolicy(
    input: Omit<CouncilExecutionTrustPolicy, 'schema_version' | 'policy_version' | 'policy_sha256'>,
): CouncilExecutionTrustPolicy {
    assertExactObjectKeys(input, [
        'execution_authority', 'receipt_issuer', 'enforced_input_channels',
        'token_path_runtime_access', 'runner_repository_url', 'runner_branch',
        'runner_commit', 'runner_checkpoint_sha256',
    ], 'execution trust policy input');
    const base: Omit<CouncilExecutionTrustPolicy, 'policy_sha256'> = {
        schema_version: COUNCIL_AUTORESEARCH_SCHEMA,
        policy_version: '1.0.0',
        ...input,
    };
    return { ...base, policy_sha256: policyDigest(base) };
}

export function verifyExecutionTrustPolicy(policy: CouncilExecutionTrustPolicy): void {
    assertExactObjectKeys(policy, [
        'schema_version', 'policy_version', 'execution_authority', 'receipt_issuer',
        'enforced_input_channels', 'token_path_runtime_access', 'runner_repository_url',
        'runner_branch', 'runner_commit', 'runner_checkpoint_sha256', 'policy_sha256',
    ], 'execution trust policy');
    if (policy.schema_version !== COUNCIL_AUTORESEARCH_SCHEMA || policy.policy_version !== '1.0.0') {
        fail('execution trust policy version is invalid');
    }
    assertExactObjectKeys(
        policy.execution_authority,
        ['scheme', 'public_key_pem', 'key_id_sha256'],
        'execution trust authority',
    );
    if (policy.execution_authority.scheme !== 'ed25519') fail('execution trust authority must use Ed25519');
    assertSha256(policy.execution_authority.key_id_sha256, 'execution trust authority key id');
    if (sha256(policy.execution_authority.public_key_pem) !== policy.execution_authority.key_id_sha256) {
        fail('execution trust authority key id mismatch');
    }
    try {
        if (createPublicKey(policy.execution_authority.public_key_pem).asymmetricKeyType !== 'ed25519') {
            fail('execution trust authority key is not Ed25519');
        }
    } catch {
        fail('execution trust authority key is invalid');
    }
    if (policy.receipt_issuer !== 'cstar-host-invocation-bridge-v1'
        || canonicalJson(policy.enforced_input_channels) !== canonicalJson(COUNCIL_EXECUTION_INPUT_CHANNELS)
        || policy.token_path_runtime_access !== 'forbidden') {
        fail('execution trust policy does not enforce the host bridge boundary');
    }
    if (!policy.runner_repository_url || !policy.runner_branch) fail('runner trust coordinates are incomplete');
    if (!/^[a-f0-9]{40}$/.test(policy.runner_commit)) fail('trusted runner commit must be a full Git SHA');
    assertSha256(policy.runner_checkpoint_sha256, 'trusted runner checkpoint digest');
    assertSha256(policy.policy_sha256, 'execution trust policy hash');
    const { policy_sha256: claimed, ...base } = policy;
    if (policyDigest(base) !== claimed) fail('execution trust policy hash mismatch');
}

export function loadExecutionTrustPolicy(controlRoot: string): CouncilExecutionTrustPolicy {
    const file = path.join(
        canonicalPrivateDirectory(controlRoot, 'control root'),
        'council-autoresearch',
        'trust-policy.json',
    );
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0) {
        fail('execution trust policy must be a private single-link regular file');
    }
    const policy = readJson<CouncilExecutionTrustPolicy>(file);
    verifyExecutionTrustPolicy(policy);
    return policy;
}

export function verifyPacketAgainstTrustPolicy(
    packet: FrozenCouncilPacket,
    policy: CouncilExecutionTrustPolicy,
): void {
    verifyExecutionTrustPolicy(policy);
    if (canonicalJson(packet.execution_authority) !== canonicalJson(policy.execution_authority)) {
        fail('packet execution authority is not trusted by the configured host policy');
    }
    if (packet.runner_publication.checkpoint.repository_url !== policy.runner_repository_url
        || packet.runner_publication.checkpoint.branch !== policy.runner_branch
        || packet.runner_publication.checkpoint.commit !== policy.runner_commit
        || packet.runner_publication.checkpoint.checkpoint_sha256 !== policy.runner_checkpoint_sha256) {
        fail('packet runner publication is not trusted by the configured host policy');
    }
}

export function verifyPacketTrust(
    packet: FrozenCouncilPacket,
    controlRoot: string,
): CouncilExecutionTrustPolicy {
    const policy = loadExecutionTrustPolicy(controlRoot);
    verifyPacketAgainstTrustPolicy(packet, policy);
    return policy;
}
