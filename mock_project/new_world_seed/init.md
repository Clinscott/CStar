# Protocol Initialization (God Command)

To initialize a new project with the **Sovereign Agent Protocols**, copy and run the following command in your new project's root directory:

## 🚀 The God Command (PowerShell)

```powershell
New-Item -ItemType Directory -Path ".agent/workflows" -Force; Copy-Item -Path "c:\Users\Craig\Corvus\CorvusStar\sterileAgent\lets-go.md", "c:\Users\Craig\Corvus\CorvusStar\sterileAgent\run-task.md", "c:\Users\Craig\Corvus\CorvusStar\sterileAgent\investigate.md", "c:\Users\Craig\Corvus\CorvusStar\sterileAgent\wrap-it-up.md", "c:\Users\Craig\Corvus\CorvusStar\sterileAgent\SovereignFish.md" -Destination ".agent/workflows\" -Force; Copy-Item -Path "c:\Users\Craig\Corvus\CorvusStar\sterileAgent\AGENTS.md", "c:\Users\Craig\Corvus\CorvusStar\sterileAgent\wireframe.md", "c:\Users\Craig\Corvus\CorvusStar\sterileAgent\dev_journal.md", "c:\Users\Craig\Corvus\CorvusStar\sterileAgent\thesaurus.md", "c:\Users\Craig\Corvus\CorvusStar\sterileAgent\fishtest_data.json", "c:\Users\Craig\Corvus\CorvusStar\sterileAgent\tasks.md", "c:\Users\Craig\Corvus\CorvusStar\sterileAgent\memories.md" -Destination ".\" -Force
```

---

## 📂 What this does:
1.  **Creates `.agent/workflows/`**: The folder for Agent Skills.
2.  **Deploys Workflows**: Copies `lets-go`, `run-task`, `investigate`, `wrap-it-up`, and `SovereignFish` (AgLng enabled).
3.  **Deploys Context Docs**:
    -   `AGENTS.md`: The "Linscott Standard" instruction set.
    -   `wireframe.md`: The project map.
    -   `tasks.md`: The active checklist.
    -   `memories.md`: Persistent agent context.
    -   `thesaurus.md` / `fishtest_data.json`: SovereignFish Engine templates.
    -   `dev_journal.md`: Architectural record.
