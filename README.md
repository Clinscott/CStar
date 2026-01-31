# 🐟 AgLng Framework: Agent Language & Skill Ecosystem

AgLng is a high-performance, local intelligence framework designed to map natural language intent to specialized agent workflows. It enables seamless "Plain-English-to-Workflow" interaction for AI agents, specifically optimized for the Antigravity/Gemini API.

## 🚀 Quick Start (Installation)

To deploy the AgLng protocols into a new project, run the following command from this project's root:

```powershell
.\install.ps1 -TargetDir "C:\path\to\your\new\project"
```

*This will initialize the `.agent/` structure, deploy the `SovereignVector` engine, and install all core workflows and context templates.*

---

## 🏗️ Core Components

### 1. SovereignVector Engine (`.agent/scripts/sv_engine.py`)
A standalone Python engine that handles intent recognition locally. It uses **TF-IDF Vectorization** and **Cosine Similarity** to match your requests to the most relevant "Skill" or "Workflow."

- **No APIs Required**: Works entirely offline.
- **Context-Aware**: Ingests your `thesaurus.md` and active project context to improve accuracy.

### 2. The Trace & Learning Loop
The system is designed to be transparent. Every action starts with an **Interpretation Trace**:
1. **Trace Output**: The agent explains *what* it heard and *why* it chose a specific skill.
2. **User Correction**: If the mapping is wrong, simply say: *"No, I meant [Skill Name]"*.
3. **Learning**: The system automatically saves this correction to `.agent/corrections.json`, ensuring it never makes the same mistake again.

### 3. Skills Repository (`.agent/skills/`)
A collection of specialized agent abilities:
- **GitAuto**: Managed commits and branch safety.
- **EnvDoctor**: System health and dependency audits.
- **KnowledgeHunter**: Deep-dive research across local files and the web.

---

## 📂 Directory Structure

```text
root/
├── .agent/
│   ├── scripts/          # The SovereignVector engine
│   ├── skills/           # Specialized agent abilities
│   ├── workflows/        # Core execution protocols (lets-go, run-task, etc.)
│   └── corrections.json  # Your project-specific learning data
├── AGENTS.md             # The Linscott Standard & instructions
├── wireframe.md          # The Project Map
└── tasks.md              # The Active Checklist
```

---

## 🏆 The Linscott Standard
This framework is built on the **Linscott Standard** of software excellence:
- **Trust, but Verify**: Every interpretation is traced for your review.
- **Statistical Proof**: Features must be verified via the **Fishtest Protocol**.
- **No Regressions**: High-performance local checks ensure system stability.

---

> *"Complexity is the enemy of execution. Excellence is the habit of small corrections."*
