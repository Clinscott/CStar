import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertSha256,
  assertTokenPath,
  atomicWriteJson,
  fail,
  isPassingV2Gate,
  loadContract,
  makeEnvelope,
  readJson,
  resolveRepoPath,
  sha256File,
} from "./runner-core.mjs";

const transitionGates = {
  "pass-1-migrated->whole-site-reviewed": ["whole_site_review"],
  "whole-site-reviewed->workflow-reviewed": ["workflow_review"],
  "workflow-reviewed->runner-v2-frozen": ["runner_preflight", "runner_tests", "site_verify", "source_clean"],
  "runner-v2-frozen->pass-2-running": ["runner_frozen"],
  "pass-2-running->stable": ["pass_2_complete", "runner_preflight", "site_verify", "source_clean"],
  "stable->generation-1-running": ["stable_preflight"],
  "generation-1-running->paused": ["generation_complete"],
};

function readArgs(argv) {
  const result = { contractPath: "research/council-autoresearch/workflow.v2.json" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (!["--state", "--to", "--receipt", "--contract"].includes(arg)) fail(`unknown argument: ${arg}`);
    if (value === undefined) fail(`${arg} requires a value`);
    if (arg === "--state") result.statePath = value;
    if (arg === "--to") result.to = value;
    if (arg === "--receipt") result.receiptPath = value;
    if (arg === "--contract") result.contractPath = value;
    index += 1;
  }
  if (!result.statePath || !result.to || !result.receiptPath) {
    fail("usage: node workflow-state.mjs --state <state.json> --to <phase> --receipt <receipt.json>");
  }
  return result;
}

function repositoryAttestation(repoRoot) {
  const options = { cwd: repoRoot, encoding: "utf8", timeout: 5000, maxBuffer: 16_384 };
  const head = spawnSync("git", ["rev-parse", "HEAD"], options);
  if (head.error || head.status !== 0) fail("could not read repository HEAD");
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], options);
  if (status.error || status.status !== 0) fail("could not read repository status");
  return { head: head.stdout.trim(), clean: status.stdout.trim() === "" };
}

function validateState(state, contractSha256) {
  if (state.schema_version !== "2.0.0" || state.runner_version !== "2.0.0") {
    fail("workflow state must use version 2.0.0");
  }
  if (state.contract_sha256 !== contractSha256) fail("workflow state contract hash mismatch");
  if (typeof state.run_id !== "string" || !/^[a-z0-9][a-z0-9._-]{7,127}$/.test(state.run_id)) {
    fail("workflow state run_id is invalid");
  }
  if (!Array.isArray(state.transitions) || !Array.isArray(state.completed_generations)) {
    fail("workflow state history arrays are required");
  }
  if (state.completed_generations.length > 1) fail("workflow state exceeds the generation limit");
  assertTokenPath(state.token_path, "workflow state token_path");
}

export function validateReceiptEvidence(repoRoot, receipt, requiredGates) {
  if (!receipt.gate_evidence || typeof receipt.gate_evidence !== "object") {
    fail("transition receipt gate_evidence is required");
  }
  for (const gate of requiredGates) {
    const evidence = receipt.gate_evidence[gate];
    if (!evidence || typeof evidence.path !== "string") fail(`transition evidence for ${gate} is required`);
    assertSha256(evidence.sha256, `receipt.gate_evidence.${gate}.sha256`);
    const file = resolveRepoPath(repoRoot, evidence.path, `${gate} evidence path`);
    if (!fs.existsSync(file) || sha256File(file) !== evidence.sha256) {
      fail(`transition evidence hash mismatch for ${gate}`);
    }
    if (receipt.gates?.[gate]?.evidence_sha256 !== evidence.sha256) {
      fail(`transition gate ${gate} is not bound to its evidence file`);
    }
  }
  return true;
}

export function transitionState(state, to, receipt, contract, contractSha256, source) {
  validateState(state, contractSha256);
  const edge = `${state.phase}->${to}`;
  const legal = contract.state_machine.transitions.some(([from, target]) => `${from}->${target}` === edge);
  if (!legal) fail(`illegal workflow transition: ${edge}`);
  if (receipt.schema_version !== "2.0.0" || receipt.runner_version !== "2.0.0") {
    fail("transition receipt must use runner version 2.0.0");
  }
  if (receipt.contract_sha256 !== contractSha256 || receipt.from !== state.phase || receipt.to !== to) {
    fail("transition receipt does not bind the requested state edge");
  }
  if (receipt.source_parent !== state.source_head) fail("transition receipt source parent mismatch");
  if (receipt.source_clean !== true || source.clean !== true) fail("workflow transitions require a clean committed source tree");
  if (receipt.evidence_validated !== true) fail("transition receipt evidence was not validated");
  const required = transitionGates[edge] ?? [];
  for (const gate of required) {
    if (!isPassingV2Gate(receipt.gates?.[gate])) fail(`transition gate ${gate} must be a receipt-bound pass`);
  }
  if (!receipt.input_hashes || typeof receipt.input_hashes !== "object" || Object.keys(receipt.input_hashes).length === 0) {
    fail("transition receipt requires frozen input hashes");
  }
  for (const [name, digest] of Object.entries(receipt.input_hashes)) assertSha256(digest, `receipt.input_hashes.${name}`);
  if (state.frozen_contract_sha256 && state.frozen_contract_sha256 !== contractSha256) {
    fail("the runner contract changed after freeze");
  }
  const next = {
    ...state,
    phase: to,
    source_head: source.head,
    frozen_contract_sha256:
      to === "runner-v2-frozen" ? contractSha256 : state.frozen_contract_sha256 ?? null,
    transitions: [
      ...state.transitions,
      {
        from: state.phase,
        to,
        receipt_sha256: receipt.receipt_sha256 ?? null,
        source_head: source.head,
        input_hashes: receipt.input_hashes,
      },
    ],
    next_allowed_action:
      to === "runner-v2-frozen"
        ? "start-pass-2"
        : to === "stable"
          ? "run-generation-1"
          : to === "paused"
            ? "pause-and-report"
            : "continue-declared-workflow",
  };
  return next;
}

function runCli() {
  let contractSha256 = "0".repeat(64);
  let lockFile;
  try {
    const repoRoot = process.cwd();
    const args = readArgs(process.argv.slice(2));
    const loaded = loadContract(repoRoot, args.contractPath);
    contractSha256 = loaded.sha256;
    const stateFile = resolveRepoPath(repoRoot, args.statePath, "state path");
    const receiptFile = resolveRepoPath(repoRoot, args.receiptPath, "receipt path");
    const state = readJson(stateFile);
    const receipt = readJson(receiptFile);
    receipt.receipt_sha256 = sha256File(receiptFile);
    const required = transitionGates[`${state.phase}->${args.to}`] ?? [];
    receipt.evidence_validated = validateReceiptEvidence(repoRoot, receipt, required);
    const source = repositoryAttestation(repoRoot);
    lockFile = `${stateFile}.lock`;
    const descriptor = fs.openSync(lockFile, "wx", 0o600);
    fs.writeFileSync(descriptor, `${process.pid}\n`);
    fs.closeSync(descriptor);
    const next = transitionState(
      state,
      args.to,
      receipt,
      loaded.contract,
      loaded.sha256,
      source,
    );
    atomicWriteJson(stateFile, next);
    const envelope = makeEnvelope({
      phase: "workflow-transition",
      status: "pass",
      contractSha256: loaded.sha256,
      provenance: { source_head: next.source_head, receipt_sha256: receipt.receipt_sha256 },
      frozenHashes: receipt.input_hashes,
      evidenceClasses: { state_transition: "pass" },
      nextAllowedAction: next.next_allowed_action,
      data: { from: state.phase, to: next.phase, run_id: state.run_id },
    });
    process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const envelope = makeEnvelope({
      phase: "workflow-transition",
      status: "fail",
      contractSha256,
      evidenceClasses: { state_transition: "fail" },
      diagnostics: { bytes: Buffer.byteLength(message), truncated: false },
      nextAllowedAction: "repair-transition-evidence",
      data: { error: message.slice(0, 4096) },
    });
    process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
    process.exitCode = 1;
  } finally {
    if (lockFile) {
      try {
        fs.unlinkSync(lockFile);
      } catch {
        // Nothing to clean if acquisition failed.
      }
    }
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) runCli();
