"""
Base Warden Architecture
Defines the standard interface and shared utilities for all Wardens.
"""

import json
import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, List, Dict, Optional

from src.core.ui import HUD
from src.tools.brave_search import BraveSearch

class BaseWarden(ABC):
    """
    Abstract Base Class for all Sentinel Wardens.
    Provides centralized config loading, path filtering, and research capabilities.
    """

    def __init__(self, root: Path):
        self.root = root
        self.config = self._load_config()
        self.brave = BraveSearch()

    def _load_config(self) -> Dict[str, Any]:
        """Loads configuration from .agent/config.json."""
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
        """
        # Common ignored directories
        ignored_dirs = {".git", ".venv", "node_modules", "__pycache__", ".agent", ".pytest_cache", "dist", "build"}
        
        # Check if any part of the path is in the ignored list
        for part in path.parts:
            if part in ignored_dirs:
                return True
                
        # Also ignore dotfiles generally (except .github, etc. if needed, but for now safe to ignore hidden)
        # Actually .agent is relevant for some wardens (Huginn), so specific wardens might override or check specifically.
        # But for general code scanning, we usually ignore .agent. 
        # Wait, Huginn needs .agent/traces. 
        # So we should make this overridable or context specific?
        # For now, let's keep it strict for code scanners and let Huginn handle its specific path targeting manually 
        # since it targets a specific directory, not a walk of the root.
        
        return False

    def research_topic(self, topic: str) -> List[Dict]:
        """
        Utilizes Brave Search to find info on a topic.
        """
        if self.brave.is_quota_available():
            HUD.persona_log("INFO", f"Researching: {topic}...")
            return self.brave.search(topic)
        else:
            HUD.persona_log("WARN", "Brave Search Quota Exhausted. Skipping research.")
            return []

    @abstractmethod
    def scan(self) -> List[Dict[str, Any]]:
        """
        Scans the codebase for breaches.
        Returns a list of dictionaries with keys:
            - type: str
            - file: str (relative path)
            - action: str
            - severity: str (LOW, MEDIUM, HIGH, CRITICAL)
            - line: int (optional)
        """
        pass
