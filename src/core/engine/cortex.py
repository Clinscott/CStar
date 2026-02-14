import os
import re
from pathlib import Path
from typing import Any, Dict, List

from src.core.engine.vector import SovereignVector


class Cortex:
    """
    The Cortex: A Retrieval Augmented Generation (RAG) module for Corvus Star.
    It ingests the project's own documentation to answer questions about its laws.
    """
    def __init__(self, project_root: str | Path, base_path: str | Path) -> None:
        self.project_root = Path(project_root)
        self.base_path = Path(base_path)
        # Initialize a fresh brain for knowledge (separate from skills)
        self.brain = SovereignVector(stopwords_path=self.project_root / "src" / "data" / "stopwords.json")
        
        # Knowledge Sources - [ALFRED] Updated for Operation Yggdrasil docs structure
        doc_targets: Dict[str, str] = {
            "AGENTS": "docs/architecture/AGENTS.qmd",
            "wireframe": "docs/architecture/wireframe.qmd",
            "memories": "memories.qmd",
            "SovereignFish": "docs/campaigns/SOVEREIGNFISH_LEDGER.qmd"
        }

        self.knowledge_map: Dict[str, Path] = {}
        for name, rel_path in doc_targets.items():
            path = self.project_root / rel_path
            if path.exists():
                self.knowledge_map[name] = path
            else:
                # Fallback to .md if .qmd not found (staged migration)
                md_path = path.with_suffix(".md")
                if md_path.exists():
                    self.knowledge_map[name] = md_path
        
        self._ingest()
    
    def _ingest(self) -> None:
        """[ALFRED] Secure ingestion of project laws into the Cortex."""
        from src.core.ui import HUD  # Lazy import to avoid circularity
        
        for name, path in self.knowledge_map.items():
            if not path.exists(): 
                continue
            try:
                # [ALFRED] Size guard for the Cortex
                if path.stat().st_size > 1 * 1024 * 1024: # 1MB limit for docs
                    HUD.log("WARN", "Cortex Security", f"Doc too large: {name}")
                    continue

                content = path.read_text(encoding='utf-8')
                
                # Chunk by Headers (Markdown)
                # Split capturing the delimiter
                sections = re.split(r'(^#+ .*$)', content, flags=re.MULTILINE)
                
                current_header = name
                
                # If the file doesn't start with a header, the first chunk is "intro"
                if sections and not sections[0].startswith('#'):
                     self.brain.add_skill(f"{name} > Intro", sections[0].strip())

                for i in range(len(sections)):
                    section = sections[i].strip()
                    if not section: continue
                    
                    if section.startswith('#'):
                        current_header = f"{name} > {section.lstrip('#').strip()}"
                    else:
                        self.brain.add_skill(current_header, section)
            except (IOError, PermissionError) as e:
                HUD.log("FAIL", "Cortex Ingest", f"{name} ({str(e)})")
            except Exception as e:
                # [ALFRED] Log but do not crash; Cortex is auxiliary
                HUD.log("WARN", "Cortex Warning", f"Failed to digest {name}")
        
        self.brain.build_index()

    def query(self, text: str) -> List[Any]:
        return self.brain.search(text)