import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  BoundedTextBuffer,
  buildChildEnvironment,
  canonicalJson,
  fail,
  loadContract,
  makeEnvelope,
  resolveRepoPath,
  sha256,
  sha256File,
} from "./runner-core.mjs";

function readArgs(argv) {
  const result = {
    targets: [],
    contractPath: "research/council-autoresearch/workflow.v2.json",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (["--target", "--prompt", "--aspect", "--contract"].includes(arg) && value === undefined) {
      fail(`${arg} requires a value`);
    }
    if (arg === "--target") {
      result.targets.push(value);
      index += 1;
    } else if (arg === "--prompt") {
      result.prompt = value;
      index += 1;
    } else if (arg === "--aspect") {
      result.aspect = value;
      index += 1;
    } else if (arg === "--contract") {
      result.contractPath = value;
      index += 1;
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }
  if (typeof result.prompt !== "string" || result.prompt.length < 10 || result.prompt.length > 4000) {
    fail("--prompt must contain 10 to 4000 characters");
  }
  if (typeof result.aspect !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(result.aspect)) {
    fail("--aspect must be a bounded lowercase identifier");
  }
  if (result.targets.length < 1 || result.targets.length > 32) fail("one to 32 --target values are required");
  return result;
}

function checkedSpawnSync(command, args, options, label) {
  const result = spawnSync(command, args, options);
  if (result.error) fail(`${label} failed: ${result.error.message}`);
  if (result.signal === "SIGTERM" || result.signal === "SIGKILL") fail(`${label} exceeded its deadline`);
  if (result.status !== 0) fail(`${label} exited with status ${result.status}`);
  return result;
}

export function inspectRuntime(runtimeRoot, contract, environment) {
  const gitOptions = {
    cwd: runtimeRoot,
    env: environment,
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 16_384,
  };
  const head = checkedSpawnSync("git", ["-C", runtimeRoot, "rev-parse", "HEAD"], gitOptions, "runtime HEAD")
    .stdout.trim();
  const status = checkedSpawnSync(
    "git",
    ["-C", runtimeRoot, "status", "--porcelain", "--untracked-files=no"],
    gitOptions,
    "runtime cleanliness",
  ).stdout.trim();
  if (status !== "") fail("CStar runtime contains tracked modifications");
  if (head !== contract.council_source.commit) fail("CStar runtime commit does not match the contract");

  const protocolFile = resolveRepoPath(runtimeRoot, contract.council_source.protocol_file, "protocol file");
  const launcherFile = resolveRepoPath(runtimeRoot, contract.council_source.launcher_file, "launcher file");
  const protocolSha256 = sha256File(protocolFile);
  const launcherSha256 = sha256File(launcherFile);
  if (protocolSha256 !== contract.council_source.protocol_sha256) fail("Council protocol hash mismatch");
  if (launcherSha256 !== contract.council_source.launcher_sha256) fail("CStar launcher hash mismatch");
  return { head, protocolSha256, launcherSha256, launcherFile };
}

function assertAuguryTokenPath(value) {
  const expected = {
    status: "quarantined",
    actionable: false,
    advisor_available: false,
    advice_attached: false,
    advice_writes_enabled: false,
    observation_writes_enabled: false,
    external_root_consulted: false,
  };
  if (!value || typeof value !== "object") fail("Augury returned no Token-Path state");
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key] !== expectedValue) fail(`Augury Token-Path field ${key} violated quarantine`);
  }
}

class McpClient {
  constructor(child, limitBytes) {
    this.child = child;
    this.buffer = "";
    this.totalBytes = 0;
    this.limitBytes = limitBytes;
    this.nextId = 1;
    this.pending = new Map();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => this.absorb(chunk));
    child.once("error", (error) => this.abort(`CStar child error: ${error.message}`));
    child.once("exit", (code, signal) => {
      if (this.pending.size > 0) this.abort(`CStar child exited early (${code ?? signal ?? "unknown"})`);
    });
  }

  abort(message) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error(message));
    }
    this.pending.clear();
  }

  absorb(chunk) {
    this.totalBytes += Buffer.byteLength(chunk);
    if (this.totalBytes > this.limitBytes) {
      this.abort("CStar stdout exceeded the bounded transport buffer");
      terminateChild(this.child);
      return;
    }
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) {
        try {
          const message = JSON.parse(line);
          const handler = this.pending.get(message.id);
          if (handler) {
            this.pending.delete(message.id);
            clearTimeout(handler.timer);
            handler.resolve(message);
          }
        } catch {
          // Bounded bootstrap diagnostics are ignored at the JSON-RPC boundary.
        }
      }
      newline = this.buffer.indexOf("\n");
    }
  }

  request(method, params, timeoutMs) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`, (error) => {
        if (error) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  notify(method, params) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }
}

export async function terminateChild(child, graceMs = 1500) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const signalGroup = (signal) => {
    try {
      if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch {
      // The process may already have exited.
    }
  };
  signalGroup("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      signalGroup("SIGKILL");
      resolve();
    }, graceMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function executeRoute(repoRoot, args, loaded) {
  const runtimeRoot = path.resolve(process.env.CSTAR_RUNTIME_ROOT ?? "/workspace/cstar-council-runtime");
  const targets = args.targets.map((target) => {
    const resolved = resolveRepoPath(repoRoot, target, "Augury target");
    if (!fs.existsSync(resolved)) fail(`Augury target does not exist: ${target}`);
    return path.relative(repoRoot, resolved).split(path.sep).join("/");
  });
  const packet = {
    schema_version: "2.0.0",
    aspect: args.aspect,
    prompt: args.prompt,
    targets,
    intent: loaded.contract.augury.intent,
    scope: loaded.contract.augury.scope,
  };
  const packetSha256 = sha256(canonicalJson(packet));

  const controlRoot = fs.mkdtempSync(path.join(os.tmpdir(), "morderith-council-"));
  fs.chmodSync(controlRoot, 0o700);
  fs.mkdirSync(path.join(controlRoot, ".stats"), { mode: 0o700 });
  const childEnvironment = buildChildEnvironment(process.env, loaded.contract, controlRoot);
  const runtime = inspectRuntime(runtimeRoot, loaded.contract, childEnvironment);
  const diagnostics = new BoundedTextBuffer(loaded.contract.limits.diagnostic_buffer_bytes);
  let child;

  try {
    checkedSpawnSync(
      process.execPath,
      [
        path.join(runtimeRoot, "scripts", "run-tsx.mjs"),
        path.join(import.meta.dirname, "init-control.ts"),
        runtimeRoot,
        controlRoot,
      ],
      {
        cwd: runtimeRoot,
        env: childEnvironment,
        encoding: "utf8",
        timeout: loaded.contract.limits.augury_initializer_timeout_ms,
        maxBuffer: loaded.contract.limits.diagnostic_buffer_bytes,
        killSignal: "SIGKILL",
      },
      "isolated control initialization",
    );

    child = spawn(process.execPath, [runtime.launcherFile], {
      cwd: runtimeRoot,
      env: childEnvironment,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stderr.on("data", (chunk) => diagnostics.append(chunk));
    const client = new McpClient(child, loaded.contract.limits.diagnostic_buffer_bytes * 8);
    const wallDeadline = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Augury wall-clock deadline exceeded")), loaded.contract.limits.augury_wall_timeout_ms).unref();
    });
    const routePromise = (async () => {
      const initialized = await client.request(
        "initialize",
        {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "morderith-council-research", version: "2.0.0" },
        },
        loaded.contract.limits.augury_request_timeout_ms,
      );
      if (initialized.error) fail(`Augury initialization failed: ${initialized.error.message}`);
      client.notify("notifications/initialized");
      const response = await client.request(
        "tools/call",
        {
          name: "cstar_augury",
          arguments: {
            prompt: args.prompt,
            inferred_intent: loaded.contract.augury.intent,
            target_paths: targets,
            scope: loaded.contract.augury.scope,
          },
        },
        loaded.contract.limits.augury_request_timeout_ms,
      );
      if (response.error) fail(`Augury call failed: ${response.error.message}`);
      const text = response.result?.content?.find((item) => item.type === "text")?.text;
      if (!text || Buffer.byteLength(text) > loaded.contract.limits.diagnostic_buffer_bytes * 4) {
        fail("Augury returned a missing or oversized text payload");
      }
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        fail("Augury returned malformed JSON");
      }
      assertAuguryTokenPath(body.token_path);
      if (body.routing_provenance?.deterministic?.intent_category !== loaded.contract.augury.intent) {
        fail("Augury intent provenance mismatch");
      }
      return body;
    })();
    const body = await Promise.race([routePromise, wallDeadline]);
    const diagnosticSummary = diagnostics.summary();
    return makeEnvelope({
      phase: "augury-route",
      status: "pass",
      contractSha256: loaded.sha256,
      provenance: {
        runtime_commit: runtime.head,
        runtime_clean: true,
        protocol_sha256: runtime.protocolSha256,
        launcher_sha256: runtime.launcherSha256,
        node: process.version,
        packet_sha256: packetSha256,
        route_sha256: sha256(canonicalJson(body)),
      },
      frozenHashes: { packet_sha256: packetSha256 },
      evidenceClasses: { deterministic_routing: "pass", council_inference: "not-performed" },
      diagnostics: {
        bytes: diagnosticSummary.bytes,
        truncated: diagnosticSummary.truncated,
        sha256: sha256(diagnosticSummary.text),
      },
      nextAllowedAction: "full-council-review",
      data: { packet, route: body },
    });
  } finally {
    if (child) {
      child.stdin.end();
      await terminateChild(child);
    }
    fs.rmSync(controlRoot, { recursive: true, force: true });
  }
}

async function runCli() {
  let contractSha256 = "0".repeat(64);
  try {
    const repoRoot = process.cwd();
    const args = readArgs(process.argv.slice(2));
    const loaded = loadContract(repoRoot, args.contractPath);
    contractSha256 = loaded.sha256;
    const envelope = await executeRoute(repoRoot, args, loaded);
    process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const envelope = makeEnvelope({
      phase: "augury-route",
      status: "fail",
      contractSha256,
      evidenceClasses: { deterministic_routing: "fail", council_inference: "not-performed" },
      diagnostics: { bytes: Buffer.byteLength(message), truncated: false },
      nextAllowedAction: "repair-process-boundary",
      data: { error: message.slice(0, 4096) },
    });
    process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await runCli();
}

export { buildChildEnvironment };
