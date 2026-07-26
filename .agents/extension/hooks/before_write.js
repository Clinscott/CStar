#!/usr/bin/env node
import fs from 'node:fs';

async function main() {
  const input = JSON.parse(fs.readFileSync(0, 'utf-8'));
  const { tool_name } = input;
  
  if (tool_name !== 'write_file' && tool_name !== 'replace') {
    console.log(JSON.stringify({ decision: "allow" }));
    return;
  }

  // Routing authority is established before tool execution by the
  // session-start sidecar's cstar_augury MCP call. Source text is not an
  // authentication channel: requiring a magic comment here encourages agents
  // to fabricate or copy routing data into every file and lets stale headers
  // masquerade as authorization. Write safety belongs to the host's normal
  // permission boundary and deterministic mutation guards.
  console.log(JSON.stringify({ decision: "allow" }));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
