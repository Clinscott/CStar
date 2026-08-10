import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { buildChildEnvironment } from "../research/council-autoresearch/scripts/augury-route.mjs";
import {
  BoundedTextBuffer,
  loadContract,
  ratingContextSha256,
} from "../research/council-autoresearch/scripts/runner-core.mjs";
import {
  evaluatePanel,
  persistFirstGeneration,
} from "../research/council-autoresearch/scripts/sprt-evaluate.mjs";
import { validateIndex } from "../research/council-autoresearch/scripts/validate-run.mjs";
import { transitionState } from "../research/council-autoresearch/scripts/workflow-state.mjs";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const contractPath = "research/council-autoresearch/workflow.v2.json";
const indexPath = "research/council-autoresearch/run-index.v2.json";
const loaded = loadContract(projectRoot, contractPath);

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function clonedRunnerRepository(t) {
  const root = await mkdtemp(path.join(tmpdir(), "morderith-runner-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(
    path.join(projectRoot, "research", "council-autoresearch"),
    path.join(root, "research", "council-autoresearch"),
    { recursive: true },
  );
  return root;
}

function baseBindings() {
  return {
    baseline_sha256: "1".repeat(64),
    candidate_sha256: "2".repeat(64),
    packet_sha256: "3".repeat(64),
    rubric_sha256: "4".repeat(64),
    evidence_sha256: "5".repeat(64),
  };
}

function ratingsInput(preference = "B") {
  const bindings = baseBindings();
  const contextSha256 = ratingContextSha256(bindings);
  const ratings = loaded.contract.council_order.map((expert) => ({
    expert,
    preference,
    rationale: `${expert} reviewed the frozen pair and recorded a bounded preference.`,
    context_sha256: contextSha256,
    axis_scores: Object.fromEntries(
      loaded.contract.rating.rating_axes.map((axis) => [axis, { A: 3, B: preference === "A" ? 2 : 4 }]),
    ),
    protected_axis_regressions: Object.fromEntries(
      loaded.contract.rating.protected_axes.map((axis) => [axis, false]),
    ),
  }));
  return {
    schema_version: "2.0.0",
    runner_version: "2.0.0",
    run_id: "morderith-generation-1",
    generation: 1,
    contract_sha256: loaded.sha256,
    seed: "morderith-generation-1-seed",
    source: { head: "a".repeat(40) },
    blind_mapping: { A: "baseline", B: "candidate" },
    bindings,
    ratings,
  };
}

test("the active-run index classifies pass one and the legal pass-two lifecycle", () => {
  const result = validateIndex(projectRoot, indexPath);
  assert.equal(result.active_pass_1_records, 9);
  assert.equal(result.superseded_pass_1_records, 5);
  assert.ok(result.active_pass_2_records >= 0 && result.active_pass_2_records <= 9);
  assert.ok(["pending", "running", "complete"].includes(result.pass_2_status));
  assert.equal(result.council_records_validated, 209 + 19 * result.active_pass_2_records);
});

test("runner preflight rejects an unclassified record, a bad hash, and a missing gate", async (t) => {
  await t.test("unclassified record", async (t) => {
    const root = await clonedRunnerRepository(t);
    const unknown = path.join(root, "research/council-autoresearch/runs/pass-1/unknown.json");
    await writeJson(unknown, {});
    assert.throws(() => validateIndex(root, indexPath), /unknown, unclassified, or missing/i);
  });

  await t.test("bad active hash", async (t) => {
    const root = await clonedRunnerRepository(t);
    const indexFile = path.join(root, indexPath);
    const index = JSON.parse(await readFile(indexFile, "utf8"));
    index.passes["pass-1"].active[0].sha256 = "0".repeat(64);
    await writeJson(indexFile, index);
    assert.throws(() => validateIndex(root, indexPath), /hash mismatch/i);
  });

  await t.test("missing required legacy gate", async (t) => {
    const root = await clonedRunnerRepository(t);
    const indexFile = path.join(root, indexPath);
    const index = JSON.parse(await readFile(indexFile, "utf8"));
    const entry = index.passes["pass-1"].active[0];
    const runFile = path.join(root, entry.path);
    const run = JSON.parse(await readFile(runFile, "utf8"));
    delete run.validation.build;
    await writeJson(runFile, run);
    entry.sha256 = digest(await readFile(runFile));
    await writeJson(indexFile, index);
    assert.throws(() => validateIndex(root, indexPath), /validation\.build must pass/i);
  });
});

test("Augury child environment is allowlisted and diagnostics are bounded", () => {
  const environment = buildChildEnvironment(
    {
      PATH: "/usr/bin",
      LANG: "C.UTF-8",
      SENTINEL_SECRET: "must-not-cross",
      GITHUB_TOKEN: "must-not-cross",
    },
    loaded.contract,
    "/tmp/morderith-control-fixture",
  );
  assert.equal(environment.PATH, "/usr/bin");
  assert.equal(environment.CSTAR_CONTROL_ROOT, "/tmp/morderith-control-fixture");
  assert.equal(environment.TZ, "UTC");
  assert.ok(!("SENTINEL_SECRET" in environment));
  assert.ok(!("GITHUB_TOKEN" in environment));

  const buffer = new BoundedTextBuffer(8);
  buffer.append("123456");
  buffer.append("7890");
  assert.deepEqual(buffer.summary(), { bytes: 8, truncated: true, text: "12345678" });
});

test("workflow transitions reject skips and require receipt-bound gates", () => {
  const state = {
    schema_version: "2.0.0",
    runner_version: "2.0.0",
    run_id: "morderith-workflow-20260810",
    contract_sha256: loaded.sha256,
    phase: "workflow-reviewed",
    source_head: "a".repeat(40),
    transitions: [],
    completed_generations: [],
    token_path: loaded.contract.token_path,
  };
  const source = { head: "a".repeat(40), clean: true };
  const receipt = {
    schema_version: "2.0.0",
    runner_version: "2.0.0",
    contract_sha256: loaded.sha256,
    from: "workflow-reviewed",
    to: "runner-v2-frozen",
    source_parent: source.head,
    source_clean: true,
    evidence_validated: true,
    input_hashes: { runner: "b".repeat(64) },
    gates: Object.fromEntries(
      ["runner_preflight", "runner_tests", "site_verify", "source_clean"].map((gate) => [
        gate,
        { status: "pass", evidence_sha256: "c".repeat(64) },
      ]),
    ),
  };
  const next = transitionState(state, "runner-v2-frozen", receipt, loaded.contract, loaded.sha256, source);
  assert.equal(next.phase, "runner-v2-frozen");
  assert.equal(next.frozen_contract_sha256, loaded.sha256);
  assert.throws(
    () => transitionState(state, "stable", { ...receipt, to: "stable" }, loaded.contract, loaded.sha256, source),
    /illegal workflow transition/i,
  );
  const missingGate = structuredClone(receipt);
  delete missingGate.gates.site_verify;
  assert.throws(
    () => transitionState(state, "runner-v2-frozen", missingGate, loaded.contract, loaded.sha256, source),
    /site_verify/i,
  );
});

test("the bounded Council heuristic is seed-stable, order-invariant at verdict, and explicit about ties", () => {
  const acceptedInput = ratingsInput("B");
  const first = evaluatePanel(acceptedInput, loaded.contract, loaded.sha256);
  const repeated = evaluatePanel(structuredClone(acceptedInput), loaded.contract, loaded.sha256);
  assert.deepEqual(repeated, first);
  assert.equal(first.verdict, "ACCEPTED");
  assert.equal(first.promotion_allowed, true);
  assert.match(first.method_limitations.join(" "), /not established independent Bernoulli/i);

  const reordered = structuredClone(acceptedInput);
  reordered.ratings.reverse();
  const reorderedResult = evaluatePanel(reordered, loaded.contract, loaded.sha256);
  assert.equal(reorderedResult.verdict, first.verdict);
  assert.deepEqual(reorderedResult.seed_derived_order, first.seed_derived_order);
  assert.equal(reorderedResult.final_log_likelihood, first.final_log_likelihood);

  const rejected = evaluatePanel(ratingsInput("A"), loaded.contract, loaded.sha256);
  assert.equal(rejected.verdict, "REJECTED");
  const tied = evaluatePanel(ratingsInput("tie"), loaded.contract, loaded.sha256);
  assert.equal(tied.verdict, "INCONCLUSIVE");
  assert.equal(tied.effective_non_tie_trials, 0);
  assert.equal(tied.final_log_likelihood, 0);
});

test("ratings fail closed on protected regressions, context mutation, and incomplete rationale", () => {
  const protectedInput = ratingsInput("B");
  protectedInput.ratings[18].protected_axis_regressions.privacy = true;
  const protectedResult = evaluatePanel(protectedInput, loaded.contract, loaded.sha256);
  assert.equal(protectedResult.verdict, "REJECTED_PROTECTED_AXIS");
  assert.equal(protectedResult.promotion_allowed, false);

  const mutated = ratingsInput("B");
  mutated.bindings.candidate_sha256 = "6".repeat(64);
  assert.throws(() => evaluatePanel(mutated, loaded.contract, loaded.sha256), /context hash mismatch/i);
  const noRationale = ratingsInput("B");
  noRationale.ratings[0].rationale = "short";
  assert.throws(() => evaluatePanel(noRationale, loaded.contract, loaded.sha256), /rationale is too short/i);
  const secondGeneration = ratingsInput("B");
  secondGeneration.generation = 2;
  assert.throws(() => evaluatePanel(secondGeneration, loaded.contract, loaded.sha256), /exactly generation 1/i);
});

test("one immutable generation is persisted, idempotently replayed, and then paused", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "morderith-generation-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stateFile = path.join(root, "state.json");
  const outputFile = path.join(root, "decision.json");
  const input = ratingsInput("B");
  await writeJson(stateFile, {
    schema_version: "2.0.0",
    runner_version: "2.0.0",
    run_id: input.run_id,
    contract_sha256: loaded.sha256,
    phase: "stable",
    source_head: input.source.head,
    frozen_contract_sha256: loaded.sha256,
    transitions: [],
    completed_generations: [],
    token_path: loaded.contract.token_path,
    publication: {
      status: "verified",
      repository: "https://github.com/Clinscott/CStar",
      commit: "d".repeat(40),
      receipt_sha256: "e".repeat(64),
    },
    output_path: "decision.json",
    next_allowed_action: "run-generation-1",
  });
  const first = persistFirstGeneration({
    input,
    stateFile,
    outputFile,
    contract: loaded.contract,
    contractSha256: loaded.sha256,
  });
  assert.equal(first.idempotent, false);
  const paused = JSON.parse(await readFile(stateFile, "utf8"));
  assert.equal(paused.phase, "paused");
  assert.equal(paused.completed_generations.length, 1);
  assert.equal(paused.completed_generations[0].verdict, "ACCEPTED");

  const replay = persistFirstGeneration({
    input,
    stateFile,
    outputFile,
    contract: loaded.contract,
    contractSha256: loaded.sha256,
  });
  assert.equal(replay.idempotent, true);
  const changed = structuredClone(input);
  changed.seed = "a-different-generation-seed";
  assert.throws(
    () => persistFirstGeneration({ input: changed, stateFile, outputFile, contract: loaded.contract, contractSha256: loaded.sha256 }),
    /different completed generation/i,
  );
});

test("the current visual baseline no longer claims an infinite ambient animation", async () => {
  const baseline = JSON.parse(
    await readFile(path.join(projectRoot, "research/council-autoresearch/visual-baseline.json"), "utf8"),
  );
  assert.equal(baseline.schema_version, "2.0.0");
  assert.deepEqual(baseline.motion_inventory.ambient, []);
  assert.equal(baseline.motion_inventory.computed_infinite_animations_expected, 0);
});
