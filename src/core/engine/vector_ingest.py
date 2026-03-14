"""
[SPOKE] Vector Ingest
Lore: "The gathering of souls."
Purpose: Handle skill loading from files and directories into MemoryDB.
"""

import re
from pathlib import Path
from typing import Any

from src.core.sovereign_hud import SovereignHUD

class VectorIngest:
    def __init__(self, memory_db):
        self.memory_db = memory_db

    def add_skill(self, trigger: str, text: str, domain: str = "GENERAL") -> None:
        """Adds a single skill to the MemoryDB."""
        self.memory_db.upsert_skill("system", trigger, text, {"domain": domain})

    def batch_add_skills(self, skills: list[dict[str, Any]], domain: str = "GENERAL") -> None:
        """Adds multiple skills to the MemoryDB in a single strike."""
        for s in skills:
            if "metadata" not in s: s["metadata"] = {}
            if "domain" not in s["metadata"]: s["metadata"]["domain"] = domain
        self.memory_db.batch_upsert_skills("system", skills)

    def load_skills_from_dir(self, directory: str | Path, prefix: str = "") -> None:
        """Walks a directory and loads all .qmd, .md, or .py skills."""
        path = Path(directory)
        if not path.exists():
            return

        # [Ω] DOMAINE DISCOVERY: Assign domain based on path
        dir_name = path.name.lower()
        domain = "GENERAL"
        if "workflows" in dir_name or "core" in str(path).lower():
            domain = "CORE"
        elif "local" in str(path).lower():
            domain = "DEV"
        elif "vis" in str(path).lower() or "ui" in str(path).lower():
            domain = "UI"

        skills_to_load = []
        for f in path.glob("**/*"):
            if f.is_file() and f.suffix in [".qmd", ".md", ".py"]:
                # [Ω] SKILL DISCOVERY: Ignore internal files or visualization html
                if f.name.startswith("__") or f.name == "SKILL.qmd" or f.suffix == ".html":
                    continue
                    
                trigger = f"{prefix}{f.stem}"
                # Add / prefix for local workflows/skills if not present
                if prefix == "" and not trigger.startswith("/"):
                    trigger = f"/{trigger}"
                
                intent = self._read_intent(f)
                skills_to_load.append({
                    "trigger": trigger,
                    "description": intent,
                    "metadata": {"domain": domain}
                })
        
        if skills_to_load:
            self.batch_add_skills(skills_to_load, domain=domain)

    def _read_intent(self, file_path: Path) -> str:
        """Extracts a high-quality intent from the first few lines of a file."""
        try:
            content = file_path.read_text(encoding='utf-8')
            
            # [Ω] PRIMARY SIGNAL: Explicit Intent marker
            # Matches: # Intent: My intent text
            # Matches: # Intent: 
            #          My multi-line intent
            match = re.search(r'^# Intent:\s*(.*)', content, re.MULTILINE | re.IGNORECASE)
            if match:
                intent = match.group(1).strip()
                if not intent: # Look on next line
                    lines = content.split('\n')
                    for i, line in enumerate(lines):
                        if "# Intent:" in line and i + 1 < len(lines):
                            return lines[i+1].strip().lstrip('#').strip()
                return intent

            # [Ω] SECONDARY SIGNAL: YAML description
            match = re.search(r'^description:\s*(.*)', content, re.MULTILINE)
            if match:
                return match.group(1).strip()
            
            # [Ω] TERTIARY SIGNAL: JSDoc/Docstring Intent
            match = re.search(r'(?:#|""").*?Intent:\s*(.*?)(?:\n|""")', content, re.IGNORECASE | re.DOTALL)
            if match:
                return match.group(1).strip()
            
            # Fallback to first # Header in QMD or MD
            if file_path.suffix in [".qmd", ".md"]:
                match = re.search(r'^#\s*(.*)', content, re.MULTILINE)
                if match:
                    return match.group(1).strip()
            
            return f"Intent for {file_path.name}"
        except Exception:
            return f"Intent for {file_path.name}"
