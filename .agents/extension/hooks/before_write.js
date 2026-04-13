#!/usr/bin/env node
import fs from 'node:fs';

async function main() {
  const input = JSON.parse(fs.readFileSync(0, 'utf-8'));
  const { tool_name, tool_input } = input;
  
  if (tool_name !== 'write_file' && tool_name !== 'replace') {
    console.log(JSON.stringify({ decision: "allow" }));
    return;
  }

  const filePath = tool_input.file_path;
  
  if (!filePath || filePath.endsWith('.md') || filePath.endsWith('.json') || filePath.endsWith('.feature') || filePath.includes('test')) {
      console.log(JSON.stringify({ decision: "allow" }));
      return;
  }

  const content = tool_input.content || tool_input.instruction || '';
  const hasTrace = content.includes('// Corvus Star Trace [Ω]');

  if (!hasTrace) {
      console.log(JSON.stringify({ 
          decision: "deny", 
          reason: `[KERNEL PANIC]: Linscott Breach Detected. You are attempting to modify '${filePath}' directly without a valid Corvus Star Trace [Ω] intent block. Delegate this to the 'autobot' subagent or use the 'chant-planner'.`,
          systemMessage: "⚠️ Operation blocked by CStar Gatekeeper"
      }));
      return;
  }

  console.log(JSON.stringify({ decision: "allow" }));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
