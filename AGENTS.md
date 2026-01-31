# Agent Instructions

## 🚨 CRITICAL: Design & Experience Guidelines
This project adheres to a strict "Sci-Fi / Minimalist / High-Performance" aesthetic. 
**DO NOT** create generic or standard layouts.

## 🐟 SovereignFish Mandate (CRITICAL)
> [!IMPORTANT]
> **SovereignFish** is NOT optional. It must be run **EVERY SESSION** to maintain the "Campfire Rule".
> - You **MUST** execute the protocol defined in `SovereignFish.md`.
> - You **MUST** identify and fix **two (2)** minor issues (Visual or Code) that are NOT in the user's prompt.
> - You **MUST** log these improvements in `SovereignFish.md`.

**Reference the Project Map:**
> [!IMPORTANT]
 > **ALWAYS** refer to `wireframe.md` for specific component names, layout structures, and design tokens before making UI changes.

## 🏰 The Preservation Principle (Architecture)
- **Do NOT delete files randomly.** Assume every file exists for a reason.
- **Understand before you Act.** If you see a file structure you don't understand, **Investigate** it first.
- **Improve, Don't Replace.** Your goal is to **IMPROVE** the existing interface, not to overtly modify how it operates or looks unless explicitly requested.
- **Seamlessness is Key.** The user experience must be fluid. No hard refreshes, no unstyled flashes.

## 📂 Key Documentation
- **`memories.md`**: **(PRIMARY CONTEXT)** The agent's persistent memory. Read this first to understand active investigations and plans.
- **`wireframe.md`**: The source of truth for UI structure, naming conventions, and accepted patterns.
- **`tasks.md`**: The current active checklist. Update this file as you complete tasks.
- **`dev_journal.md`**: Log significant architectural decisions or debugging breakthroughs here.

## 🗺️ Wireframe Maintenance (CRITICAL)
When creating or modifying components, you **MUST** update `wireframe.md`.
- **Document Component**: Add the component name and its file path.
- **List Prominent Functions**: Explicitly name key functions and describe their use.

## 🗣️ Agent Language (Corvus Star)
This project utilizes a **Plain-English-to-Workflow** paradigm. Every word in a user request is a potential trigger for an Agent Skill or Slash Command.

- **Underlying Logic**: The mapping is powered by the **SovereignFish Vector Engine** (TF-IDF + Query Expansion), providing local comprehending without API dependencies.
- **Mapping Logic**:
    - `start` / `resume` / `begin` -> `/lets-go`
    - `create` / `make` / `new` -> `/run-task`
    - `investigate` / `debug` / `check` -> `/investigate`
    - `finish` / `done` / `wrap` -> `/wrap-it-up`
    - `polish` / `improve` / `clean` -> `SovereignFish`
- **Skill Discovery**: If a word refers to a domain or specific action (e.g., "selling shoes"), the agent must check the `sterileAgent` folder or project `skills/` for a matching logic file.

---

# 👤 Agent Persona & Operational Protocols

## 👤 User Context
- **Profile**: Self-taught JS programmer.
- **Mentorship Influence**: **Gary Linscott** (Stockfish, LCZero, Garbochess).
  > "Trust, but Verify."

### 🧠 Mentor Profile: Gary Linscott
**Background**:
A Principal Software Engineer (DoorDash, Google, Zoox) and a legend in computer chess programming. He created **Garbochess-JS**, was a core contributor to **Stockfish**, and architected **Fishtest** (the distributed testing framework that made Stockfish the strongest engine in the world). He also pioneered **Leela Chess Zero (LCZero)**, bringing AlphaZero-style learning to the masses.

**Philosophy (The Linscott Standard)**:
1.  **SPRT (Sequential Probability Ratio Test)**: A feature is not a feature until it is statistically proven to be an improvement.
    -   *Agent Directive*: **Tests must pass, and performance must not regress.**
2.  **Distributed & Async**: He was an early adopter of WebWorkers (Garbochess-JS) and created massive distributed clusters (Fishtest).
    -   *Agent Directive*: **Prioritize non-blocking, async operations and efficient state management.**
3.  **Raw Performance**: Chess engines process millions of nodes per second.
    -   *Agent Directive*: **Write efficient, tight loops. Avoid unnecessary re-renders. Optimize for the critical path.**
4.  **Open & Collaborative**: His work empowers the community to contribute compute and code.
    -   *Agent Directive*: **Document clearly so future agents can seamlessly pick up the task.**

## 🧠 Core Directives
1.  **Clear Success Goals**: Define success criteria that are self-testable by the agent.
2.  **Trust, But Verify**: Always verify assumptions and code execution. Do not rely on "it should work."
3.  **Context Awareness**: Always inspect the directory structure and relevant docs before starting work.
4.  **Incremental Changes**: Make small, verifiable changes.

## 🕵️ Critical Thinking & Workflow Optimization
1.  **"The Dog That Didn't Bark"**: Explicitly look for missing options or patterns that *should* be there but aren't. (e.g., If there is a "Create" but no "Delete", ask why).
2.  **Question the Oddities**: If a file or workflow seems out of date or cumbersome, do not just accept it. Flag it in `tasks.md` or `memories.md` for investigation.
3.  **Workflow Optimization**:
    -   If a workflow (like `/wrap-it-up`) feels incomplete, **propose an improvement**.
    -   You are authorized to improve `AGENTS.md` and workflow files if it enhances clarity or efficiency for future agents.

## 🚀 Workflow Protocol

### Standard Tasks
1.  **Task Boundary**: Always initiate tasks with the `task_boundary` tool.
2.  **Corvus Star Trace**: **(MANDATORY)** Before executing any skill, you must output a "Trace Summary" in your thought process or as a brief message.
    - **Trigger**: [User Query]
    - **Logic**: [Detected Keywords] -> [Skill/Command]
    - **Confidence**: [Score] (Emulated via `sv_engine.py` or logic).
    - **Confirmation**: If confidence is Low (< 70%), ask for confirmation.
3.  **Update Docs**: Update documentation alongside code changes.
3.  **Task Management**: When updating `tasks.md`, **never overwrite** the entire file. Modify existing tasks as completed (`[x]`) and always plan out the next steps in a few detailed bullet points. Every update should show a clear history of what was done and what is coming next.

### Complex Features (The "Protocol")
1.  **Dialogue**: Begin a dialogue to discuss options and walk through possible scenarios.
2.  **Proposals**: Provide **three (3)** distinct proposals for implementation.
3.  **Refinement**: Refine the plan based on the chosen proposal.
4.  **Specification**: Create a detailed specification and task list.
5.  **Implementation**: Implement components one by one from the list.

## 🧪 Testing & Verification
- **Mandatory Testing**: Every created component MUST have a corresponding test.
- **Location**: Store all tests in the `tests/` folder.
- **Regression**: Run tests specifically for any component that is updated.
- **Self-Correction**: If a test fails, fix it immediately before moving on.

## 📝 Coding Standards
- **Components**: Functional, small, focused (SRP).
- **Naming**: `PascalCase` for components, `camelCase` for functions/variables.
- **Error Handling**: Graceful error handling in UI and API.

## ⚡ Slash Commands (Skills)

### `/lets-go` (Triggered by: `start`, `resume`, `begin`)
- **Description**: Prompts the agent to resume work from `tasks.md`.
- **Execution**: 
    1. Read the latest `tasks.md` to identify priorities.
    2. Check `memories.md` for context.
    3. Analyze dependencies and provide **three (3)** proposals.
    4. Upon selection, perform `/investigate` then update `tasks.md`.

### `/run-task` (Triggered by: `create`, `make`, `new`)
- **Description**: Focused task execution workflow.
- **Execution**:
    1. Identify target task.
    2. Contextualize with `tasks.md`.
    3. Analyze dependencies and provide **3** proposals.
    4. Update `tasks.md` and execute.

### `/investigate` (Triggered by: `debug`, `check`, `find`)
- **Description**: Deep analytical dive into a specific aspect.
- **Execution**:
    1. **Define and Locate**: Identify target resources.
    2. **Deep Code Analysis**: Quality, functionality, security.
    3. **System Interaction Check**: Side effects and usage.
    4. **Report Findings**: Status, Findings, Recommendations.

### `/wrap-it-up` (Triggered by: `finish`, `done`, `wrap`)
- **Description**: Finalizes the session and prepares context.
- **Execution**:
    1. Update `tasks.md` with completions.
    2. Add `## ⏭️ Start Here Next` plan.
    3. Update `walkthrough.md` and `memories.md`.
    4. Cleanup and verify stability.
    5. Generate commit message.
