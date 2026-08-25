"""
[WARDEN] Base Architecture
Lore: "The foundations of the watchtowers."
Purpose: Defines the standard interface and shared utilities for all Wardens.
"""

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

class BaseWarden(ABC):
    """
    Abstract Base Class for all Sentinel Wardens.
    Provides path filtering and explicitly invoked research capabilities.
    """

    def __init__(self, root: Path) -> None:
        """
        Initializes the warden with the project root.

        Args:
            root: Path to the project root directory.
        """
        self.root = root

    def _should_ignore(self, path: Path) -> bool:
        """
        Centralized logic for ignoring directories.
        """
        # Hard-kill list for expensive recursive walks
        ignored_dirs = {
            ".git", ".venv", "node_modules", "__pycache__", 
            ".agents", ".pytest_cache", "dist", "build", 
            ".quarto", ".stats"
        }

        # Check if any part of the path is in the ignored list
        parts = set(path.parts)
        if parts.intersection(ignored_dirs):
            return True
            
        return False

    def research_topic(self, topic: str) -> list[dict[str, str]]:
        """
        Retired compatibility method for the old in-warden search path.

        Args:
            topic: The search query or topic to research.

        Returns:
            A list of search results.
        """
        del topic
        raise RuntimeError("warden_research_retired_use_cstar_researcher_request")

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
            warden_file = Path("src/core/engine/wardens/base.py")

        return {
            "type": "WARDEN_EVOLUTION",
            "file": str(warden_file),
            "action": f"EVOLVE: {issue}",
            "severity": "CRITICAL",
            "context": "Self-Reflection caused by recurring unhandled edge case."
        }
