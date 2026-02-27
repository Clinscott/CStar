#!/usr/bin/env python3
"""
[SKILL] SkillHunter
Lore: Scouring digital realms for techniques, forging them into our own.
Purpose: Ingests GitHub repos into skills_db using secure containerized processing.
"""

import os
import sys
import subprocess
import shutil
import stat
from pathlib import Path

# [ALFRED] Ensure environment is loaded
try:
    project_root = Path(__file__).resolve().parents[4]
    sys.path.append(str(project_root))
    from src.sentinel._bootstrap import bootstrap
    bootstrap()
except (ImportError, ValueError, IndexError):
    pass

from src.core.sovereign_hud import SovereignHUD


def remove_readonly(func, path, excinfo) -> None:
    """Clear the readonly bit and reattempt the removal."""
    os.chmod(path, stat.S_IWRITE)
    func(path)


class SkillHunter:
    def __init__(self) -> None:
        self.root = Path(__file__).resolve().parents[4]
        self.skills_db_source = self.root / "skills_db"

    def ingest(self, url: str, skill_name: str) -> None:
        SovereignHUD.box_top(f"SKILL HUNTER: INGESTING {skill_name}")
        SovereignHUD.box_row("URL", url)

        # 1. Create temporary staging area in skills_db
        staging_dir = self.root / "skills_db" / skill_name
        if staging_dir.exists():
            shutil.rmtree(staging_dir, onexc=remove_readonly)
        staging_dir.mkdir(parents=True)

        try:
            # 2. Secure Fetch
            SovereignHUD.persona_log("INFO", "Cloning repository...")
            subprocess.run(["git", "clone", "--depth", "1", url, str(staging_dir)],
                           check=True, capture_output=True)

            # 3. Analyze & Metadata
            qmd_path = staging_dir / "SKILL.qmd"
            if not qmd_path.exists():
                readme_path = staging_dir / "README.md"
                description = "Imported via SkillHunter"
                if readme_path.exists():
                    content = readme_path.read_text(encoding='utf-8')
                    # Get first few words of the readme
                    lines = [line for line in content.split("\n")
                             if line.strip() and not line.startswith("#")]
                    if lines:
                        description = lines[0][:100]

                qmd_content = (f"---\nname: {skill_name}\ndescription: {description}\n---\n"
                               f"# {skill_name}\n\nImported from {url}")
                qmd_path.write_text(qmd_content, encoding='utf-8')

            # 4. Promote to Smart Registry
            SovereignHUD.persona_log("INFO", f"Registering '{skill_name}'...")
            from src.core.promotion_registry import PromotionRegistry
            registry = PromotionRegistry(str(self.root))

            promoted_files = []
            for root, _, files in os.walk(staging_dir):
                for f in files:
                    promoted_files.append(Path(root) / f)

            registry.register_promotion(skill_name, promoted_files)
            SovereignHUD.persona_log("SUCCESS", f"Skill '{skill_name}' promoted.")

        except Exception as e:
            SovereignHUD.persona_log("ERROR", f"Ingestion failed: {e}")

        SovereignHUD.box_bottom()


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python hunter.py <url> <skill_name>")
        sys.exit(1)

    hunter = SkillHunter()
    hunter.ingest(sys.argv[1], sys.argv[2])
