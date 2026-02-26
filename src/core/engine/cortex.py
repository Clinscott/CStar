"""
[ENGINE] Cortex RAG
Lore: "The library of the All-Father's laws."
Purpose: Ingests project documentation to provide semantic knowledge to the agent.
"""

import re
from pathlib import Path
from typing import Any

from src.core.engine.vector import SovereignVector


class Cortex:
    """
    The Cortex: A Retrieval Augmented Generation (RAG) module for Corvus Star.
    It ingests the project's own documentation to answer questions about its laws.
    """
    def __init__(self, project_root: str | Path, base_path: str | Path) -> None:
        """
        Initializes the Cortex with project documentation sources.
        
        Args:
            project_root: Path to the project root directory.
            base_path: Internal base path for the Cortex.
        """
        self.project_root = Path(project_root)
        self.base_path = Path(base_path)
        # Initialize a fresh brain for knowledge
        self.brain = SovereignVector(stopwords_path=self.project_root / "src" / "data" / "stopwords.json")

        # Knowledge Sources
        doc_targets: dict[str, str] = {
            "AGENTS": "AGENTS.qmd",
            "wireframe": "docs/architecture/wireframe.qmd",
            "memories": "memories.qmd",
            "SovereignFish": "docs/campaigns/SOVEREIGNFISH_LEDGER.qmd"
        }

        self.knowledge_map: dict[str, Path] = {}
        for name, rel_path in doc_targets.items():
            path = self.project_root / rel_path
            if path.exists():
                self.knowledge_map[name] = path
            else:
                # Fallback to .md if .qmd not found
                md_path = path.with_suffix(".md")
                if md_path.exists():
                    self.knowledge_map[name] = md_path

        self._ingest()

    def _ingest(self) -> None:
        """Secure ingestion of project laws into the Cortex."""
        from src.core.sovereign_hud import SovereignHUD

        for name, path in self.knowledge_map.items():
            if not path.exists():
                continue
            try:
                # Size guard for the Cortex (1MB limit)
                if path.stat().st_size > 1 * 1024 * 1024:
                    SovereignHUD.persona_log("WARN", f"Cortex: Doc too large to digest: {name}")
                    continue

                content = path.read_text(encoding='utf-8')

                # Chunk by Headers (Markdown)
                sections = re.split(r'(^#+ .*$)', content, flags=re.MULTILINE)

                current_header = name

                if sections and not sections[0].startswith('#'):
                     self.brain.add_skill(f"{name} > Intro", sections[0].strip())

                for i in range(len(sections)):
                    section = sections[i].strip()
                    if not section:
                        continue

                    if section.startswith('#'):
                        current_header = f"{name} > {section.lstrip('#').strip()}"
                    else:
                        self.brain.add_skill(current_header, section)
            except (OSError, PermissionError) as e:
                SovereignHUD.persona_log("FAIL", f"Cortex Ingest Failed: {name} ({e!s})")
            except Exception:
                SovereignHUD.persona_log("WARN", f"Cortex Warning: Failed to digest {name}")

        self.brain.build_index()

    def query(self, text: str) -> list[dict[str, Any]]:
        """
        Queries the Cortex for relevant documentation snippets.
        
        Args:
            text: The query string.
            
        Returns:
            A list of matching knowledge results.
        """
        return self.brain.search(text)
