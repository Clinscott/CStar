---
name: Code Stats
description: Deep codebase analytics and debt estimation.
---

# Code Stats

## Activation Words: stats, count, metrics, lines, size, cloc, complexity, debt, analysis

## Instructions
1. **Tool Check**: Check if `cloc` or `scc` is enabled. If not, fallback to a Python-based walker.
2. **Scan**: Walk the directory tree (ignoring node_modules, .git, venv).
3. **Report**:
    - Total Lines of Code (LOC) per language.
    - File count.
    - Average file size.
4. **Insight**: Identify "God Files" (files > 500 lines) and flag them for refactoring.
5. **Output**: Display findings in a HUD table.
