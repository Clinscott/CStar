#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const input = process.argv[2];
if (!input) throw new Error('native_packet_path_required');
const packet = JSON.parse(fs.readFileSync(input, 'utf8'));
const required = [
  'schema', 'run_id', 'work_package_id', 'goal', 'acceptance', 'execution_root',
  'source_identity', 'read_allowlist', 'write_allowlist', 'test_allowlist',
  'protected_effect_exclusions', 'topology_ceiling', 'requested_identity',
  'evidence_root', 'deadline_at',
];
const forbidden = ['root_authority', 'set_authorization', 'cancellation_secret', 'control_receipt', 'result_ticket', 'lifecycle_mutation'];
for (const key of required) if (!(key in packet)) throw new Error(`native_packet_field_missing:${key}`);
for (const key of forbidden) if (key in packet) throw new Error(`native_packet_control_field_exposed:${key}`);
if (packet.schema !== 'cstar.forge_native_worker_package.v1') throw new Error('native_packet_schema_invalid');
if (packet.requested_identity?.model !== 'gpt-5.6-luna' || packet.requested_identity?.reasoning !== 'max') throw new Error('native_packet_requested_identity_invalid');
if (JSON.stringify(packet.topology_ceiling) !== JSON.stringify({ parent: 1, leaves: 3, descendants: 0 })) throw new Error('native_packet_topology_invalid');
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]))
    : value;
const digest = crypto.createHash('sha256').update(JSON.stringify(canonical(packet))).digest('hex');
process.stdout.write(JSON.stringify({ schema: 'cstar.forge_native_packet_validation.v1', valid: true, packet_sha256: digest }) + '\n');
