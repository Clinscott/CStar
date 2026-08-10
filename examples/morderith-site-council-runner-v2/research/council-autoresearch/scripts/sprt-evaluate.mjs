import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  atomicWriteJson,
  assertSha256,
  assertTokenPath,
  canonicalJson,
  deterministicCouncilOrder,
  fail,
  loadContract,
  makeEnvelope,
  ratingContextSha256,
  readJson,
  resolveRepoPath,
  sha256,
  sha256File,
} from "./runner-core.mjs";

function readArgs(argv) {
  const result = { contractPath: "research/council-autoresearch/workflow.v2.json" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (!["--input", "--state", "--output", "--contract"].includes(arg)) fail(`unknown argument: ${arg}`);
    if (value === undefined) fail(`${arg} requires a value`);
    if (arg === "--input") result.inputPath = value;
    if (arg === "--state") result.statePath = value;
    if (arg === "--output") result.outputPath = value;
    if (arg === "--contract") result.contractPath = value;
    index += 1;
  }
  if (!result.inputPath || !result.statePath || !result.outputPath) {
    fail("usage: node sprt-evaluate.mjs --input <ratings.json> --state <state.json> --output <decision.json> [--contract <workflow.v2.json>]");
  }
  return result;
}

function assertNumber(value, label, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    fail(`${label} must be between ${minimum} and ${maximum}`);
  }
}

function assertCleanRepository(repoRoot, expectedHead) {
  const options = { cwd: repoRoot, encoding: "utf8", timeout: 5000, maxBuffer: 16_384 };
  const head = spawnSync("git", ["rev-parse", "HEAD"], options);
  if (head.error || head.status !== 0) fail("could not attest the source repository HEAD");
  if (head.stdout.trim() !== expectedHead) fail("ratings source HEAD does not match the repository");
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], options);
  if (status.error || status.status !== 0) fail("could not attest source cleanliness");
  if (status.stdout.trim() !== "") fail("generation requires a clean committed source tree");
}

function assertPublishedRunnerCheckpoint(state) {
  const publication = state.publication;
  if (publication?.repository !== "https://github.com/Clinscott/CStar.git") {
    fail("generation 1 requires the canonical CStar GitHub repository publication");
  }
  if (typeof publication.branch !== "string" || !/^agent\/[a-z0-9][a-z0-9._/-]{2,127}$/.test(publication.branch)) {
    fail("runner publication requires an exact agent branch");
  }
  if (typeof publication.commit !== "string" || !/^[a-f0-9]{40}$/.test(publication.commit)) {
    fail("runner publication commit must be an exact Git commit SHA");
  }
  const result = spawnSync(
    "git",
    ["ls-remote", publication.repository, `refs/heads/${publication.branch}`],
    { encoding: "utf8", timeout: 15000, maxBuffer: 16384 },
  );
  if (result.error || result.status !== 0) fail("could not verify the CStar runner publication ref");
  const [commit, ref] = result.stdout.trim().split(/\s+/);
  if (commit !== publication.commit || ref !== `refs/heads/${publication.branch}`) {
    fail("CStar runner publication ref does not resolve to the declared commit");
  }
}

function nominalBoundaries(regime) {
  const { p0, p1, alpha, beta } = regime;
  if (!(p0 > 0 && p0 < p1 && p1 < 1)) fail("rating regime requires 0 < p0 < p1 < 1");
  if (!(alpha > 0 && alpha < 1 && beta > 0 && beta < 1)) {
    fail("nominal boundary parameters must be between zero and one");
  }
  return {
    upper: Math.log((1 - beta) / alpha),
    lower: Math.log(beta / (1 - alpha)),
  };
}

export function evaluatePanel(input, contract, contractSha256) {
  if (input.schema_version !== "2.0.0" || input.runner_version !== "2.0.0") {
    fail("ratings input must use schema and runner version 2.0.0");
  }
  if (input.generation !== 1) fail("the stable runner permits exactly generation 1 before pausing");
  if (typeof input.run_id !== "string" || !/^[a-z0-9][a-z0-9._-]{7,127}$/.test(input.run_id)) {
    fail("run_id must be a bounded immutable identifier");
  }
  if (input.contract_sha256 !== contractSha256) fail("ratings contract hash mismatch");
  const contextSha256 = ratingContextSha256(input.bindings);
  if (input.blind_mapping?.A !== "baseline" || input.blind_mapping?.B !== "candidate") {
    fail("generation 1 requires the preregistered A=baseline, B=candidate blind mapping");
  }
  if (!Array.isArray(input.ratings) || input.ratings.length !== contract.council_order.length) {
    fail("exactly 19 Council ratings are required");
  }
  const byExpert = new Map();
  for (const [index, rating] of input.ratings.entries()) {
    if (!rating || typeof rating !== "object") fail(`ratings[${index}] must be an object`);
    if (!contract.council_order.includes(rating.expert) || byExpert.has(rating.expert)) {
      fail(`ratings[${index}].expert is unknown or duplicated`);
    }
    if (!['A', 'B', 'tie'].includes(rating.preference)) fail(`${rating.expert} has an invalid preference`);
    if (typeof rating.rationale !== "string" || rating.rationale.trim().length < contract.rating.rationale_minimum_characters) {
      fail(`${rating.expert} rationale is too short`);
    }
    if (rating.context_sha256 !== contextSha256) fail(`${rating.expert} rating context hash mismatch`);
    const scoreAxes = Object.keys(rating.axis_scores ?? {});
    if (JSON.stringify(scoreAxes.sort()) !== JSON.stringify([...contract.rating.rating_axes].sort())) {
      fail(`${rating.expert} axis scores do not match the rubric`);
    }
    for (const axis of contract.rating.rating_axes) {
      assertNumber(rating.axis_scores[axis]?.A, `${rating.expert}.${axis}.A`, 1, 5);
      assertNumber(rating.axis_scores[axis]?.B, `${rating.expert}.${axis}.B`, 1, 5);
    }
    const protectedAxes = Object.keys(rating.protected_axis_regressions ?? {});
    if (JSON.stringify(protectedAxes.sort()) !== JSON.stringify([...contract.rating.protected_axes].sort())) {
      fail(`${rating.expert} protected-axis record is incomplete`);
    }
    for (const axis of contract.rating.protected_axes) {
      if (typeof rating.protected_axis_regressions[axis] !== "boolean") {
        fail(`${rating.expert}.${axis} must be an explicit boolean`);
      }
    }
    byExpert.set(rating.expert, rating);
  }

  const order = deterministicCouncilOrder(contract.council_order, input.seed);
  const regime = contract.rating.regime;
  const boundaries = nominalBoundaries(regime);
  const trajectory = [];
  let llr = 0;
  let candidatePreferences = 0;
  let baselinePreferences = 0;
  let ties = 0;
  const protectedRegressions = [];

  for (const [index, expert] of order.entries()) {
    const rating = byExpert.get(expert);
    let contribution = 0;
    if (rating.preference === "B") {
      candidatePreferences += 1;
      contribution = Math.log(regime.p1 / regime.p0);
    } else if (rating.preference === "A") {
      baselinePreferences += 1;
      contribution = Math.log((1 - regime.p1) / (1 - regime.p0));
    } else {
      ties += 1;
    }
    llr += contribution;
    for (const [axis, regressed] of Object.entries(rating.protected_axis_regressions)) {
      if (regressed) protectedRegressions.push({ expert, axis });
    }
    trajectory.push({
      panel_position: index + 1,
      expert,
      blinded_preference: rating.preference,
      contribution,
      cumulative_log_likelihood: llr,
    });
  }

  let verdict = "INCONCLUSIVE";
  if (llr >= boundaries.upper) verdict = "ACCEPTED";
  else if (llr <= boundaries.lower) verdict = "REJECTED";
  if (protectedRegressions.length > 0) verdict = "REJECTED_PROTECTED_AXIS";

  return {
    method: contract.rating.method,
    method_limitations: [
      "Council protocols are a related panel, not established independent Bernoulli trials.",
      "Nominal boundary parameters are tuning values, not empirical error guarantees.",
      "The verdict applies only to the frozen baseline, candidate, packet, rubric, and evidence hashes.",
    ],
    run_id: input.run_id,
    generation: 1,
    input_sha256: sha256(canonicalJson(input)),
    context_sha256: contextSha256,
    seed: input.seed,
    seed_derived_order: order,
    blind_mapping: input.blind_mapping,
    nominal_boundary_tuning: {
      null_preference_rate: regime.p0,
      candidate_preference_rate: regime.p1,
      upper: boundaries.upper,
      lower: boundaries.lower,
    },
    denominator: input.ratings.length,
    effective_non_tie_trials: candidatePreferences + baselinePreferences,
    candidate_preferences: candidatePreferences,
    baseline_preferences: baselinePreferences,
    ties,
    tie_policy: contract.rating.tie_policy,
    final_log_likelihood: llr,
    protected_axis_regressions: protectedRegressions,
    verdict,
    promotion_allowed: verdict === "ACCEPTED",
    trajectory,
  };
}

function validateState(state, input, contractSha256) {
  if (state.schema_version !== "2.0.0" || state.runner_version !== "2.0.0") {
    fail("runner state must use version 2.0.0");
  }
  if (state.contract_sha256 !== contractSha256) fail("runner state contract hash mismatch");
  if (state.run_id !== input.run_id) fail("runner state run_id mismatch");
  if (!Array.isArray(state.completed_generations)) fail("runner state completed_generations must be an array");
  if (state.completed_generations.length > 1) fail("runner state exceeds the generation limit");
  assertTokenPath(state.token_path, "runner state token_path");
  if (state.publication?.status !== "verified") {
    fail("generation 1 requires a verified CStar runner publication receipt");
  }
  if (typeof state.publication.repository !== "string" || state.publication.repository.length === 0) {
    fail("runner publication repository is required");
  }
  if (typeof state.publication.commit !== "string" || !/^[a-f0-9]{40}$/.test(state.publication.commit)) {
    fail("runner publication commit must be an exact Git commit SHA");
  }
  assertSha256(state.publication.receipt_sha256, "runner publication receipt_sha256");
}

export function persistFirstGeneration({ input, stateFile, outputFile, contract, contractSha256 }) {
  const state = readJson(stateFile);
  validateState(state, input, contractSha256);
  const evaluation = evaluatePanel(input, contract, contractSha256);
  const envelope = makeEnvelope({
    phase: "generation-1",
    status: "complete",
    contractSha256,
    provenance: {
      method: contract.rating.method,
      input_sha256: evaluation.input_sha256,
      context_sha256: evaluation.context_sha256,
    },
    frozenHashes: input.bindings,
    evidenceClasses: {
      council_panel: "complete",
      independent_trials: "not-established",
      browser_evidence: "blocked",
    },
    nextAllowedAction: "pause-and-report",
    data: evaluation,
  });
  const serialized = `${JSON.stringify(envelope, null, 2)}\n`;
  const decisionSha256 = sha256(serialized);

  if (state.phase === "paused") {
    const completed = state.completed_generations[0];
    if (
      state.completed_generations.length === 1 &&
      completed.generation === 1 &&
      completed.input_sha256 === evaluation.input_sha256 &&
      completed.decision_sha256 === decisionSha256 &&
      fs.existsSync(outputFile) &&
      sha256File(outputFile) === decisionSha256
    ) {
      return { envelope: readJson(outputFile), decisionSha256, idempotent: true };
    }
    fail("runner is paused after a different completed generation");
  }
  if (state.completed_generations.length !== 0) {
    fail("generation 1 may run only before a completed generation exists");
  }
  if (state.phase === "stable") {
    atomicWriteJson(stateFile, {
      ...state,
      phase: "generation-1-running",
      active_generation: {
        generation: 1,
        input_sha256: evaluation.input_sha256,
        context_sha256: evaluation.context_sha256,
      },
      transitions: [
        ...state.transitions,
        {
          from: "stable",
          to: "generation-1-running",
          input_sha256: evaluation.input_sha256,
        },
      ],
      next_allowed_action: "complete-generation-1",
    });
  } else if (
    state.phase !== "generation-1-running" ||
    state.active_generation?.generation !== 1 ||
    state.active_generation?.input_sha256 !== evaluation.input_sha256
  ) {
    fail("generation 1 may run once from stable state or resume the same immutable input");
  }
  if (fs.existsSync(outputFile)) {
    if (sha256File(outputFile) !== decisionSha256) fail("existing decision output conflicts with generation 1");
  } else {
    atomicWriteJson(outputFile, envelope);
  }
  const nextState = {
    ...state,
    phase: "paused",
    active_generation: null,
    completed_generations: [
      {
        generation: 1,
        verdict: evaluation.verdict,
        promotion_allowed: evaluation.promotion_allowed,
        input_sha256: evaluation.input_sha256,
        decision_sha256: decisionSha256,
        output_path: state.output_path,
      },
    ],
    transitions: [
      ...state.transitions,
      ...(state.phase === "stable"
        ? [{ from: "stable", to: "generation-1-running", input_sha256: evaluation.input_sha256 }]
        : []),
      {
        from: "generation-1-running",
        to: "paused",
        decision_sha256: decisionSha256,
      },
    ],
    next_allowed_action: "pause-and-report",
  };
  atomicWriteJson(stateFile, nextState);
  return { envelope, decisionSha256, idempotent: false };
}

function runCli() {
  let contractSha256 = "0".repeat(64);
  let lockFile;
  try {
    const repoRoot = process.cwd();
    const args = readArgs(process.argv.slice(2));
    const loaded = loadContract(repoRoot, args.contractPath);
    contractSha256 = loaded.sha256;
    const inputFile = resolveRepoPath(repoRoot, args.inputPath, "ratings input");
    const stateFile = resolveRepoPath(repoRoot, args.statePath, "runner state");
    const outputFile = resolveRepoPath(repoRoot, args.outputPath, "decision output");
    const input = readJson(inputFile);
    assertCleanRepository(repoRoot, input.source?.head);
    assertPublishedRunnerCheckpoint(readJson(stateFile));
    lockFile = `${stateFile}.lock`;
    const descriptor = fs.openSync(lockFile, "wx", 0o600);
    fs.writeFileSync(descriptor, `${process.pid}\n`);
    fs.closeSync(descriptor);
    const result = persistFirstGeneration({
      input,
      stateFile,
      outputFile,
      contract: loaded.contract,
      contractSha256,
    });
    process.stdout.write(`${JSON.stringify(result.envelope, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const envelope = makeEnvelope({
      phase: "generation-1",
      status: "fail",
      contractSha256,
      evidenceClasses: { council_panel: "not-completed", independent_trials: "not-established" },
      diagnostics: { bytes: Buffer.byteLength(message), truncated: false },
      nextAllowedAction: "repair-generation-evidence",
      data: { error: message.slice(0, 4096) },
    });
    process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
    process.exitCode = 1;
  } finally {
    if (lockFile) {
      try {
        fs.unlinkSync(lockFile);
      } catch {
        // A missing lock means acquisition failed or cleanup already completed.
      }
    }
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) runCli();
