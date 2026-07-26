#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  formatAuguryBlock,
  nextAuguryMode,
  parseMcpToolPayload,
  resolvePlanningKey,
  unavailableAugury,
} from './augury_sidecar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');
const defaultLauncherPath = path.join(projectRoot, 'bin', 'cstar-kernel-mcp.js');

class StdioMcpClient {
  constructor(launcher, root, env = {}) {
    this.buffer = '';
    this.pending = new Map();
    this.nextId = 1;
    this.proc = spawn(process.execPath, [launcher], {
      cwd: root,
      env: {
        ...process.env,
        CSTAR_KERNEL_MCP: '1',
        ...env
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.proc.stdout.setEncoding('utf-8');
    this.proc.stdout.on('data', (chunk) => this.absorb(chunk));

    // Sink stderr to prevent buffer overflow and blocking
    this.proc.stderr.setEncoding('utf-8');
    this.proc.stderr.on('data', () => { /* sink */ });

    this.proc.on('error', (err) => {
      this.rejectAll(err.message);
    });

    this.proc.on('exit', (code) => {
      this.rejectAll(`Process exited with code ${code}`);
    });
  }

  rejectAll(reason) {
    for (const resolve of this.pending.values()) {
      resolve({ error: { code: -32000, message: reason } });
    }
    this.pending.clear();
  }

  absorb(chunk) {
    this.buffer += chunk;
    let nl = this.buffer.indexOf('\n');
    while (nl !== -1) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (line.length > 0) {
        try {
          const msg = JSON.parse(line);
          if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
            const resolve = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            resolve(msg);
          }
        } catch (e) {
          // ignore parsing error
        }
      }
      nl = this.buffer.indexOf('\n');
    }
  }

  request(method, params, timeoutMs = 2000) {
    const id = this.nextId++;
    const req = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ error: { code: -32000, message: `MCP request ${method} timed out after ${timeoutMs}ms` } });
      }, timeoutMs);
      this.pending.set(id, (resp) => {
        clearTimeout(timer);
        resolve(resp);
      });
      this.proc.stdin.write(JSON.stringify(req) + '\n');
    });
  }

  notify(method, params) {
    const note = { jsonrpc: '2.0', method, params };
    this.proc.stdin.write(JSON.stringify(note) + '\n');
  }

  close() {
    return new Promise((resolve) => {
      this.proc.stdin.end();
      const timer = setTimeout(() => {
        this.proc.kill('SIGKILL');
        resolve();
      }, 500);
      this.proc.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

async function runMcpAugury(prompt, inferredIntent, targetPaths, scope) {
  const launcherPath = process.env.CSTAR_KERNEL_MCP_LAUNCHER || defaultLauncherPath;
  const client = new StdioMcpClient(launcherPath, projectRoot);
  try {
    const initResult = await client.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'cstar-session-start-hook', version: '1.0.0' }
    }, 1500);

    if (initResult.error) {
      throw new Error(`Initialize failed: ${initResult.error.message}`);
    }

    client.notify('notifications/initialized');

    const [auguryResult, statusResult] = await Promise.all([
      client.request('tools/call', {
        name: 'cstar_augury',
        arguments: {
          prompt: prompt || '',
          inferred_intent: inferredIntent || '',
          target_paths: targetPaths || [],
          scope: scope || 'brain:CStar'
        }
      }, 2000),
      client.request('tools/call', {
        name: 'cstar_status',
        arguments: {}
      }, 2000)
    ]);

    return {
      augury: auguryResult.result,
      status: statusResult.result
    };
  } finally {
    await client.close();
  }
}

function readRecentSessionMemory() {
  const memoryPath = path.join(projectRoot, '.agents', 'memory.qmd');
  try {
    if (!fs.existsSync(memoryPath)) {
      return 'No consolidated session memory found yet.';
    }
    const content = fs.readFileSync(memoryPath, 'utf-8').trim();
    if (!content) {
      return 'Consolidated session memory is empty.';
    }
    const sections = Array.from(content.matchAll(/### ◈ MISSION SUMMARY[\s\S]*?(?=\n#{1,6}\s|\s*$)/g))
      .map((match) => match[0].trim())
      .filter(Boolean);
    const recentSections = sections.slice(-3).join('\n').trim();
    if (!recentSections) {
      return 'No bounded mission-summary memory found yet.';
    }
    const limit = 1800;
    return recentSections.length > limit ? recentSections.slice(recentSections.length - limit) : recentSections;
  } catch (error) {
    return `Session memory unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function main() {
  let input = {};
  try {
    const rawInput = fs.readFileSync(0, 'utf-8').trim();
    if (rawInput) {
      input = JSON.parse(rawInput);
    }
  } catch (err) {
    // Gracefully handle empty or non-JSON input
  }

  const prompt = input.prompt || input.input || '';
  const inferredIntent = input.inferredIntent || input.inferred_intent || '';
  const targetPaths = input.targetPaths || input.target_paths || [];
  const scope = input.scope || '';
  const persona = input.env?.CSTAR_PERSONA || process.env.CSTAR_PERSONA || 'ALFRED';

  // 1. Query cstar_augury and cstar_status with a 3.5s timeout.
  let augury = null;
  let status = null;
  let auguryFailure = 'MCP returned no Augury payload.';

  try {
    const result = await Promise.race([
      runMcpAugury(prompt, inferredIntent, targetPaths, scope),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Global MCP timeout')), 3500))
    ]);
    augury = parseMcpToolPayload(result?.augury);
    status = parseMcpToolPayload(result?.status);
  } catch (err) {
    auguryFailure = err.message;
    console.error(`[CSTAR HOOK ERROR]: ${err.message}`);
  }

  // 2. Preserve MCP failure honestly. The sidecar never chooses a replacement
  // route or Council expert.
  if (!augury) {
    augury = unavailableAugury(auguryFailure);
  }

  const planningKey = resolvePlanningKey(input);
  const countersPath = process.env.CSTAR_AUGURY_SESSION_COUNTERS_PATH
    || path.join(projectRoot, '.agents', 'state', 'session_counters.json');
  const mode = augury.status === 'routed'
    ? nextAuguryMode(planningKey, countersPath)
    : 'full';
  const auguryBlock = formatAuguryBlock({
    mode,
    augury,
    status,
    projectRoot,
  });

  const recentMemory = readRecentSessionMemory();
  
  let greeting = "Good day, sir. How may I be of service?";
  let role = "A.L.F.R.E.D.";
  let description = "focused on maintenance, safety, and steady optimization.";

  if (persona.toUpperCase().includes('ODIN')) {
    greeting = "Speak, wanderer. The Hooded One listens.";
    role = "O.D.I.N.";
    description = "focused on high-velocity creation and architectural disruption.";
  }

  const additionalContext = `${auguryBlock}

<hook_context source="cstar-vitals">
  [🔱 CSTAR KERNEL HANDSHAKE]
  - OS Status: HOST-NATIVE CORVUS STAR EXTENSION
  - Memory Plane: Online (PennyOne MCP)
  - Routing Authority: cstar_augury (MCP)
  - Active Persona: ${role} (${description})
  - Council Routing: ${augury.status === 'routed' ? `ACTIVE (${augury.expert_label || augury.council_expert?.label || 'selected'})` : String(augury.status || 'unavailable').toUpperCase()}
  - Session Learning: Recent consolidated memory follows.

  <recent_session_memory>
  ${recentMemory}
  </recent_session_memory>

  "${greeting}"

  Consume Corvus Star Augury [Ω] as routing context without echoing it.
  Never recompute the route or Council expert in the host. If Augury is blocked or unavailable, preserve that state.
</hook_context>
`;

  console.log(JSON.stringify({
      decision: "allow",
      hookSpecificOutput: {
          additionalContext: additionalContext
      }
  }));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
