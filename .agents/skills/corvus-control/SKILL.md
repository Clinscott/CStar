---
name: corvus-control
description: Orchestrates the Corvus Star (C*) framework by resolving commands between Node.js and Python dispatchers, executing workflows, and persisting neural learning. Use when the user requests cstar commands, workflows (lets-go, run-task), or ravens status.
---

# Corvus Star Control

This skill unifies the Gungnir Control Plane, allowing the agent to execute core framework commands and specialized workflows while maintaining the "Saga of the Code."

## ◈ Mandate: MCP Tool Priority
You **MUST** prioritize the 'corvus-control' and 'pennyone' MCP tools over direct shell execution (e.g., 'node bin/cstar.js start'). These tools are the authoritative 'Bifrost Bridge' into the system.

## ◈ Core Workflows

### 1. Initiating the System Pulse (The Awakening)
When the user requests to 'start', 'awaken', or 'initiate' the system:
- Call 'corvus-control.execute_cstar_command' with 'command: "start"'.
- Do NOT provide additional arguments unless specified.

### 2. Managing the Agent Loop
When the user provides a target or task (e.g., 'start the agent on src/'):
- Call 'corvus-control.execute_cstar_command' with 'command: "start"' and 'args: ["target_path"]'.
- Use the '--task' option via 'args' if a specific objective is provided.

### 3. Raven Dispatch (Monitoring)
When the user asks to 'check ravens' or 'monitor':
- Call 'corvus-control.execute_cstar_command' with 'command: "ravens"'.

### 4. Running Sovereign Workflows
When the user asks for high-level operations like 'fish', 'investigate', or 'lets-go':
- Call 'corvus-control.run_workflow' with the corresponding workflow name.

## ◈ System Vitals & Compliance
- Use 'corvus-control.get_system_vitals' to check the health of the Matrix.
- Use 'corvus-control.verify_sterling_compliance' when reviewing or refactoring code to ensure adherence to the Sterling Mandate.

## ◈ Protocol: PennyOne (The Brain)
- For any search-by-intent or indexing tasks, use the 'pennyone' tools.
- Consult 'pennyone.get_technical_debt' before starting any refactoring tasks.

## ◈ Legacy Engine Resolution (Fallback)
If MCP tools are unavailable, fallback to:
- **Node.js Engine**: 'node bin/cstar.js <command>'.
- **Python Engine**: All dynamic workflows ('lets-go', 'run-task', 'investigate', 'fish', 'wrap-it-up').
