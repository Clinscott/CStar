#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const input = process.argv[2];
if (!input) throw new Error('native_receipt_path_required');
const receipt = JSON.parse(fs.readFileSync(input, 'utf8'));
if (receipt.schema !== 'cstar.forge_native_delivery_receipt.v1') throw new Error('native_receipt_schema_invalid');
if (receipt.status !== 'DELIVERED_UNVERIFIED') throw new Error('native_receipt_acceptance_boundary_invalid');
if (!Array.isArray(receipt.worker_receipts) || !Array.isArray(receipt.task_graph)) throw new Error('native_receipt_evidence_missing');
if (receipt.task_graph.some((node) => node.role === 'leaf' && node.parent_task_id !== receipt.plan.parent_task_id)) throw new Error('native_receipt_task_graph_invalid');
if (receipt.worker_receipts.some((worker) => worker.descendants?.length)) throw new Error('native_receipt_descendant_detected');
if (receipt.requested_identity?.model !== 'gpt-5.6-luna' || receipt.requested_identity?.reasoning !== 'max') throw new Error('native_receipt_requested_identity_invalid');
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]))
    : value;
const unsigned = { ...receipt, receipt_sha256: '' };
const digest = crypto.createHash('sha256').update(JSON.stringify(canonical(unsigned))).digest('hex');
if (receipt.receipt_sha256 !== digest) throw new Error('native_receipt_digest_mismatch');
process.stdout.write(JSON.stringify({ schema: 'cstar.forge_native_receipt_validation.v1', valid: true, receipt_sha256: receipt.receipt_sha256 }) + '\n');
