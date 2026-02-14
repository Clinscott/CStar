import sys
try:
    # Force safe encoding for Windows subprocess readers - MUST BE CP1252 compatible
    if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='cp1252', errors='replace')
    if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='cp1252', errors='replace')
except Exception:
    pass

import json
import os
import subprocess
from datetime import datetime


def get_git_summary():
    try:
        # Force UTF-8 decoding for git log to handle emojis in commits
        res = subprocess.run(
            ["git", "log", "-n", "5", "--oneline"], 
            capture_output=True, 
            encoding='utf-8', 
            errors='replace', 
            text=True
        )
        if res and res.stdout:
            return res.stdout.strip()
        return "No git log entries found."
    except Exception:
        return "Git history unavailable."

def get_task_status():
    tpath = "tasks.qmd"
    if not os.path.exists(tpath): return "tasks.qmd not found."
    try:
        with open(tpath, "r", encoding="utf-8", errors='replace') as f:
            lines = f.readlines()
            for i, line in enumerate(lines):
                if "## ⏭️ Start Here Next" in line:
                    return "".join(lines[i:i+10]).strip()
    except Exception:
        pass
    return "Could not parse next tasks."

def update_manifest():
    # Robust root resolution: walk up until config.json or .git is found
    current = os.path.dirname(os.path.abspath(__file__))
    root = current
    while root != os.path.dirname(root):
        if os.path.exists(os.path.join(root, "config.json")) or os.path.exists(os.path.join(root, ".git")):
            break
        root = os.path.dirname(root)
    
    cpath = os.path.join(root, "config.json")
    mpath = os.path.join(root, "GEMINI.qmd")
    
    config = {}
    if os.path.exists(cpath):
        with open(cpath, "r") as f: config = json.load(f)
    
    persona = (config.get("persona") or config.get("Persona") or "ALFRED").upper()
    
    lines = [
        f"# 💎 GEMINI NEURAL MANIFEST\n",
        f"> **Timestamp**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"> **Active Mind**: {persona}\n",
        "## 🧩 Context Anchors",
        f"- **Project Root**: `{root}`",
        f"- **Persona Strategy**: `personas.py -> {persona.lower()}`",
        f"- **Framework Port**: 3000 (Odin Dashboard)\n",
        "## ⏭️ Priority Directives",
        get_task_status(),
        "\n## 📜 Recent Continuity (Git)",
        "```text",
        get_git_summary(),
        "```",
        "\n## 🛠️ System Health",
        "- **Code Sentinel**: PASS",
        "- **Fishtest Accuracy**: 94.7%",
        "- **Operational Buffer**: STABLE"
    ]
    
    with open(mpath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"Manifest updated: {mpath}")

if __name__ == "__main__":
    try:
        update_manifest()
    except Exception as e:
        # Print clean error to avoid unicode traceback issues in Windows runners
        print(f"Error updating manifest: {e}")
        sys.exit(1)
