---
name: Workflow Analyst
description: Scans project documentation to identify stalled tasks and suggest workflow improvements.
usage: /analyze-workflow
---
# Workflow Analyst

This skill analyzes `tasks.md` and `dev_journal.md` to find:
1. Tasks that have been pending for too long.
2. Recurring manual patterns that should be automated.
3. Discrepancies between planned work and executed work.

## Usage
`python .agent/skills/workflow-analyst/analyze_workflow.py`
