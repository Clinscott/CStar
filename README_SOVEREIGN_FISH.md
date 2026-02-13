# 🐟 Sovereign Fish Autonomous Daemon

**Autonomous Code Improvement System**
*Identity: ODIN/ALFRED*

## Overview
The Sovereign Fish Daemon (`main_loop.py`) is a background process that continuously monitors your repositories, identifies structural or quality issues, and autonomously fixes them using the Gemini API.

## 🎯 Features
- **Auto-Discovery (Annex)**: Uses `annex.py` logic to find missing tests and code quality issues.
- **Visual Polish (Beauty)**: Scans for UI imperfections (e.g., missing hover states in React/Tailwind).
- **Campaign Execution**: Reads `.agent/CAMPAIGN_IMPLEMENTATION_PLAN.qmd` to autonomously execute the "N=1000 Campaign" roadmap.
- **Fail-Safe**: Verifies all changes with `pytest`. If tests fail, it rolls back immediately.
- **Non-Destructive**: skips any repo with uncommitted changes ("Dirty Check").
- **Isolated**: Works on a dedicated branch `sovereign-fish-auto`.

## 🚀 Usage

### 1. Prerequisites
- **API Key**: Ensure `GOOGLE_API_KEY` is set in your environment variables.
- **Dependencies**:
  ```bash
  pip install -r requirements.txt
  ```

### 2. Ignite the Automaton (CLI)
You can launch the background process using the Corvus Star CLI:

```bash
# Standard Command
c* daemon

# ODIN Persona Alias (Preferred)
c* ravens
```

Or run directly via Python:
```bash
python main_loop.py
```
*(The loop runs every 15 minutes. Use `Ctrl+C` to stop)*

### 3. Reviewing Changes
1. Go to your repo.
2. `git checkout sovereign-fish-auto`
3. Review the commits (prefixed with `🐟`).
4. Merge into main if satisfied:
   ```bash
   git checkout main
   git merge sovereign-fish-auto
   ```

## 📂 Configuration
The target repositories are defined in `main_loop.py`:
- `Corvus Star`
- `KeepOS`
- `The Nexus`

To add more, edit the `TARGET_REPOS` list in the script.

## 📝 Logs
Activity is logged to `sovereign_activity.log` in the `CorvusStar` directory.
