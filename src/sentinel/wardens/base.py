"""
[WARDEN] Base Architecture
Lore: "The foundations of the watchtowers."
Purpose: Defines the standard interface and shared utilities for all Wardens.
"""

import json
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

from src.core.sovereign_hud import SovereignHUD
from src.tools.brave_search import BraveSearch


class BaseWarden(ABC):
    """
    Abstract Base Class for all Sentinel Wardens.
    Provides centralized config loading, path filtering, and research capabilities.
    """

    def __init__(self, root: Path) -> None:
        """
        Initializes the warden with the project root.

        Args:
            root: Path to the project root directory.
        """
        self.root = root
        self.config: dict[str, Any] = self._load_config()
        self.brave: BraveSearch = BraveSearch()

    def _load_config(self) -> dict[str, Any]:
        """
        Loads configuration from .agent/config.json.

        Returns:
            A dictionary containing the configuration data.
        """
        config_path = self.root / ".agent" / "config.json"
        if config_path.exists():
            try:
                return json.loads(config_path.read_text(encoding='utf-8'))
            except (json.JSONDecodeError, OSError):
                pass
        return {}

    def _should_ignore(self, path: Path) -> bool:
        """
        Centralized logic for ignoring directories.
        Default ignores: .git, .venv, node_modules, __pycache__, .agent, .pytest_cache, dist, build.

        Args:
            path: Path to the file or directory being checked.

        Returns:
            True if the path should be ignored, False otherwise.
        """
        ignored_dirs = {".git", ".venv", "node_modules", "__pycache__", ".agent", ".pytest_cache", "dist", "build"}

        return any(part in ignored_dirs for part in path.parts)

    def research_topic(self, topic: str) -> list[dict[str, str]]:
        """
        Utilizes Brave Search to find info on a topic.

        Args:
            topic: The search query or topic to research.

        Returns:
            A list of search results.
        """
        if self.brave.is_quota_available():
            SovereignHUD.persona_log("INFO", f"Researching: {topic}...")
            return self.brave.search(topic)
        else:
            SovereignHUD.persona_log("WARN", "Brave Search Quota Exhausted. Skipping research.")
            return []

    @abstractmethod
    def scan(self) -> list[dict[str, Any]]:
        """
        Scans the codebase for breaches.

        Returns:
            A list of breach dictionaries with keys: type, file, action, severity, line.
        """
        pass

    async def scan_async(self) -> list[dict[str, Any]]:
        """
        Asynchronous wrapper for scan().
        Executes the blocking scan in a separate thread to prevent loop blocking.

        Returns:
            A list of breach dictionaries.
        """
        import asyncio
        return await asyncio.to_thread(self.scan)

    async def propose_evolution(self, issue: str) -> dict[str, Any]:
        """
        Proposes a self-evolution update to the Warden itself.
        Returns a Critical Breach targeting this Warden's source file.

        Args:
            issue: Description of the edge case or issue requiring evolution.

        Returns:
            A breach dictionary representing the evolution proposal.
        """
        import inspect
        try:
            # Safely resolve own file path
            warden_file = Path(inspect.getfile(self.__class__)).relative_to(self.root)
        except (ValueError, TypeError):
            # Fallback if path resolution fails
            warden_file = Path("src/sentinel/wardens/base.py")

        return {
            "type": "WARDEN_EVOLUTION",
            "file": str(warden_file),
            "action": f"EVOLVE: {issue}",
            "severity": "CRITICAL",
            "context": "Self-Reflection caused by recurring unhandled edge case."
        }
