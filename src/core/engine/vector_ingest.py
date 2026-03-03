"""
[SPOKE] Vector Ingest
Lore: "The gathering of souls."
Purpose: Handle skill loading from files and directories into MemoryDB.
"""

from pathlib import Path
from src.core.sovereign_hud import SovereignHUD

class VectorIngest:
    def __init__(self, memory_db):
        self.memory_db = memory_db

    def add_skill(self, trigger: str, text: str, domain: str = "GENERAL") -> None:
        """Adds a single skill to the MemoryDB."""
        self.memory_db.upsert_skill("system", trigger, text, {"domain": domain})

    def load_skills_from_dir(self, directory: str | Path, prefix: str = "") -> None:
        """Walks a directory and loads all .qmd or .py skills."""
        path = Path(directory)
        if not path.exists():
            return

        for f in path.glob("**/*"):
            if f.is_file() and f.suffix in [".qmd", ".py"]:
                trigger = f"{prefix}{f.stem}"
                self.add_skill(trigger, f"Intent for {f.name}", domain="GENERAL")
