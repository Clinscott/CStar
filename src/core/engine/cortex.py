"""
[ENGINE] Cortex RAG
Lore: "The library of the All-Father's laws."
Purpose: Ingests project documentation to provide semantic knowledge to the agent.
"""

import asyncio
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
        self.source_mtimes: dict[str, int] = {}
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
            self.update_document(name)

        self.brain.build_index()

    def _read_sections(self, name: str, path: Path) -> list[tuple[str, str]]:
        # Size guard for the Cortex (1MB limit)
        if path.stat().st_size > 1 * 1024 * 1024:
            raise ValueError(f"Cortex: Doc too large to digest: {name}")

        content = path.read_text(encoding="utf-8")

        sections = re.split(r"(^#+ .*$)", content, flags=re.MULTILINE)
        current_header = name
        digested: list[tuple[str, str]] = []

        if sections and not sections[0].startswith("#"):
            intro = sections[0].strip()
            if intro:
                digested.append((f"{name} > Intro", intro))

        for section in sections:
            chunk = section.strip()
            if not chunk:
                continue

            if chunk.startswith("#"):
                current_header = f"{name} > {chunk.lstrip('#').strip()}"
            else:
                digested.append((current_header, chunk))

        return digested

    def update_document(self, name: str) -> bool:
        """Re-ingests a single Cortex source and records its latest mtime."""
        from src.core.sovereign_hud import SovereignHUD

        path = self.knowledge_map.get(name)
        if path is None or not path.exists():
            self.source_mtimes.pop(name, None)
            return False

        try:
            for trigger, text in self._read_sections(name, path):
                self.brain.add_skill(trigger, text)
            self.source_mtimes[name] = path.stat().st_mtime_ns
            return True
        except ValueError as e:
            SovereignHUD.persona_log("WARN", str(e))
            self.source_mtimes.pop(name, None)
            return False
        except (OSError, PermissionError) as e:
            SovereignHUD.persona_log("FAIL", f"Cortex Ingest Failed: {name} ({e!s})")
            self.source_mtimes.pop(name, None)
            return False
        except Exception:
            SovereignHUD.persona_log("WARN", f"Cortex Warning: Failed to digest {name}")
            self.source_mtimes.pop(name, None)
            return False

    def refresh(self) -> bool:
        """Refreshes changed documentation sources and rebuilds the index when needed."""
        changed = False
        for name, path in self.knowledge_map.items():
            if not path.exists():
                continue
            current_mtime = path.stat().st_mtime_ns
            if self.source_mtimes.get(name) != current_mtime:
                if self.update_document(name):
                    changed = True

        if changed:
            self.brain.build_index()
        return changed

    def query(self, text: str) -> list[dict[str, Any]]:
        """
        Queries the Cortex for relevant documentation snippets.

        Args:
            text: The query string.

        Returns:
            A list of matching knowledge results.
        """
        self.refresh()
        return self._run_search(text)

    def search(self, text: str) -> list[dict[str, Any]]:
        """Compatibility alias for callers that still use the older search surface."""
        return self.query(text)

    def _run_search(self, text: str) -> list[dict[str, Any]]:
        result = self.brain.search(text)
        if asyncio.iscoroutine(result):
            try:
                asyncio.get_running_loop()
            except RuntimeError:
                return asyncio.run(result)
            raise RuntimeError("Cortex.query() cannot await async search inside an active event loop.")
        return result
