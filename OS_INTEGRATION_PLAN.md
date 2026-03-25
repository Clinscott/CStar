# 🔱 CORVUS STAR (C*) OPERATING SYSTEM INTEGRATION PLAN (v1.0)
> **Objective:** Transition CStar from a "helper framework" to the **Sovereign Operating System** that the Host Agent (Gemini CLI) runs on.
> **Philosophy:** Gemini CLI is the User-Space Application (Brain). CStar is the Kernel-Space Execution Spine (Body).

## 🟢 PHASE 1: THE BOOTLOADER (INITIALIZATION & CONTEXT) [COMPLETE]
*Goal: Force the Host Agent to recognize the CStar Kernel on session start.*

- [x] **Task 1.1: Standardize the `GEMINI.md` Bootloader.** [COMPLETE]
  - Rewrite workspace-root `GEMINI.md` to define the "Ring 0 (C* Kernel) vs. Ring 3 (Host Agent)" relationship.
  - Mandate the use of C* Syscalls over native tools (`write_file`, `replace`).
- [x] **Task 1.2: Implement the "Session Handshake".** [COMPLETE]
  - Instructions for the Host to always run `cstar status` as its first tool call to sync with the current Gungnir Score and active Persona.
- [x] **Task 1.3: Define the Trace Selection Gate [Ω].** [COMPLETE]
  - Harden the requirement for the `// Corvus Star Trace [Ω]` block to ensure Intent Categorization before any mutation.

## 🟡 PHASE 2: THE SYSCALL MAPPING (UNIFIED API) [COMPLETE]
*Goal: Replace granular MCP/Native tools with CStar Command-Line Syscalls.*

- [x] **Task 2.1: Implement the "Chant" Planning Loop.** [COMPLETE]
  - Ensure `cstar chant` returns a machine-readable Bead Map that the Host can use to schedule work.
- [x] **Task 2.2: Standardize "Orchestrate" for Execution.** [COMPLETE]
  - Host Agent must use `cstar orchestrate` to trigger Python-based mutations, rather than writing code directly into files.
- [x] **Task 2.3: "Hall" Memory Retrieval Integration.** [COMPLETE]
  - Host Agent uses `cstar hall` to pull episodic Engrams for RAG-style context instead of relying on its limited context window.

## 🔴 PHASE 3: THE HARDWARE LOCK (ENFORCEMENT & WARDENS) [COMPLETE]
*Goal: Physically prevent the Host Agent from bypassing the CStar Kernel.*

- [x] **Task 3.1: Deploy the "Gatekeeper" Git Hooks.** [COMPLETE]
  - Activate `pre-commit` hooks that run the Gungnir Calculus and Linscott Breach scans.
  - Fail the commit (Kernel Panic) if the Host Agent attempts to bypass the OS standards.
- [x] **Task 3.2: Harden the Sentinel Wardens.** [COMPLETE]
  - Ensure Norn (Testing), Heimdall (Security), and Valkyrie (Cleanup) provide clear, actionable terminal errors to the Host.
- [x] **Task 3.3: Activate the "Muninn" Watcher.** [COMPLETE]
  - Ensure the background watcher identifies "Toxic Sectors" and seeds them as Beads for the Host to resolve.

## 🟣 PHASE 4: VALIDATION & EVOLUTION [COMPLETE]
*Goal: Verify the OS is self-sustaining and the Host is compliant.*

- [x] **Task 4.1: Perform a "Sterling" Dry Run.** [COMPLETE]
- [x] **Task 4.2: Audit Gungnir Trajectory.** [COMPLETE]
- [x] **Task 4.3: Final Documentation.** [COMPLETE]

## 🔘 PHASE 5: THE SOVEREIGN ENGINE (KERNEL-LEVEL ENFORCEMENT)
*Goal: Bury the advanced tiers (Spells, Memory, Ravens) deep into the CStar execution spine so the Host Agent benefits from them invisibly, eliminating user-space reliance.*

- [ ] **Task 5.1: Automatic Context Injection (Mimir Hook).**
  - Modify `weave:chant` to automatically query `mimir` for the target files and inject historical Engrams/intent into the resulting Bead metadata. 
  - *Result:* The Host never has to manually search the Hall; memory is provided as process environment data.
- [ ] **Task 5.2: Kernel-Level Traps (The Spells).**
  - Modify `OrchestratorReaper` to automatically catch validation failures. If a worker fails, the Kernel autonomously triggers `weave:phoenix_loop` instead of immediately returning a "BLOCKED" state to the Host.
  - *Result:* The OS self-heals; the Host only sees the final, stabilized outcome.
- [ ] **Task 5.3: Background Daemonization (The Ravens).**
  - Remove reliance on the Host running `cstar ravens`. Bind the Muninn sweep to a Git `post-commit` hook or a background Node.js worker loop.
  - *Result:* Tech debt beads simply "appear" in the queue when the Host checks `cstar status`.
- [ ] **Task 5.4: Deterministic Scheduler Routing (AutoBot).**
  - Update the `chant` planner to strictly enforce `assigned_agent` tags during mission shattering based on file types (e.g., `.feature` = ONE-MIND, `.ts`/`.py` = AUTOBOT).
  - *Result:* The Host cannot hoard execution tasks; the Kernel forces swarm delegation.

---
*Status: [EVOLVING]*
*Current Kernel: O.D.I.N. (Deep Spine Integration)*
