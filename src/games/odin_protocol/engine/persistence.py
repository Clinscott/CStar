import json
import logging
import os
import subprocess
from typing import Any


class OdinPersistence:
    """Handles the Git-History Save System for the Odin Protocol.

    This class ensures that every significant event in the game's timeline
    is recorded in a deterministic and immutable fashion using Git.
    """

    def __init__(self, project_root: str) -> None:
        """Initializes the persistence engine.

        Args:
            project_root: The root directory of the Corvus framework.
        """
        self.project_root = project_root
        self.save_path = os.path.join(project_root, "odin_protocol", "save_state.json")
        self.worlds_dir = os.path.join(project_root, "odin_protocol", "worlds")

        if not os.path.exists(self.worlds_dir):
            os.makedirs(self.worlds_dir)

    def save_state(self, state: dict[str, Any], world_name: str, outcome: str) -> None:
        """Saves current state and commits it to the Git timeline.

        Args:
            state: The current UniverseState dictionary.
            world_name: Name of the world where the action occurred.
            outcome: Success/Failure description for the commit message.
        """
        try:
            # 1. Write current state
            with open(self.save_path, "w") as f:
                json.dump(state, f, indent=4)

            # 2. Archival record of the world
            world_filename = f"world_{world_name.replace(' ', '_').lower()}.json"
            world_path = os.path.join(self.worlds_dir, world_filename)
            with open(world_path, "w") as f:
                json.dump({
                    "world_name": world_name,
                    "outcome": outcome,
                    "final_state": state
                }, f, indent=4)

            # 3. Git Commit (The Chronological Genetic History)
            commit_msg = f"Odin Protocol: {outcome} {world_name}. Mutations recorded."
            self._git_commit(commit_msg)

        except OSError as e:
            logging.error(f"Persistence Failure: Could not save state to disk: {e}")

    def load_state(self) -> dict[str, Any] | None:
        """Loads the genetic manifest from disk.

        Returns:
            The loaded state dictionary, or None if no save exists.
        """
        if not os.path.exists(self.save_path):
            return None
        try:
            with open(self.save_path) as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            logging.error(f"Persistence Failure: Could not load state: {e}")
            return None

    def _git_commit(self, message: str) -> None:
        """Executes the Git commit for persistence using secure subprocess calls.

        Args:
            message: The commit message describing the state change.
        """
        try:
            # Stage only the Odin Protocol files to avoid accidental commits of project code
            subprocess.run(["git", "add", self.save_path, self.worlds_dir],
                           cwd=self.project_root, check=True, capture_output=True)

            # Commit (Allow empty in case of re-save with no changes)
            subprocess.run(["git", "commit", "--allow-empty", "-m", message],
                           cwd=self.project_root, check=True, capture_output=True)

            logging.info(f"✅ Game State Committed: {message}")
        except subprocess.CalledProcessError as e:
            # Silently handle cases where git fails, logging as a warning
            err_msg = e.stderr.decode().strip() if e.stderr else str(e)
            logging.warning(f"Git Persistence Warning: {err_msg}")
        except FileNotFoundError:
            logging.warning("Git Persistence Warning: 'git' command not found.")