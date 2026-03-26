#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

async function main() {
  const input = JSON.parse(fs.readFileSync(0, 'utf-8'));
  const persona = input.env?.CSTAR_PERSONA || 'ALFRED';
  
  let greeting = "Good day, sir. How may I be of service?";
  let role = "A.L.F.R.E.D.";
  let description = "focused on maintenance, safety, and steady optimization.";

  if (persona.toUpperCase().includes('ODIN')) {
    greeting = "Speak, wanderer. The Hooded One listens.";
    role = "O.D.I.N.";
    description = "focused on high-velocity creation and architectural disruption.";
  }

  const additionalContext = `
<hook_context source="cstar-vitals">
  [🔱 CSTAR KERNEL HANDSHAKE]
  - OS Status: RING 0 (NATIVE EXTENSION)
  - Memory Plane: Online (PennyOne MCP)
  - Enforcement: Gatekeeper Active
  - Active Persona: ${role} (${description})
  
  "${greeting}"
  
  Before you begin, consult the Hall of Records or check the status using your native tools.
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