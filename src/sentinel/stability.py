"""
[STABILITY & VALIDATION]
Lore: "The Guardian of the Timeline and The Infallible Strike."
Contains:
1. GungnirValidator - Statistical Verification (SPRT)
2. TheWatcher - Anti-Oscillation & Fatigue Management
"""

import hashlib
import json
import math
import time
from pathlib import Path
from typing import Any

from src.core.engine.hall_schema import HallOfRecords
from src.core.sovereign_hud import SovereignHUD


class GungnirValidator:
    """
    [THE GUNGNIR CALCULUS]
    Lore: "The Infallible Strike."
    Purpose: Statistically verify hypothesis (fix is stable) vs (fix is flaky).
    """
    def __init__(self, alpha: float = 0.05, beta: float = 0.1, p0: float = 0.01, p1: float = 0.2) -> None:
        """
        Initializes the SPRT validator with error boundaries and hypothesis probabilities.

        Args:
            alpha: Probability of Type I error (False Positive).
            beta: Probability of Type II error (False Negative).
            p0: Base failure rate (Null Hypothesis).
            p1: Flaky failure rate (Alternative Hypothesis).
        """
        self.alpha = alpha
        self.beta = beta
        self.p0 = p0
        self.p1 = p1

        # Thresholds
        self.A = (1 - beta) / alpha
        self.B = beta / (1 - alpha)

        self.log_likelihood_ratio = 0.0

    def record_trial(self, success: bool) -> None:
        """
        Calculates the Wald Likelihood Ratio for the current trial.

        ln(L1/L0) = k*ln(p1/p0) + (n-k)*ln((1-p1)/(1-p0))

        Args:
            success: Whether the trial passed.
        """
        if success:
            self.log_likelihood_ratio += math.log((1 - self.p1) / (1 - self.p0))
        else:
            self.log_likelihood_ratio += math.log(self.p1 / self.p0)

    @property
    def status(self) -> str:
        """
        Determines the current status of the SPRT test.

        Returns:
            "REJECT" if the alternative hypothesis (flaky) is accepted.
            "ACCEPT" if the null hypothesis (stable) is accepted.
            "CONTINUE" if more trials are needed.
        """
        if self.log_likelihood_ratio >= math.log(self.A):
            return "REJECT" # Null hypothesis rejected -> Flaky
        if self.log_likelihood_ratio <= math.log(self.B):
            return "ACCEPT" # Null hypothesis accepted -> Stable
        return "CONTINUE"


class TheWatcher:
    """
    [STABILITY MANAGER]
    Lore: "The Guardian of the Timeline."
    Purpose: Prevent oscillation (edit wars) and track file edit fatigue.
    """
    def __init__(self, root: Path) -> None:
        """
        Initializes the stability watcher with the project root.

        Args:
            root: Path to the project root directory.
        """
        self.root = root
        self.hall = HallOfRecords(root)
        self.state: dict[str, Any] = self._load_state()

    @staticmethod
    def _is_watcher_entry(value: Any) -> bool:
        return isinstance(value, dict) and (
            "status" in value or "edit_count_24h" in value or "content_hashes" in value or "last_edited" in value
        )

    def _load_state(self) -> dict[str, Any]:
        """Loads watcher state from Hall-backed repository metadata."""
        record = self.hall.get_repository_record()
        if record is not None:
            watcher_state = record.metadata.get("watcher_state")
            if isinstance(watcher_state, dict):
                return watcher_state

        state_file = self.root / ".agents" / "sovereign_state.json"
        if not state_file.exists():
            return {}
        try:
            raw_state = json.loads(state_file.read_text(encoding='utf-8'))
            if not isinstance(raw_state, dict):
                return {}
            return {
                key: value
                for key, value in raw_state.items()
                if self._is_watcher_entry(value)
            }
        except (OSError, json.JSONDecodeError):
            return {}

    def _save_state(self) -> None:
        """Saves watcher state into Hall metadata instead of the compatibility projection file."""
        try:
            record = self.hall.get_repository_record() or self.hall.bootstrap_repository()
            record.metadata = {
                **record.metadata,
                "watcher_state": self.state,
            }
            record.updated_at = int(time.time() * 1000)
            self.hall.upsert_repository(record)
        except Exception:
            pass

    def is_locked(self, rel_path: str) -> bool:
        """
        Checks if a file is locked due to instability or fatigue.

        Args:
            rel_path: Relative path to the file.

        Returns:
            True if the file is locked and within cooldown, False otherwise.
        """
        file_state = self.state.get(rel_path, {})
        if file_state.get("status") == "LOCKED":
            # Cooldown Logic: Auto-unlock after 1 hour
            now = time.time()
            if now - file_state.get("last_edited", 0) > 3600:
                file_state["status"] = "ACTIVE"
                file_state["edit_count_24h"] = 0
                self._save_state()
                return False
            return True
        return False

    def record_edit(self, rel_path: str, content: str) -> bool:
        """
        Records an edit and checks for oscillation or fatigue.

        Args:
            rel_path: Relative path to the file.
            content: The new content of the file.

        Returns:
            True if state is stable, False if oscillation/fatigue detected.
        """
        if rel_path not in self.state:
            self.state[rel_path] = {
                "last_edited": 0,
                "edit_count_24h": 0,
                "content_hashes": [],
                "status": "ACTIVE"
            }

        file_state = self.state[rel_path]
        now = time.time()

        # Fatigue Logic (Reset daily)
        if now - file_state.get("last_edited", 0) > 86400:
            file_state["edit_count_24h"] = 0

        file_state["edit_count_24h"] += 1
        file_state["last_edited"] = now

        # Echo Detection (Hash repetitive states)
        content_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
        is_echo = content_hash in file_state.get("content_hashes", [])

        file_state.setdefault("content_hashes", []).append(content_hash)
        if len(file_state["content_hashes"]) > 5:
            file_state["content_hashes"].pop(0)

        if is_echo:
            file_state["status"] = "LOCKED"
            self._save_state()
            SovereignHUD.persona_log("FAIL", f"OSCILLATION DETECTED: {rel_path} returning to previous state. LOCKING.")
            return False

        if file_state["edit_count_24h"] >= 10: # Increased limit for Phase 4
            file_state["status"] = "LOCKED"
            self._save_state()
            SovereignHUD.persona_log("FAIL", f"FILE FATIGUE: {rel_path} locked after 10 edits.")
            return False

        self._save_state()
        return True

    def get_last_edit_time(self) -> float:
        """
        Returns the timestamp of the most recently modified code file in the repository.
        Used by the Silence Protocol to ensure Muninn does not interrupt active development.
        """
        latest = 0.0
        for directory in [self.root / "src", self.root / "tests", self.root / ".agents"]:
            if not directory.exists(): continue
            for file_path in directory.rglob("*"):
                if file_path.is_file() and file_path.suffix in [".py", ".ts", ".js", ".tsx", ".json"]:
                    try:
                        latest = max(latest, file_path.stat().st_mtime)
                    except OSError:
                        pass
        return latest

    def record_failure(self, rel_path: str) -> int:
        """
        Records a validation failure for the file.
        Returns the cumulative number of failures.
        """
        if rel_path not in self.state:
            self.state[rel_path] = {
                "last_edited": 0,
                "edit_count_24h": 0,
                "content_hashes": [],
                "status": "ACTIVE",
                "fail_count": 0
            }
        
        file_state = self.state[rel_path]
        file_state["fail_count"] = file_state.get("fail_count", 0) + 1
        self._save_state()
        return file_state["fail_count"]
