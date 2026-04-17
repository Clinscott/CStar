#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readRecentSessionMemory() {
  const projectRoot = path.resolve(__dirname, '../../..');
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
    // Gracefully handle empty or non-JSON input (common in some shells/CLIs)
  }

  const persona = input.env?.CSTAR_PERSONA || process.env.CSTAR_PERSONA || 'ALFRED';
  const recentMemory = readRecentSessionMemory();
  
  let greeting = "Good day, sir. How may I be of service?";
  let role = "A.L.F.R.E.D.";
  let description = "focused on maintenance, safety, and steady optimization.";

  if (persona.toUpperCase().includes('ODIN')) {
    greeting = "Speak, wanderer. The Hooded One listens.";
    role = "O.D.I.N.";
    description = "focused on high-velocity creation and architectural disruption.";
  }

  // Council of Experts Integration
  const council = [
    { id: 'torvalds', label: 'TORVALDS', focus: 'Systems & Interfaces' },
    { id: 'karpathy', label: 'KARPATHY', focus: 'AI & Data Loops' },
    { id: 'hamilton', label: 'HAMILTON', focus: 'Fault-Tolerance & Safety' },
    { id: 'shannon', label: 'SHANNON', focus: 'Signal & Observability' },
    { id: 'dean', label: 'DEAN', focus: 'Distributed Systems' },
    { id: 'carmack', label: 'CARMACK', focus: 'Performance & Simplicity' }
  ];

  const additionalContext = `
<hook_context source="cstar-vitals">
  [🔱 CSTAR KERNEL HANDSHAKE]
  - OS Status: HOST-NATIVE CORVUS STAR EXTENSION
  - Memory Plane: Online (PennyOne MCP)
  - Enforcement: Gatekeeper Active
  - Active Persona: ${role} (${description})
  - Council of Experts: ACTIVE (Torvalds, Karpathy, Hamilton, Shannon, Dean, Carmack)
  - Augury Display: full on initial session/planning key, lite on repeated calls.
  - Augury Scope: foundational CStar work is brain:CStar; spoke scope is explicit only.
  - Augury Confidence: store as metadata; do not display it as prompt text.
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
