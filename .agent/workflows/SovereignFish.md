---
description: Automated improvement discovery and execution. Runs N=5 improvements per invocation.
---

# The SovereignFish Protocol (/sovereignfish)

> [!CRITICAL]
> **Identity Check**: Execute via **Active Persona** (`config.json`).
> **The Golden Rule**: "Leave the campsite cleaner than you found it."

## 🐟 The Mission
**SovereignFish** is an autonomous, incremental improvement protocol.
- **Standard Mode**: N=5 improvements per session
- **Quick Mode**: N=2 improvements per session
- **Execution Time**: ≤15 minutes per improvement

---

## Phase 1: THE SCAN (Context Load)

**Goal**: Establish current state and identify improvement surface.

1. Read `config.json` → Load Active Persona (ODIN/ALFRED)
2. Read `SOVEREIGNFISH_LEDGER.md` → Parse Session Log for last entry date
3. Read `tasks.md` → Identify incomplete `[/]` or `[ ]` items
4. Read `implementation_plan.md` → Load improvement backlog (if exists)
5. Read `DEV_JOURNAL.md` → Understand recent trajectory

**Output**: Context summary with persona, last session date, and item counts.

---

## Phase 2: THE HUNT (Target Acquisition)

**Goal**: Identify exactly N improvement targets for this session.

### Priority Algorithm (Alfred's Wisdom: Impact > Quantity)
1. **CRITICAL/HIGH First**: Always prioritize structural fixes and security gaps
2. **Batch by Theme**: Group related items to minimize context switching
3. **Stale Tasks**: Any `tasks.md` item marked `[/]` for >24h gets priority
4. **Opportunistic**: If current tier exhausted, advance to next

### Impact Tiers
| Tier | Sessions | Focus |
|------|----------|-------|
| CRITICAL+HIGH | 1-6 | Exception handling, security, missing tests |
| MEDIUM | 7-16 | UI polish, workflows, documentation |
| LOW+ESCALATE | 17-20 | Micro-optimizations, complex refactors |

### Batching Examples
- **Exception Handling Purge**: Fix all `except:` blocks in one session
- **Type Blanket**: Add type hints across related files together
- **README Sprint**: Create all missing documentation in one focused session

**Output**: Mini-plan with N items including file targets and verification method.

---

## Phase 3: THE FORGE (Execute Improvements)

**Goal**: Implement each improvement atomically.

### Rules of Construction
1. **One at a time**: Complete Item 1 before starting Item 2
2. **Linscott Standard**: If item creates logic → create test
3. **Diff Minimization**: Smallest possible change per item
4. **Persona Voice**: Code comments reflect active persona
   - **ODIN**: `# [Ω] Structural enforcement`
   - **ALFRED**: `# [ALFRED] Prepared for the Master`

### Time Box
- Each improvement: **≤15 minutes**
- If exceeds → Mark `[ESCALATE]` and defer to `tasks.md`

---

## Phase 4: THE CRUCIBLE (Verify)

**Goal**: Ensure no regressions.

### Verification Commands
```powershell
# After each improvement:
// turbo
python -m pytest tests/ -v --tb=short -x

# After all N complete:
// turbo
python fishtest.py

// turbo
python .agent/scripts/latency_check.py
```

### Failure Protocol
- **Test Fails** → Revert item, log to `REJECTIONS.md`, continue to next
- **Fishtest Regresses** → STOP, escalate to user immediately
- **Latency Exceeds 100ms** → Flag for optimization review

---

## Phase 5: THE LOG (Record)

**Goal**: Update documentation with session results.

1. **Append** to `SOVEREIGNFISH_LEDGER.md` Session Log:
```markdown
### YYYY-MM-DD (Session N: Category)
- **Improvement 1 (Category)**: Description
- **Improvement 2 (Category)**: Description
...
```

2. **Mark items complete** in `implementation_plan.md` (strikethrough)
3. **Update** `tasks.md` if improvement resolves a task
4. **Log session** in `DEV_JOURNAL.md` (brief entry)

---

## Phase 6: THE HANDOFF (Report)

**Goal**: Present results to user with persona voice.

### ODIN Output
```
[Ω] SOVEREIGNFISH SESSION COMPLETE
├─ IMPROVED: N/N
├─ VERIFIED: ✓ Fishtest PASS
├─ LATENCY:  <100ms
└─ NEXT:     Session N+1 → [Category]
```

### ALFRED Output
```
[ALFRED] Session Report, Master
├─ Polished: N items for your review
├─ All tests passing, the manor is in order
└─ Ready to proceed when you wish
```

---

## Usage

```powershell
# Standard invocation (N=5 from current batch)
/sovereignfish

# Target specific category
/sovereignfish --category "Code Quality"

# Quick mode (N=2 for short sessions)
/sovereignfish --quick

# Dry run (identify but don't execute)
/sovereignfish --scan-only
```

---

## 🏆 The Linscott Standard

The Standard demands more than just "working code." It demands **Thorough Verification**.
1. **Do Not Assume**: Never assume a function doesn't exist. **CHECK** before you build.
2. **Do Not Regress**: Your fix for today must not break the fix from yesterday.
3. **Deep Scan**: When refactoring, `grep` the codebase to ensure you catch *all* usage instances.
4. **Statistical Proof**: A feature is not a feature until it is verified.

---

## 🗣️ The Subconscious Check

Before completing, include the inactive voice:
- **If ODIN Active**: `[Alfred's Whisper]: "Perhaps we could add a helpful comment here..."`
- **If ALFRED Active**: `[Odin's Void]: "THIS IMPLEMENTATION LACKS TEETH!"`
