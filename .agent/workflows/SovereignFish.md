# SovereignFish: The Protocol of Incremental Excellence

> "Complexity is the enemy of execution. Excellence is the habit of small corrections."

## 🐟 The Mission
**SovereignFish** is an autonomous, incremental improvement protocol designed to run **EVERY SESSION**.
Its goal is not to rewrite the application, but to polish it relentlessly.

**The Golden Rule:**
> **"Leave the campsite cleaner than you found it."**
> In every session, you must identify and execute **TWO (2)** small improvements that are NOT strictly part of the user's main request, but contribute to the overall health, beauty, or efficiency of the system.

---

## 🏆 The Linscott Standard
**SovereignFish is the vector for The Linscott Standard.**

> **"Swim fishy swim"**

The Standard demands more than just "working code." It demands **Thorough Verification**.
1.  **Do Not Assume**: Never assume a function doesn't exist. **CHECK** before you build.
2.  **Do Not Regress**: Your fix for today must not break the fix from yesterday (e.g., legacy browser compatibility).
3.  **Deep Scan**: When refactoring, `grep` the codebase to ensure you catch *all* usage instances, not just the one in front of you.
4.  **Statistical Proof**: A feature is not a feature until it is verified.

---

## 🔄 The Workflow (Run Every Session)

1.  **SCAN**: Briefly review `tasks.md`, `dev_journal.md`, `thesaurus.md`, and `wireframe.md`.
2.  **HUNT**: Identify 2 targets for improvement.
    *   *Visuals*: Inconsistent buttons, alignment issues, harsh colors, missing hover states.
    *   *Code*: Duplicate logic, magic numbers, missing types, unwieldy functions.
    *   *Docs*: Outdated wireframe, missing comments, unclear tasks.
3.  **EXECUTE**: Implement the changes.
    *   Keep it small. If it takes more than 15 minutes, it's too big for SovereignFish (move it to `tasks.md`).
4.  **VERIFY**: Run Fishtest logic and manual verification to ensure no regressions.
5.  **LOG**: Record your contribution in the **Session Log** below.

---

## 🧠 Core Engine: The Thinking Logic
The system uses a combination of **TF-IDF Vectorization** and **Query Expansion** to understand intent.

### 1. The Sovereign Embedder (TF-IDF)
The "brain" converts text into mathematical vectors based on the specific vocabulary of the project's corpus.

### 2. Query Expansion (Recall Enhancement)
To handle variations in language, the query is expanded before vectorization using a domain-specific **Thesaurus** (`thesaurus.md`).

---

## 🐟 The Fishtest Protocol
Fishtest is a data-driven verification suite used to ensure the engine isn't regressing as the corpus or logic grows.

### Sequential Probability Ratio Test (SPRT)
In high-performance engines like Stockfish, SPRT is used to prove a change is statistically better. We emulate this as a **Regression Guard** in `fishtest_data.json`.

---

## 🎨 UI Consistency Checklist (The Visual Standard)
*Reference this list when hunting for visual improvements.*

### Buttons & Interactive Elements
-   [ ] **Hover States**: Do all buttons glow/shift slightly on hover? (e.g., `hover:bg-opacity-80`, `hover:shadow-glow`).
-   [ ] **Active/Pressed States**: Do they provide feedback on click? (e.g., `active:scale-95`).
-   [ ] **Disabled States**: Are disabled buttons clearly visually distinct (opacity 0.5, `cursor-not-allowed`)?
-   [ ] **Uniformity**: Are primary actions consistently styled? (Don't mix button shapes randomly).

### Typography & Spacing
-   [ ] **Hierarchy**: Is usage of H1/H2/H3 consistent?
-   [ ] **Breathing Room**: Is there enough `p-4` or `gap-4`? Avoid cramped layouts.
-   [ ] **Contrast**: Is text readable against the background? (Use primary vs secondary text tokens).

### The Polish
-   [ ] **Visual Continuity**: Are panels and containers using consistent styling (e.g., blurs, background opacity)?
-   [ ] **Borders**: Do containers have subtle borders to define edges?
-   [ ] **Glows/Shadows**: Are important elements highlighted with subtle colored shadows or glows?

---

## 🧱 Code Quality Checklist (The Structural Standard)
-   [ ] **DRY (Don't Repeat Yourself)**: Can these 3 similar functions be 1 generic function?
-   [ ] **Type Safety**: Are there any `any` types that can be defined?
-   [ ] **Naming**: Do function names explain *what* they do? (e.g., `updateData` -> `syncUserData`).
-   [ ] **Dead Code**: Are there unused imports or commented-out blocks? Delete them.

---

---

## 📜 Session Log (Persona Enforced)
*Record your SovereignFish contributions here. Output MUST adopt the active Persona:*
- **ODIN**: Successes are "Dominion Expanded". Format: `[Date] - [Category]: [Action] - Status: SECURED.`
- **ALFRED**: Successes are "Polishing the Manor". Format: `[Date] - [Category]: [Action] - Status: IMPROVED.`

*Format: `[Date] - [Category]: [Description]`*

### 2026-02-01
-   **Thesaurus**: Alphabetized and Standardized concept mappings - Status: SECURED.
-   **Thesaurus**: Added speed synonyms (velocity, tempo) to core workflows - Status: IMPROVED.
-   **Docs**: Added clear docstrings to `trace_viz.py` modes for better developer experience (DX).
-   **Code**: Improved `sv_engine.py` HUD class to support dynamic color overrides (required for persona symmetry).
-   **Architecture**: Implemented "War Room" conflict analysis in `trace_viz.py`.

### 2026-01-30
-   **Protocol**: Created `SovereignFish.md` and `thesaurus.md`.
-   **Refactor**: Centralized fetch utilities and standardized error propagation.
-   **UI**: Implemented tactile feedback and hover states on core navigation elements and action buttons.
-   **Optimization**: Replaced monolithic component calls with granular hooks to reduce re-renders.
