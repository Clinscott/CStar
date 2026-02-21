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

from src.core.ui import HUD


class GungnirValidator:
    """
    [THE GUNGNIR CALCULUS]
    Lore: "The Infallible Strike."
    Purpose: Statistically verify hypothesis (fix is stable) vs (fix is flaky).
    """
    def __init__(self, alpha=0.05, beta=0.1, p0=0.01, p1=0.2) -> None:
        self.alpha = alpha # Type I error (False Positive)
        self.beta = beta   # Type II error (False Negative)
        self.p0 = p0       # Base failure rate (Null)
        self.p1 = p1       # Flaky failure rate (Alternative)

        # Thresholds
        self.A = (1 - beta) / alpha
        self.B = beta / (1 - alpha)

        self.log_likelihood_ratio = 0.0

    def record_trial(self, success: bool):
        """
        Calculates the Wald Likelihood Ratio.
        ln(L1/L0) = k*ln(p1/p0) + (n-k)*ln((1-p1)/(1-p0))
        """
        if success:
            self.log_likelihood_ratio += math.log((1 - self.p1) / (1 - self.p0))
        else:
            self.log_likelihood_ratio += math.log(self.p1 / self.p0)

    @property
    def status(self) -> str:
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
        self.root = root
        self.state_file = self.root / ".agent" / "sovereign_state.json"
        self.state: dict[str, Any] = self._load_state()

    def _load_state(self) -> dict[str, Any]:
        if not self.state_file.exists():
            return {}
        try:
            return json.loads(self.state_file.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            return {}

    def _save_state(self):
        try:
            self.state_file.parent.mkdir(parents=True, exist_ok=True)
            self.state_file.write_text(json.dumps(self.state, indent=2), encoding='utf-8')
        except OSError:
            pass

    def is_locked(self, rel_path: str) -> bool:
        """Checks if a file is locked due to instability."""
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
        Returns True if state is stable, False if oscillation/fatigue detected.
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
            HUD.persona_log("FAIL", f"OSCILLATION DETECTED: {rel_path} returning to previous state. LOCKING.")
            return False

        if file_state["edit_count_24h"] >= 10: # Increased limit for Phase 4
            file_state["status"] = "LOCKED"
            self._save_state()
            HUD.persona_log("FAIL", f"FILE FATIGUE: {rel_path} locked after 10 edits.")
            return False

        self._save_state()
        return True
