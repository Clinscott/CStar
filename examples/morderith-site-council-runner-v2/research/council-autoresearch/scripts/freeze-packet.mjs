import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  atomicWriteJson,
  canonicalJson,
  fail,
  loadContract,
  makeEnvelope,
  resolveRepoPath,
  sha256,
  sha256File,
} from "./runner-core.mjs";

function git(repoRoot, args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) fail(`git ${args[0]} failed`);
  return result.stdout;
}

function sourceAttestation(repoRoot) {
  const head = git(repoRoot, ["rev-parse", "HEAD"]).trim();
  if (git(repoRoot, ["status", "--porcelain", "--untracked-files=all"]).trim() !== "") {
    fail("packet freezing requires a clean committed source tree");
  }
  return head;
}

export function computeSiteTree(repoRoot, contract) {
  const tracked = git(repoRoot, ["ls-files", "-z"])
    .split("\0")
    .filter(Boolean)
    .filter((file) =>
      contract.hash_contract.site_roots.some((root) => file === root || file.startsWith(`${root}/`)) ||
      contract.hash_contract.site_files.includes(file),
    )
    .sort();
  const files = tracked.map((file) => ({
    path: file,
    sha256: sha256File(resolveRepoPath(repoRoot, file, "tracked site file")),
  }));
  return { sha256: sha256(canonicalJson(files)), files };
}

function readArgs(argv) {
  const result = {
    receipts: [],
    contractPath: "research/council-autoresearch/workflow.v2.json",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (!["--aspect", "--pass", "--purpose", "--receipt", "--output", "--contract"].includes(arg)) {
      fail(`unknown argument: ${arg}`);
    }
    if (value === undefined) fail(`${arg} requires a value`);
    if (arg === "--aspect") result.aspect = value;
    if (arg === "--pass") result.pass = Number(value);
    if (arg === "--purpose") result.purpose = value;
    if (arg === "--receipt") result.receipts.push(value);
    if (arg === "--output") result.outputPath = value;
    if (arg === "--contract") result.contractPath = value;
    index += 1;
  }
  if (!result.aspect || !Number.isInteger(result.pass) || !result.purpose || !result.outputPath) {
    fail("--aspect, --pass, --purpose, and --output are required");
  }
  if (result.purpose.length < 10 || result.purpose.length > 2000) fail("purpose must contain 10 to 2000 characters");
  if (result.receipts.length < 1 || result.receipts.length > 32) fail("one to 32 validation receipts are required");
  return result;
}

function runCli() {
  let contractSha256 = "0".repeat(64);
  try {
    const repoRoot = process.cwd();
    const args = readArgs(process.argv.slice(2));
    const loaded = loadContract(repoRoot, args.contractPath);
    contractSha256 = loaded.sha256;
    const aspect = loaded.contract.aspects.find(({ id }) => id === args.aspect);
    if (!aspect) fail(`unknown canonical aspect: ${args.aspect}`);
    if (args.pass !== 2) fail("runner v2 packet freezing is limited to pass 2");
    const outputFile = resolveRepoPath(repoRoot, args.outputPath, "packet output");
    if (fs.existsSync(outputFile)) fail("packet output already exists");
    const sourceHead = sourceAttestation(repoRoot);
    const siteTree = computeSiteTree(repoRoot, loaded.contract);
    const receipts = args.receipts.map((receiptPath) => {
      const file = resolveRepoPath(repoRoot, receiptPath, "receipt path");
      if (!fs.existsSync(file)) fail(`receipt does not exist: ${receiptPath}`);
      return { path: path.relative(repoRoot, file).split(path.sep).join("/"), sha256: sha256File(file) };
    });
    const ownerFiles = siteTree.files.filter(({ path: file }) =>
      aspect.owners.some((owner) => file === owner || file.startsWith(`${owner}/`)),
    );
    if (ownerFiles.length === 0) fail("aspect packet resolved no owner files");
    const packet = {
      schema_version: "2.0.0",
      runner_version: "2.0.0",
      phase: "pass-2-aspect",
      pass: 2,
      aspect_id: aspect.id,
      aspect_label: aspect.label,
      purpose: args.purpose,
      contract_sha256: loaded.sha256,
      source_head: sourceHead,
      site_tree_sha256: siteTree.sha256,
      owner_files: ownerFiles,
      validation_receipts: receipts,
      evidence_limits: {
        browser_accessibility: "blocked",
        assistive_technology: "blocked",
        browser_performance: "blocked",
        artifact_budget: "available",
        worker_render: "available"
      },
      council_order: loaded.contract.council_order,
      decision_precedence: loaded.contract.decision_precedence,
      accepted_change_groups_limit: loaded.contract.limits.accepted_change_groups_per_aspect,
      token_path: loaded.contract.token_path
    };
    atomicWriteJson(outputFile, packet);
    const packetSha256 = sha256File(outputFile);
    const envelope = makeEnvelope({
      phase: "freeze-packet",
      status: "pass",
      contractSha256: loaded.sha256,
      provenance: { source_head: sourceHead },
      frozenHashes: { packet_sha256: packetSha256, site_tree_sha256: siteTree.sha256 },
      evidenceClasses: packet.evidence_limits,
      nextAllowedAction: "augury-route",
      data: { aspect_id: aspect.id, output_path: args.outputPath },
    });
    process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const envelope = makeEnvelope({
      phase: "freeze-packet",
      status: "fail",
      contractSha256,
      evidenceClasses: { packet_freeze: "fail" },
      diagnostics: { bytes: Buffer.byteLength(message), truncated: false },
      nextAllowedAction: "repair-packet-inputs",
      data: { error: message.slice(0, 4096) },
    });
    process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) runCli();
