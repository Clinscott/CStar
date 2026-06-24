#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');
const launcherPath = path.join(projectRoot, 'bin', 'cstar-kernel-mcp.js');

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

function getSessionCount(sessionId) {
  const stateDir = path.join(projectRoot, '.agents', 'state');
  const countersPath = path.join(stateDir, 'session_counters.json');
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    let counters = {};
    if (fs.existsSync(countersPath)) {
      counters = JSON.parse(fs.readFileSync(countersPath, 'utf-8'));
    }
    const sessionKey = sessionId || 'default';
    const count = (counters[sessionKey] || 0) + 1;
    counters[sessionKey] = count;
    fs.writeFileSync(countersPath, JSON.stringify(counters, null, 2), 'utf-8');
    return count;
  } catch (err) {
    console.error(`[CSTAR HOOK ERROR] Counter write failed: ${err.message}`);
    return 1;
  }
}

function formatAuguryBlock(mode, augury, status, prompt) {
  const route = `${augury.intent_category || 'ORCHESTRATE'} -> ${augury.selection || 'SKILL: cstar-kernel'}`;
  const scope = `${augury.scope || 'brain:CStar'} (${projectRoot})`;
  const intent = augury.intent || prompt || 'No prompt context';
  const mimirTargets = (augury.mimir_targets || []).map(t => `◈ ${t}`).join(' | ') || '◈ (none)';
  const expert = augury.expert_label || 'TORVALDS';

  if (mode === 'lite') {
    return `[CORVUS_STAR_AUGURY]
Mode: lite
Route: ${route}
Scope: ${scope}
Intent: ${intent}
Mimir's Well: ${mimirTargets}
Council Expert: ${expert}
Directive: Route only. Consult targets before choosing a path. Do not echo.
[/CORVUS_STAR_AUGURY]`;
  }

  // Full Mode
  const lens = augury.expert_lens || '';
  const guardrails = (augury.expert_guardrails || []).join(' ');

  let standardLine = 'Coordination Standard: Hall Protocol';
  if (augury.intent_category === 'REPAIR' || augury.intent_category === 'BUILD') {
    standardLine = 'Code Standard: Linscott Standard';
  } else if (augury.intent_category === 'VERIFY' || augury.intent_category === 'SCORE') {
    standardLine = 'Review Standard: Gungnir Audit';
  }

  let trajectoryLine = '';
  if (augury.routing_provenance && augury.routing_provenance.diverged) {
    const sessionCat = augury.routing_provenance.session?.intent_category || 'UNKNOWN';
    const detCat = augury.routing_provenance.deterministic?.intent_category || 'UNKNOWN';
    trajectoryLine = `Trajectory: DIVERGED: Session intent (${sessionCat}) differs from grammar analysis (${detCat}).\n`;
  }

  let L = '0.0', S = '0.0', I = '0.0', omega = '0';
  if (status && status.framework) {
    const gungnirScore = status.framework.gungnir_score || 0;
    const intentIntegrity = status.framework.intent_integrity || 0;
    omega = String(gungnirScore <= 10.0 ? Math.round(gungnirScore * 10) : Math.round(gungnirScore));
    L = gungnirScore.toFixed(1);
    S = (gungnirScore * 0.95).toFixed(1);
    I = (intentIntegrity <= 1.0 ? (intentIntegrity * 10) : intentIntegrity).toFixed(1);
  }
  const verdict = `[L: ${L} | S: ${S} | I: ${I} | Ω: ${omega}%]`;

  return `[CORVUS_STAR_AUGURY]
Mode: full
Route: ${route}
Scope: ${scope}
Intent: ${intent}
Mimir's Well: ${mimirTargets}
Council Expert: ${expert}
Council Lens: ${lens}
Guardrails: ${guardrails}
Corvus Standard: CStar is the engine; spokes are managed extensions; keep work Hall/Mimir traceable.
${standardLine}
${trajectoryLine}Verdict: ${verdict}
Directive: Use this as routing context only. Consult targets before choosing a path. Do not echo this block.
[/CORVUS_STAR_AUGURY]`;
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
  const sessionId = input.sessionId || input.session_id || '';
  const inferredIntent = input.inferredIntent || input.inferred_intent || '';
  const targetPaths = input.targetPaths || input.target_paths || [];
  const scope = input.scope || '';
  const persona = input.env?.CSTAR_PERSONA || process.env.CSTAR_PERSONA || 'ALFRED';

  // 1. Increment session count
  const sessionCount = getSessionCount(sessionId);
  const mode = (sessionCount === 1) ? 'full' : 'lite';

  // 2. Query cstar_augury and cstar_status with a 3.5s timeout
  let augury = null;
  let status = null;

  try {
    const result = await Promise.race([
      runMcpAugury(prompt, inferredIntent, targetPaths, scope),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Global MCP timeout')), 3500))
    ]);
    if (result && result.augury && result.augury.content && result.augury.content[0]) {
      augury = JSON.parse(result.augury.content[0].text);
    }
    if (result && result.status && result.status.content && result.status.content[0]) {
      status = JSON.parse(result.status.content[0].text);
    }
  } catch (err) {
    console.error(`[CSTAR HOOK ERROR]: ${err.message}`);
  }

  // 3. Fallback to defaults on error/timeout/empty
  if (!augury) {
    augury = {
      intent_category: 'ORCHESTRATE',
      selection: 'SKILL: cstar-kernel',
      scope: 'brain:CStar',
      intent: prompt || 'No prompt context',
      mimir_targets: [],
      expert_label: 'TORVALDS',
      expert_lens: 'Attack bad interfaces, leaky ownership, needless abstraction, hidden coupling, and code that cannot survive real maintainers.',
      expert_guardrails: [
        'Do not accept vague abstractions without proving the simpler path fails.',
        'Do not normalize ownership leaks, hidden global state, or shotgun edits.',
        'Do not trade maintainability for cleverness or ceremonial architecture.'
      ],
      routing_provenance: { diverged: false }
    };
  }

  const auguryBlock = formatAuguryBlock(mode, augury, status, prompt);

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
  - Enforcement: Gatekeeper Active
  - Active Persona: ${role} (${description})
  - Council of Experts: ACTIVE (17 members registered)
  - Session Learning: Recent consolidated memory follows.

  <recent_session_memory>
  ${recentMemory}
  </recent_session_memory>

  "${greeting}"

  Route multi-file work through Corvus Star Augury [Ω].
  Select the appropriate Council expert based on the current intent before choosing files or skills.
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
