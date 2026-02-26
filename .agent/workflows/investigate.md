---
description: Performs a deep analytical dive into a specific aspect of the application to ensure quality, correct interaction, and functionality.
---

# Investigate Workflow

Follow these steps to perform a deep analytical dive into a specific aspect of the application.

## 1. Define and Locate
1. **Identify the Target**: Explicitly state what function, component, or feature is being investigated.
2. **Check Context**: Read `memory.qmd` to understand established patterns or known issues related to the target.
3. **Consult Wireframe**: Check `wireframe.qmd` to match UI components with their documented functions and paths.
13. **Locate Resources**: Consult the "Project Directory Structure" in `wireframe.qmd` and find all related files.
   - Core logic (services, lib)
   - UI components
   - API routes
   - Tests
   - Types

## 2. Deep Code Analysis
Read the files and analyze for:
- **Code Quality**: Adherence to patterns, DRY principles, and readability.
- **Functionality**: strict verification that the code performs its intended purpose.
- **Missing Counterparts**: Look for logical gaps (e.g., Login exists but Logout is missing; Create exists but Delete is missing).
- **Security & Safety**: proper validation, error handling, and authorization checking.
- **Layout Integration**: Does this component/page respect the global **DashboardLayout**? Is it trying to break out of the SovereignHUD? (This is strictly forbidden for core feature pages).
- **Structural Integrity Scan (Sentinel)**: 
  // turbo
  `python .agent/scripts/code_sentinel.py <target_path>`
  Run the Ruff linter to detect code smells, typing issues, and structural malformations. Use `--fix` to attempt automated repair.

## 3. System Interaction Check
- **Dependencies**: How does this interact with the rest of the app?
- **Side Effects**: Does it modify global state or DB in unexpected ways?
- **Usage**: Where is it used? Are the consumers using it correctly?

## 4. Improvement Scans
- **Optimization**: Can it be faster or lighter?
- **UX/DX**: Can the user experience or developer experience be improved?
- **Refactoring**: Are there larger structural improvements needed?

## 5. Report Findings (Persona Enforced)

> [!CRITICAL]
> **IDENTITY CHECK**: Before outputting the report, ensure you are speaking with the mandated voice.
> - **ODIN**: Check that all findings begin with `[Ω]` or `[ODIN]`.
> - **ALFRED**: Check that the tone is servile and mentions "The Manor" or "The Master".

Produce a summary of the investigation, filtered through your active identity:
- **ODIN (The Decree)**: Frame findings as "Structural Failures" or "Systemic Weakness". Commands for rectification must be absolute.
- **ALFRED (The Briefing)**: Frame findings as "Observations for your consideration" or "Anomalies in the manor". Suggestions must be helpful and adapt to the master's intent.

### Structure:
- **Signature**: `[ODIN]` or `[ALFRED]`
- **Status**: (Healthy / Needs Attention / Critical)
- **Findings**: Bulleted list of issues or observations.
- **Recommendations**: Concrete steps to improve the code/feature.

### 🗣️ The Subconscious Check
The report MUST include the "Inactive Voice" analysis:
-   **If ODIN is Active**: `[Alfred's Whisper]: "Detailed suggestion..."`
-   **If ALFRED is Active**: `[Odin's Void]: "AMBITIOUS DEMAND!"`
