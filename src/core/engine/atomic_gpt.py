"""
[ENGINE] Atomic Neural Wardens
Lore: "The digital nerves of the All-Father."
Purpose: Implements lightweight MLP models for metadata anomaly detection and session monitoring.
"""

import pickle
from datetime import datetime
from pathlib import Path

import numpy as np


class WardenCircuitBreaker(Exception):
    """Raised when the AnomalyWarden detects a critical system drift."""
    pass

class BaseWarden:
    """Base class for Wardens providing common neural operations and mode toggling."""
    def __init__(self) -> None:
        """Initializes the warden in training mode."""
        self.is_training: bool = True
        # Running stats placeholders
        self.running_mean: np.ndarray = np.zeros(1)
        self.running_var: np.ndarray = np.ones(1)

    def train(self) -> None:
        """Enable dropout and weight updates."""
        self.is_training = True

    def eval(self) -> None:
        """Disable dropout for deterministic inference."""
        self.is_training = False

    def sigmoid(self, x: np.ndarray) -> np.ndarray:
        """Sigmoid activation function."""
        return 1 / (1 + np.exp(-np.clip(x, -500, 500)))

    def relu(self, x: np.ndarray) -> np.ndarray:
        """ReLU activation function."""
        return np.maximum(0, x)

    def _normalize(self, x: np.ndarray) -> np.ndarray:
        """Perform Z-Score standardization."""
        std = np.sqrt(self.running_var + 1e-8)
        return (x - self.running_mean) / std

    def predict(self, x: list[float]) -> float:
        """Alias for forward pass to satisfy EMPIRE contracts."""
        return self.forward(x)

    def forward(self, x: list[float]) -> float:
        """Abstract forward pass."""
        raise NotImplementedError


class AnomalyWarden(BaseWarden):
    """
    [THE SYSTEM CANARY]
    A lightweight NumPy MLP for Metadata Anomaly Detection.
    Monitors: [latency_ms, token_count, loop_iterations, error_rate]
    """
    def __init__(self, model_path: str | Path | None = None, ledger_path: str | Path | None = None) -> None:
        """Initializes the AnomalyWarden with local state paths."""
        super().__init__()
        self.model_path = Path(model_path) if model_path else Path(".agent/warden.pkl")
        self.ledger_path = Path(ledger_path) if ledger_path else Path("src/data/anomalies_queue.jsonl")

        # Hyperparameters
        self.input_dim = 4
        self.hidden_dim = 16
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
        self.burn_in_cycles = 100

        # Internal state for backprop
        self.h = np.zeros((1, self.hidden_dim))
        self.out = np.zeros((1, self.output_dim))

        self.load()

    def forward(self, x: list[float]) -> float:
        """
        Inference pass with dropout logic.
        
        Args:
            x: List of 4 features [latency, tokens, loops, errors].
            
        Returns:
            Anomaly probability score (0.0 to 1.0).
        """
        x_raw = np.array(x, dtype=float).reshape(1, -1)
        x_norm = self._normalize(x_raw)

        self.h = self.relu(x_norm @ self.W1 + self.b1)

        # [V4] 10% Dropout simulation during training
        if self.is_training:
            mask = (np.random.rand(*self.h.shape) > 0.1).astype(float)
            self.h *= mask

        self.out = self.sigmoid(self.h @ self.W2 + self.b2)
        return float(self.out[0, 0])

    def train_step(self, x: list[float], y: float, lr: float = 0.01) -> None:
        """
        Vectorized backpropagation step.
        
        Args:
            x: Input feature vector.
            y: Target label (1.0 for anomaly, 0.0 for normal).
            lr: Learning rate.
        """
        if not self.is_training:
            return

        x_raw = np.array(x, dtype=float).reshape(1, -1)
        y_true = np.array(y, dtype=float).reshape(1, -1)

        # Update normalization stats
        delta = x_raw.flatten() - self.running_mean
        self.count += 1
        self.running_mean += delta / self.count
        self.running_var = (self.running_var * (self.count - 1) + delta * (x_raw.flatten() - self.running_mean)) / self.count

        prob = self.forward(x)
        x_norm = self._normalize(x_raw)

        # Backprop (MSE Loss)
        d_out = (prob - y_true) * (prob * (1 - prob)) # Sigmoid derivative
        d_W2 = self.h.T @ d_out
        d_b2 = np.sum(d_out, axis=0, keepdims=True)

        d_h = (d_out @ self.W2.T) * (self.h > 0) # ReLU derivative
        d_W1 = x_norm.T @ d_h
        d_b1 = np.sum(d_h, axis=0, keepdims=True)

        # Update weights
        self.W1 -= lr * d_W1
        self.b1 -= lr * d_b1
        self.W2 -= lr * d_W2
        self.b2 -= lr * d_b2

        if self.burn_in_cycles > 0:
            self.burn_in_cycles -= 1

        # High-probability anomaly logging
        if prob > 0.85:
            self.log_anomaly(x_raw.flatten(), prob)

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
        self.model_path = Path(model_path) if model_path else Path(".agent/session_warden.pkl")
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
