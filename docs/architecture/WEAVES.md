# 🔱 THE WEAVE FRAMEWORK: COMPOSITE AGENTIC LOGIC

> **ROLE:** The Loom of the One Mind  
> **PURPOSE:** Define the architectural standards for "Weaves"—high-level sequences that orchestrate multiple discrete skills into a single sovereign operation.

---

## 1. WHAT IS A WEAVE?
A **Weave** is a composite execution path within the Corvus Star Runtime. Unlike a **Skill** (which is a single functional intent), a Weave represents a **Mission Thread**—it chains skills together to achieve a complex architectural goal.

### 🔱 The Core Triad of a Weave:
1.  **Orchestration**: It does not implement business logic itself; it dispatches to other Skills/Weaves.
2.  **State Management**: It maintains the context across the chain (e.g., passing a Bead ID from `hall` to `evolve`).
3.  **Unified Outcome**: It returns a single `WeaveResult` that summarizes the success or failure of the entire thread.

---

## 2. WEAVE ARCHITECTURE
All Weaves must be implemented within `src/node/core/runtime/weaves/` and registered in the `RuntimeDispatcher`.

### 🧩 Component Standards
*   **The Adapter**: Every weave must implement the `RuntimeAdapter<T>` interface.
*   **The Payload**: Payloads must be defined in `src/node/core/runtime/contracts.ts`.
*   **Skill Chaining**: Weaves MUST use the `dispatchPort.dispatch()` method to invoke other skills. Direct file manipulation or script execution inside a weave is **strictly forbidden**.

---

## 3. DEVELOPMENT PROTOCOL
When developing a new Weave, the following steps are mandatory:

### Step 1: Definition
Define the **Logic Protocol** in a corresponding `WEAVE.md` or as part of the `AGENTS.qmd` lore.
*   **Example**: `hall` -> `evolve` -> `trace` -> `compress`.

### Step 2: Contract Update
Add the `WeavePayload` and `WeaveMetadata` interfaces to `contracts.ts`. Ensure all fields are explicitly typed.

### Step 3: Implementation
Create the class in `src/node/core/runtime/weaves/`. Use `chalk` for high-fidelity console feedback and maintain clear, Butler-style (`ALFRED`) or Command-style (`ODIN`) logs.

### Step 4: Kernel Integration
Register the weave in `src/node/core/runtime/bootstrap.ts`. If the weave has dependencies (like a `dispatchPort`), they must be injected during bootstrap.

---

## 4. VERIFICATION MANDATE
A Weave is not complete until it satisfies the **Triad of Verification**:
1.  **Lore**: A Gherkin feature file exists in `tests/features/weaves/`.
2.  **Isolation**: A 1:1 unit test exists in `tests/unit/weaves/` using a `MockDispatchPort`.
3.  **Audit**: A live "Dry Run" is executed and verified through `cstar status`.

---

> "A single thread is easily broken. A weave binds the estate into a fortress."
