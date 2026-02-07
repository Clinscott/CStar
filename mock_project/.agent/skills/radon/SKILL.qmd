---
name: Radon Complexity Analysis
description: Analyzes code complexity (Cyclomatic Complexity) using the radon library.
---

# Radon Complexity Analysis

**Activation Words**: radon, complexity, technical debt, cc, maintainability

## Protocol

1.  **Trigger**: 
    -   Explicit: "Check complexity of X", "Run radon on Y", "Show technical debt".
    -   Implicit: User asks about code quality or performance bottlenecks.

2.  **Action**:
    -   **Scan**: Use `radon cc <path>` to get Cyclomatic Complexity scores.
    -   **Summarize**: Provide a list of the most complex functions or classes.
    -   **Visualize**: Use `debt_viz.py` for a full HUD-styled report.

3.  **Metrics**:
    -   **A (1-5)**: Low complexity, easy to test.
    -   **B (6-10)**: Moderate complexity.
    -   **C (11-20)**: High complexity, should consider refactoring.
    -   **D (21-30)**: Very high complexity.
    -   **F (31+)**: Extreme complexity, "War Zone".

## Usage Examples

### Terminal Command
```powershell
radon cc . -a -s
```

### Script Execution
```powershell
python .agent/scripts/debt_viz.py
```
