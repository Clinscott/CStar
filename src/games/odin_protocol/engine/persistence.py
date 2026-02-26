"""
[ENGINE] Persistence
Lore: "The annals of the Genetic Elite."
Purpose: Handles the Git-history save system for the Odin Protocol.
"""

import json
import logging
import subprocess
from pathlib import Path
from typing import Any


class OdinPersistence:
    """
    Handles the Git-History Save System for the Odin Protocol.

    This class ensures that every significant event in the game's timeline
    is recorded in a deterministic and immutable fashion using Git.
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
        Saves current state and commits it to the Git timeline.

        Args:
            state: The current UniverseState dictionary.
            world_name: Name of the world where the action occurred.
            outcome: Success/Failure description for the commit message.
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

            # 3. Git Commit
            commit_msg = f"Odin Protocol: {outcome} {world_name}. Mutations recorded."
            self._git_commit(commit_msg)

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
            with open(self.save_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            logging.error(f"Persistence Failure: Could not load state: {e}")
            return None

    def _git_commit(self, message: str) -> None:
        """
        Executes the Git commit for persistence.

        Args:
            message: The commit message describing the state change.
        """
        try:
            # Stage only the Odin Protocol files
            subprocess.run(["git", "add", str(self.save_path), str(self.worlds_dir)],
                           cwd=str(self.project_root), check=True, capture_output=True)

            # Commit
            subprocess.run(["git", "commit", "--allow-empty", "-m", message],
                           cwd=str(self.project_root), check=True, capture_output=True)

            logging.info(f"✅ Game State Committed: {message}")
        except subprocess.CalledProcessError as e:
            err_msg = e.stderr.decode().strip() if e.stderr else str(e)
            logging.warning(f"Git Persistence Warning: {err_msg}")
        except FileNotFoundError:
            logging.warning("Git Persistence Warning: 'git' command not found.")
