"""
[ENGINE] Sovereign Neural Wardens
Lore: "The nerves of the All-Father should not just feel the pain; they should understand the cause."
Purpose: Implements lore-aware MLP models for anomaly detection, grounded in Mimir's Well.
"""

# Intent: Sovereign Neural Wardens for Anomaly and Session state monitoring using local MLP models.

import pickle
import json
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
from src.core.mimir_client import mimir

class WardenCircuitBreaker(Exception):
    """Raised when a Warden detects critical system drift or lore violation."""
    pass

class BaseWarden:
    """Base class for Sovereign Wardens providing neural operations and lore grounding."""
    def __init__(self) -> None:
        self.is_training: bool = True
        self.running_mean: np.ndarray = np.zeros(1)
        self.running_var: np.ndarray = np.ones(1)

    def train(self) -> None: self.is_training = True
    def eval(self) -> None: self.is_training = False

    def sigmoid(self, x: np.ndarray) -> np.ndarray:
        return 1 / (1 + np.exp(-np.clip(x, -500, 500)))

    def relu(self, x: np.ndarray) -> np.ndarray:
        return np.maximum(0, x)

    def _normalize(self, x: np.ndarray) -> np.ndarray:
        std = np.sqrt(self.running_var + 1e-8)
        return (x - self.running_mean) / std

    async def get_lore_alignment(self, file_path: str, action_desc: str) -> float:
        """
        [🔱] THE ONE MIND: Measures alignment between action and intent.
        Returns a score from 0.0 (Violation) to 1.0 (Aligned).
        """
        try:
            intent = await mimir.get_file_intent(file_path)
            if not intent: return 0.5 # Neutral if lore is missing
            
            # Simple heuristic: Check if keywords from action exist in intent
            # In a full upgrade, this would use a local embedding cosine similarity
            action_keywords = set(action_desc.lower().split())
            intent_keywords = set(intent.lower().split())
            
            intersection = action_keywords.intersection(intent_keywords)
            return min(1.0, (len(intersection) + 1) / (len(action_keywords) + 1))
        except Exception:
            return 0.5

    def forward(self, x: list[float]) -> float:
        raise NotImplementedError


class AnomalyWarden(BaseWarden):
    """
    [THE LORE-AWARE CANARY]
    Monitors: [latency, tokens, loops, errors, lore_alignment]
    """
    def __init__(self, model_path: str | Path | None = None, ledger_path: str | Path | None = None) -> None:
        super().__init__()
        self.model_path = Path(model_path) if model_path else Path(".agents/warden.pkl")
        self.ledger_path = Path(ledger_path) if ledger_path else Path("src/data/anomalies_queue.jsonl")

        self.input_dim, self.hidden_dim, self.output_dim = 5, 16, 1
        self.W1, self.b1 = np.random.randn(self.input_dim, self.hidden_dim) * 0.01, np.zeros((1, self.hidden_dim))
        self.W2, self.b2 = np.random.randn(self.hidden_dim, self.output_dim) * 0.01, np.zeros((1, self.output_dim))
        
        self.running_mean, self.running_var = np.zeros(self.input_dim), np.ones(self.input_dim)
        self.count, self.burn_in_cycles = 0, 100

        self.load()

    def forward(self, x: list[float]) -> float:
        x_raw = np.array(x, dtype=float).reshape(1, -1)
        x_norm = self._normalize(x_raw)
        h = self.relu(x_norm @ self.W1 + self.b1)
        
        if self.is_training:
            h *= (np.random.rand(*h.shape) > 0.1).astype(float)

        out = self.sigmoid(h @ self.W2 + self.b2)
        return float(out[0, 0])

    def train_step(self, x: list[float], y: float, lr: float = 0.01) -> None:
        if not self.is_training: return

        x_raw = np.array(x, dtype=float).reshape(1, -1)
        y_true = np.array(y, dtype=float).reshape(1, -1)

        delta = x_raw.flatten() - self.running_mean
        self.count += 1
        self.running_mean += delta / self.count
        self.running_var = (self.running_var * (self.count - 1) + delta * (x_raw.flatten() - self.running_mean)) / self.count

        prob = self.forward(x)
        x_norm = self._normalize(x_raw)

        # Backprop
        d_out = (prob - y_true) * (prob * (1 - prob))
        d_W2 = (self.relu(x_norm @ self.W1 + self.b1)).T @ d_out
        
        # Note: h was used in forward but not stored, we recompute for backprop
        h = self.relu(x_norm @ self.W1 + self.b1)
        d_h = (d_out @ self.W2.T) * (h > 0)
        d_W1 = x_norm.T @ d_h

        self.W1 -= lr * d_W1
        self.W2 -= lr * d_W2
        self.save()

    def log_anomaly(self, metadata: np.ndarray | list[float], prob: float) -> None:
        """Logs detected anomaly to the queue file."""
        from src.core.utils import atomic_jsonl_append

        # Ensure metadata is a list for JSON serialization
        metadata_list = metadata.tolist() if hasattr(metadata, "tolist") else list(metadata)

        dossier = {
            "timestamp": datetime.now().isoformat(),
            "metadata_vector": metadata_list,
            "anomaly_probability": prob,
            "mean_baseline": self.running_mean.tolist(),
            "status": "pending"
        }
        atomic_jsonl_append(self.ledger_path, dossier)

    def save(self) -> None:
        """Persist weights and stats to disk."""
        self.model_path.parent.mkdir(parents=True, exist_ok=True)
        state = {
            "W1": self.W1, "b1": self.b1,
            "W2": self.W2, "b2": self.b2,
            "running_mean": self.running_mean,
            "running_var": self.running_var,
            "count": self.count,
            "burn_in_cycles": self.burn_in_cycles
        }
        with open(self.model_path, "wb") as f:
            pickle.dump(state, f)

    def load(self) -> None:
        """Load weights and stats from disk."""
        if self.model_path.exists():
            try:
                with open(self.model_path, "rb") as f:
                    state = pickle.load(f)
                self.W1, self.b1, self.W2, self.b2 = state["W1"], state["b1"], state["W2"], state["b2"]
                self.running_mean, self.running_var = state["running_mean"], state["running_var"]
                self.count, self.burn_in_cycles = max(1, state["count"]), state["burn_in_cycles"]
            except Exception:
                pass


class SessionWarden(BaseWarden):
    """
    [V4] Macroscopic Session Monitor.
    Monitors: [avg_session_score, total_traces_count, session_error_rate]
    """
    def __init__(self, model_path: str | Path | None = None, input_dim: int = 3, hidden_dim: int = 4) -> None:
        """Initializes the SessionWarden."""
        super().__init__()
        self.model_path = Path(model_path) if model_path else Path(".agents/session_warden.pkl")
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.output_dim = 1

        # State: Weights & Biases
        self.W1 = np.random.randn(self.input_dim, self.hidden_dim) * 0.01
        self.b1 = np.zeros((1, self.hidden_dim))
        self.W2 = np.random.randn(self.hidden_dim, self.output_dim) * 0.01
        self.b2 = np.zeros((1, self.output_dim))

        # Z-Score Running Stats
        self.running_mean = np.zeros(self.input_dim)
        self.running_var = np.ones(self.input_dim)
        self.count = 0

        # Internal state
        self.h = np.zeros((1, self.hidden_dim))
        self.out = np.zeros((1, self.output_dim))

        self.load()

    def forward(self, x: list[float]) -> float:
        """Inference pass."""
        x_raw = np.array(x, dtype=float).reshape(1, -1)
        x_norm = self._normalize(x_raw)

        self.h = self.relu(x_norm @ self.W1 + self.b1)

        if self.is_training:
            mask = (np.random.rand(*self.h.shape) > 0.1).astype(float) # 10% Dropout
            self.h *= mask

        self.out = self.sigmoid(self.h @ self.W2 + self.b2)
        return float(self.out[0, 0])

    def train_step(self, x: list[float], y: float, lr: float = 0.01) -> None:
        """Vectorized training for session aggregates."""
        if not self.is_training:
            return

        x_raw = np.array(x, dtype=float).reshape(1, -1)
        y_true = np.array(y, dtype=float).reshape(1, -1)

        delta = x_raw.flatten() - self.running_mean
        self.count += 1
        self.running_mean += delta / self.count
        self.running_var = (self.running_var * (self.count - 1) + delta * (x_raw.flatten() - self.running_mean)) / self.count

        prob = self.forward(x)
        x_norm = self._normalize(x_raw)

        # Backprop
        d_out = (prob - y_true) * (prob * (1 - prob))
        d_W2 = self.h.T @ d_out
        d_b2 = np.sum(d_out, axis=0, keepdims=True)

        d_h = (d_out @ self.W2.T) * (self.h > 0)
        d_W1 = x_norm.T @ d_h
        d_b1 = np.sum(d_h, axis=0, keepdims=True)

        self.W1 -= lr * d_W1
        self.b1 -= lr * d_b1
        self.W2 -= lr * d_W2
        self.b2 -= lr * d_b2

        self.save()

    def save(self) -> None:
        """Persist SessionWarden state."""
        self.model_path.parent.mkdir(parents=True, exist_ok=True)
        state = {
            "W1": self.W1, "b1": self.b1, "W2": self.W2, "b2": self.b2,
            "running_mean": self.running_mean, "running_var": self.running_var,
            "count": self.count
        }
        with open(self.model_path, "wb") as f:
            pickle.dump(state, f)

    def load(self) -> None:
        """Load SessionWarden state."""
        if self.model_path.exists():
            try:
                with open(self.model_path, "rb") as f:
                    state = pickle.load(f)
                self.W1, self.b1, self.W2, self.b2 = state["W1"], state["b1"], state["W2"], state["b2"]
                self.running_mean, self.running_var = state["running_mean"], state["running_var"]
                self.count = max(1, state["count"])
            except Exception:
                pass

def main() -> None:
    """CLI entry point for warden management and training."""
    import argparse
    parser = argparse.ArgumentParser(description="Atomic Neural Warden Management")
    parser.add_argument("--train", type=int, help="Run N training cycles with random noise.")
    args = parser.parse_args()

    if args.train:
        warden = AnomalyWarden()
        warden.train()
        print(f"Executing {args.train} training cycles...")
        for i in range(args.train):
            # Simulate a healthy baseline with occasional noise
            x = [10.0 + np.random.rand()*5, 50.0 + np.random.rand()*10, 1.0, 0.0]
            warden.train_step(x, 0.0)
            if i % 100 == 0:
                print(f"Cycle {i} complete.")
        print("Training complete. State secured.")

if __name__ == "__main__":
    main()
