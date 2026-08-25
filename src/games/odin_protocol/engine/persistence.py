"""
[ENGINE] Persistence
Lore: "The annals of the Genetic Elite."
Purpose: Handles local save files for the Odin Protocol.
"""

import json
import logging
from pathlib import Path
from typing import Any


class OdinPersistence:
    """
    Handles deterministic local save files for the Odin Protocol.

    Saving game state grants no Git authority. Repository history remains an
    explicit operator-controlled workflow outside this class.
    """

    def __init__(self, project_root: str | Path) -> None:
        """
        Initializes the persistence engine.

        Args:
            project_root: The root directory of the Corvus framework.
        """
        self.project_root = Path(project_root)
        self.save_path: Path = self.project_root / "odin_protocol" / "save_state.json"
        self.worlds_dir: Path = self.project_root / "odin_protocol" / "worlds"

        if not self.worlds_dir.exists():
            self.worlds_dir.mkdir(parents=True, exist_ok=True)

    def save_state(self, state: dict[str, Any], world_name: str, outcome: str) -> None:
        """
        Saves current state and a local world archive without invoking Git.

        Args:
            state: The current UniverseState dictionary.
            world_name: Name of the world where the action occurred.
            outcome: Success/Failure description for the local world record.
        """
        try:
            # 1. Write current state
            with open(self.save_path, "w", encoding="utf-8") as f:
                json.dump(state, f, indent=4)

            # 2. Archival record of the world
            world_filename = f"world_{world_name.replace(' ', '_').lower()}.json"
            world_path = self.worlds_dir / world_filename
            world_data = {
                "world_name": world_name,
                "outcome": outcome,
                "final_state": state
            }
            with open(world_path, "w", encoding="utf-8") as f:
                json.dump(world_data, f, indent=4)

        except OSError as e:
            logging.error(f"Persistence Failure: Could not save state to disk: {e}")

    def load_state(self) -> dict[str, Any] | None:
        """
        Loads the genetic manifest from disk.

        Returns:
            The loaded state dictionary, or None if no save exists.
        """
        if not self.save_path.exists():
            return None
        try:
            with open(self.save_path, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            logging.error(f"Persistence Failure: Could not load state: {e}")
            return None
