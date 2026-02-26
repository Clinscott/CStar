---
name: corvus-control
description: Orchestrates the Corvus Star (C*) framework by resolving commands between Node.js and Python dispatchers, executing workflows, and persisting neural learning. Use when the user requests cstar commands, workflows (lets-go, run-task), or ravens status.
---

# Corvus Control

This skill unifies the Gungnir Control Plane, allowing the agent to execute core framework commands and specialized workflows while maintaining the "Saga of the Code."

## ◈ Core Commands
The skill resolves commands to the appropriate engine:
- **Node.js Engine**: `start`, `dominion`, `odin`, `ravens`.
- **Python Engine**: All dynamic workflows (`lets-go`, `run-task`, `investigate`, `fish`, `wrap-it-up`).

## ◈ Workflow Execution
When a user requests a workflow (e.g., "Lets go"), the agent should:
1.  **Resolve**: Use `scripts/resolve_cstar.py` to trigger the workflow.
2.  **Context**: Read the corresponding `.qmd` or `.md` in `.agent/workflows/` to understand the tactical intent.
3.  **Persistence**: Update `tasks.qmd` or `memory.qmd` as required by the workflow's "Handshake."

## ◈ Neural Learning & Monitoring
- **Ravens**: Use `cstar ravens --status` to check system health.
- **Learning**: If a task fails, invoke the `investigate` workflow to analyze the trace and update the `AnomalyLedger`.
- **Gungnir Matrix**: Ensure all major changes are verified via `cstar start` or the `test` workflow.

## ◈ The Dispatcher Helper
Invoke the resolver script for deterministic execution:
`python .agent/skills/forge/corvus-control/scripts/resolve_cstar.py <command>`
