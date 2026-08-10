import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertSha256,
  assertTokenPath,
  fail,
  isPassingLegacyGate,
  isPassingV2Gate,
  loadContract,
  makeEnvelope,
  readJson,
  resolveRepoPath,
  sha256File,
} from "./runner-core.mjs";

const allowedSeverities = new Set(["blocker", "high", "medium", "low", "none"]);
const allowedDispositions = new Set(["accepted", "deferred", "rejected", "conflict"]);

function readArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--index") {
    fail("usage: node validate-run.mjs --index <run-index.v2.json>");
  }
  return { indexPath: argv[1] };
}

function validateCouncilRecords(records, councilOrder, label, requireOrder) {
  if (!Array.isArray(records) || records.length !== councilOrder.length) {
    fail(`${label} must contain exactly ${councilOrder.length} Council records`);
  }
  const actual = [];
  for (const [index, record] of records.entries()) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      fail(`${label}[${index}] must be an object`);
    }
    for (const field of ["expert", "finding", "action", "risk", "evidence_required", "severity", "axis"]) {
      if (typeof record[field] !== "string" || record[field].trim() === "") {
        fail(`${label}[${index}].${field} must be a non-empty string`);
      }
    }
    if (!allowedSeverities.has(record.severity)) fail(`${label}[${index}].severity is invalid`);
    actual.push(record.expert);
  }
  if (new Set(actual).size !== councilOrder.length) fail(`${label} experts must be unique`);
  for (const expert of councilOrder) {
    if (!actual.includes(expert)) fail(`${label} is missing ${expert}`);
  }
  if (requireOrder && actual.some((expert, index) => expert !== councilOrder[index])) {
    fail(`${label} must use canonical Council order`);
  }
}

function validateSynthesis(synthesis, label, maxAccepted) {
  if (!Array.isArray(synthesis)) fail(`${label} must be an array`);
  let accepted = 0;
  const ids = new Set();
  for (const [index, item] of synthesis.entries()) {
    if (!item || typeof item !== "object") fail(`${label}[${index}] must be an object`);
    if (typeof item.id !== "string" || item.id.length === 0 || ids.has(item.id)) {
      fail(`${label}[${index}].id must be unique and non-empty`);
    }
    ids.add(item.id);
    if (!allowedDispositions.has(item.disposition)) fail(`${label}[${index}].disposition is invalid`);
    if (item.disposition === "accepted") accepted += 1;
  }
  if (accepted > maxAccepted) fail(`${label} exceeds the accepted change-group limit`);
}

function validateHashMap(map, label) {
  if (!map || typeof map !== "object" || Array.isArray(map) || Object.keys(map).length === 0) {
    fail(`${label} must be a non-empty object`);
  }
  for (const [file, digest] of Object.entries(map)) {
    if (path.isAbsolute(file) || file.split(/[\\/]/).includes("..")) fail(`${label} contains an escaping path`);
    assertSha256(digest, `${label}.${file}`);
  }
}

function validateLegacyTokenPath(value, label) {
  if (!value || value.status !== "quarantined" || value.actionable !== false) {
    fail(`${label} must preserve quarantined, non-actionable Token-Path state`);
  }
  for (const key of ["advice_attached", "advice_writes_enabled", "observation_writes_enabled"]) {
    if (key in value && value[key] !== false) fail(`${label}.${key} must be false`);
  }
}

function validateLegacyRun(run, entry, contract, label) {
  if (run.schema_version !== "1.0.0" || run.runner_version !== "1.0.0") {
    fail(`${label} is not an immutable runner-v1 record`);
  }
  if (run.aspect_id !== entry.source_aspect_id) fail(`${label} source aspect does not match the index`);
  validateHashMap(run.baseline_hashes, `${label}.baseline_hashes`);
  validateHashMap(run.result_hashes, `${label}.result_hashes`);
  validateCouncilRecords(run.records, contract.council_order, `${label}.records`, false);
  validateSynthesis(run.synthesis, `${label}.synthesis`, contract.limits.accepted_change_groups_per_aspect);
  for (const gate of contract.gates.legacy_migration_required) {
    if (!isPassingLegacyGate(run.validation?.[gate])) fail(`${label}.validation.${gate} must pass`);
  }
  validateLegacyTokenPath(run.augury?.token_path, `${label}.augury.token_path`);
}

function validateV2Run(run, entry, contract, contractSha256, label) {
  if (run.schema_version !== "2.0.0" || run.runner_version !== "2.0.0") {
    fail(`${label} must use runner schema 2.0.0`);
  }
  if (run.run_id !== entry.run_id || run.aspect_id !== entry.aspect_id || run.pass !== 2) {
    fail(`${label} identity does not match the active index`);
  }
  if (run.contract_sha256 !== contractSha256) fail(`${label} contract hash mismatch`);
  for (const field of ["packet_sha256", "baseline_tree_sha256", "result_tree_sha256"] ) {
    assertSha256(run[field], `${label}.${field}`);
  }
  validateHashMap(run.baseline_hashes, `${label}.baseline_hashes`);
  validateHashMap(run.result_hashes, `${label}.result_hashes`);
  validateCouncilRecords(run.records, contract.council_order, `${label}.records`, true);
  validateSynthesis(run.synthesis, `${label}.synthesis`, contract.limits.accepted_change_groups_per_aspect);
  for (const gate of contract.gates.pass_2_required) {
    if (!isPassingV2Gate(run.validation?.[gate])) fail(`${label}.validation.${gate} must be a receipt-bound pass`);
  }
  assertTokenPath(run.token_path, `${label}.token_path`);
  const runtime = run.release?.runtime;
  for (const field of ["node", "vinext", "next", "react"]) {
    if (typeof runtime?.[field] !== "string" || runtime[field].length === 0) {
      fail(`${label}.release.runtime.${field} is required`);
    }
  }
  for (const field of ["source_sha256", "lockfile_sha256", "artifact_sha256"]) {
    assertSha256(run.release?.[field], `${label}.release.${field}`);
  }
}

function assertExactFileSet(directory, classifiedPaths, repoRoot, label) {
  const resolvedDirectory = resolveRepoPath(repoRoot, directory, `${label} directory`);
  const actual = fs.existsSync(resolvedDirectory)
    ? fs.readdirSync(resolvedDirectory)
        .filter((name) => name.endsWith(".json"))
        .map((name) => path.relative(repoRoot, path.join(resolvedDirectory, name)).split(path.sep).join("/"))
        .sort()
    : [];
  const expected = [...classifiedPaths].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} contains an unknown, unclassified, or missing JSON record`);
  }
}

export function validateIndex(repoRoot, indexPath) {
  const indexFile = resolveRepoPath(repoRoot, indexPath, "index path");
  const index = readJson(indexFile);
  if (index.schema_version !== "2.0.0" || index.runner_version !== "2.0.0") {
    fail("run index must use schema and runner version 2.0.0");
  }
  const loaded = loadContract(repoRoot, index.contract?.path);
  assertSha256(index.contract?.sha256, "index.contract.sha256");
  if (index.contract.sha256 !== loaded.sha256) fail("run index contract hash mismatch");
  const { contract } = loaded;
  const aspectIds = contract.aspects.map(({ id }) => id);

  const pass1 = index.passes?.["pass-1"];
  if (pass1?.mode !== "immutable-legacy-migration" || pass1.status !== "complete") {
    fail("pass-1 must be a complete immutable legacy migration");
  }
  if (!Array.isArray(pass1.active) || pass1.active.length !== aspectIds.length) {
    fail("pass-1 must select exactly one active record per canonical aspect");
  }
  if (pass1.active.some((entry, position) => entry.aspect_id !== aspectIds[position])) {
    fail("pass-1 active records must follow canonical aspect order");
  }
  if (new Set(pass1.active.map(({ aspect_id }) => aspect_id)).size !== aspectIds.length) {
    fail("pass-1 active aspect IDs must be unique");
  }
  const classifiedPass1 = new Set();
  for (const entry of pass1.active) {
    const activeFile = resolveRepoPath(repoRoot, entry.path, "pass-1 active path");
    assertSha256(entry.sha256, `${entry.aspect_id}.sha256`);
    if (sha256File(activeFile) !== entry.sha256) fail(`${entry.path} hash mismatch`);
    if (classifiedPass1.has(entry.path)) fail(`${entry.path} is classified more than once`);
    classifiedPass1.add(entry.path);
    validateLegacyRun(readJson(activeFile), entry, contract, entry.path);
    if (!Array.isArray(entry.supersedes)) fail(`${entry.aspect_id}.supersedes must be an array`);
    for (const superseded of entry.supersedes) {
      const supersededFile = resolveRepoPath(repoRoot, superseded.path, "superseded path");
      assertSha256(superseded.sha256, `${superseded.path}.sha256`);
      if (sha256File(supersededFile) !== superseded.sha256) fail(`${superseded.path} hash mismatch`);
      if (classifiedPass1.has(superseded.path)) fail(`${superseded.path} is classified more than once`);
      classifiedPass1.add(superseded.path);
      const supersededRun = readJson(supersededFile);
      const canonical = contract.legacy_aspect_aliases[supersededRun.aspect_id] ?? supersededRun.aspect_id;
      if (canonical !== entry.aspect_id) fail(`${superseded.path} cannot be superseded by ${entry.aspect_id}`);
    }
  }
  assertExactFileSet("research/council-autoresearch/runs/pass-1", classifiedPass1, repoRoot, "pass-1");

  const review = index.reviews?.whole_site;
  const reviewFile = resolveRepoPath(repoRoot, review?.path, "whole-site review path");
  assertSha256(review?.sha256, "whole-site review hash");
  if (sha256File(reviewFile) !== review.sha256) fail("whole-site review hash mismatch");
  const reviewRun = readJson(reviewFile);
  validateCouncilRecords(reviewRun.records, contract.council_order, "whole-site records", false);

  const workflowReview = index.reviews?.workflow;
  const workflowReviewFile = resolveRepoPath(repoRoot, workflowReview?.path, "workflow review path");
  assertSha256(workflowReview?.sha256, "workflow review hash");
  if (sha256File(workflowReviewFile) !== workflowReview.sha256) fail("workflow review hash mismatch");
  const workflowReviewRun = readJson(workflowReviewFile);
  if (
    workflowReviewRun.schema_version !== "2.0.0" ||
    workflowReviewRun.runner_version !== "2.0.0" ||
    workflowReviewRun.aspect_id !== "workflow" ||
    workflowReviewRun.contract_sha256 !== loaded.sha256
  ) {
    fail("workflow review identity or contract hash mismatch");
  }
  validateCouncilRecords(workflowReviewRun.records, contract.council_order, "workflow review records", true);
  validateSynthesis(
    workflowReviewRun.synthesis,
    "workflow review synthesis",
    contract.limits.accepted_change_groups_per_aspect,
  );

  const pass2 = index.passes?.["pass-2"];
  if (!pass2 || !["pending", "running", "complete"].includes(pass2.status)) {
    fail("pass-2 status is invalid");
  }
  if (!Array.isArray(pass2.active)) fail("pass-2.active must be an array");
  if (pass2.status === "pending" && pass2.active.length !== 0) fail("pending pass-2 cannot have active records");
  if (pass2.status === "complete" && pass2.active.length !== aspectIds.length) {
    fail("complete pass-2 must contain exactly nine active records");
  }
  if (pass2.status === "running" && pass2.active.length >= aspectIds.length) {
    fail("running pass-2 must have fewer than nine active records");
  }
  const classifiedPass2 = new Set();
  let predecessor = null;
  for (const [position, entry] of pass2.active.entries()) {
    if (entry.aspect_id !== aspectIds[position]) fail("pass-2 records must be appended in canonical aspect order");
    if (classifiedPass2.has(entry.path)) fail("pass-2 paths must be unique");
    classifiedPass2.add(entry.path);
    const file = resolveRepoPath(repoRoot, entry.path, "pass-2 active path");
    assertSha256(entry.sha256, `${entry.aspect_id}.sha256`);
    if (sha256File(file) !== entry.sha256) fail(`${entry.path} hash mismatch`);
    const run = readJson(file);
    validateV2Run(run, entry, contract, loaded.sha256, entry.path);
    if (position === 0) {
      if (run.predecessor_run_id !== null) fail("first pass-2 record must have a null predecessor");
    } else {
      if (run.predecessor_run_id !== predecessor.run_id) fail(`${entry.path} predecessor mismatch`);
      if (run.baseline_tree_sha256 !== predecessor.result_tree_sha256) fail(`${entry.path} tree continuity mismatch`);
    }
    predecessor = run;
  }
  if (pass2.status !== "pending") {
    assertExactFileSet("research/council-autoresearch/runs/pass-2", classifiedPass2, repoRoot, "pass-2");
  }

  return {
    contract_sha256: loaded.sha256,
    index_sha256: sha256File(indexFile),
    active_pass_1_records: pass1.active.length,
    superseded_pass_1_records: classifiedPass1.size - pass1.active.length,
    active_pass_2_records: pass2.active.length,
    pass_2_status: pass2.status,
    council_records_validated: pass1.active.length * 19 + 38 + pass2.active.length * 19,
  };
}

function runCli() {
  let contractSha256 = "0".repeat(64);
  try {
    const args = readArgs(process.argv.slice(2));
    const result = validateIndex(process.cwd(), args.indexPath);
    contractSha256 = result.contract_sha256;
    const envelope = makeEnvelope({
      phase: "runner-preflight",
      status: "pass",
      contractSha256,
      frozenHashes: { index_sha256: result.index_sha256 },
      evidenceClasses: { static_runner_validation: "pass", browser_evidence: "blocked" },
      nextAllowedAction: result.pass_2_status === "complete" ? "stability-verification" : "continue-declared-workflow",
      data: result,
    });
    process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const envelope = makeEnvelope({
      phase: "runner-preflight",
      status: "fail",
      contractSha256,
      evidenceClasses: { static_runner_validation: "fail", browser_evidence: "blocked" },
      diagnostics: { bytes: Buffer.byteLength(message), truncated: false },
      nextAllowedAction: "repair-runner-evidence",
      data: { error: message.slice(0, 4096) },
    });
    process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) runCli();
