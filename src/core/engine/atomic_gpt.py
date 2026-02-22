import numpy as np
import pickle
import json
from datetime import datetime
from pathlib import Path

class WardenCircuitBreaker(Exception):
    """Raised when the AnomalyWarden detects a critical system drift."""
    pass

class AnomalyWarden:
    """
    [THE SYSTEM CANARY]
    A lightweight NumPy MLP for Metadata Anomaly Detection.
    Monitors: [latency_ms, token_count, loop_iterations, error_rate]
    """
    def __init__(self, model_path=None, ledger_path=None):
        self.model_path = Path(model_path) if model_path else Path(".agent/warden.pkl")
        self.ledger_path = Path(ledger_path) if ledger_path else Path("src/data/anomalies_queue.json")
        
        # Hyperparameters
        self.input_dim = 4
        self.hidden_dim = 16
        self.output_dim = 1
        
        # State: Weights & Biases
        self.W1 = np.random.randn(self.input_dim, self.hidden_dim) * 0.01
        self.b1 = np.zeros((1, self.hidden_dim))
        self.W2 = np.random.randn(self.hidden_dim, self.output_dim) * 0.01
        self.b2 = np.zeros((1, self.output_dim))
        
        # Z-Score Running Stats: [mean, variance, count]
        self.running_mean = np.zeros(self.input_dim)
        self.running_var = np.ones(self.input_dim)
        self.count = 0
        
        # Burn-In Protocol
        self.burn_in_cycles = 100
        
        self.load()

    def _update_stats(self, x):
        """Update running mean and variance using Welford's algorithm."""
        self.count += 1
        delta = x - self.running_mean
        self.running_mean += delta / self.count
        delta2 = x - self.running_mean
        self.running_var = (self.running_var * (self.count - 1) + delta * delta2) / self.count

    def _normalize(self, x):
        """Perform Z-Score standardization."""
        std = np.sqrt(self.running_var + 1e-8)
        return (x - self.running_mean) / std

    def sigmoid(self, x):
        return 1 / (1 + np.exp(-np.clip(x, -500, 500)))

    def relu(self, x):
        return np.maximum(0, x)

    def forward(self, x):
        """
        Inference pass.
        Returns anomaly probability (0.0 to 1.0).
        """
        x_raw = np.array(x, dtype=float).reshape(1, -1)
        x_norm = self._normalize(x_raw)
        
        self.h = self.relu(x_norm @ self.W1 + self.b1)
        self.out = self.sigmoid(self.h @ self.W2 + self.b2)
        
        return float(self.out[0, 0])

    def train_step(self, x, y, lr=0.01):
        """Vectorized backpropagation step."""
        x_raw = np.array(x, dtype=float).reshape(1, -1)
        y_true = np.array(y, dtype=float).reshape(1, -1)
        
        # Update normalization stats
        self._update_stats(x_raw.flatten())
        x_norm = self._normalize(x_raw)
        
        # Forward pass (cached in self.h, self.out)
        prob = self.forward(x)
        
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
            self.log_anomaly(x, prob)
            
        self.save()

    def log_anomaly(self, metadata, prob):
        """Append an AnomalyDossier to the ledger."""
        self.ledger_path.parent.mkdir(parents=True, exist_ok=True)
        
        dossier = {
            "timestamp": datetime.now().isoformat(),
            "metadata_vector": metadata.tolist() if hasattr(metadata, "tolist") else list(metadata),
            "anomaly_probability": prob,
            "mean_baseline": self.running_mean.tolist(),
            "status": "pending"
        }
        
        try:
            if self.ledger_path.exists():
                with open(self.ledger_path, "r", encoding="utf-8") as f:
                    queue = json.load(f)
            else:
                queue = []
            
            queue.append(dossier)
            
            with open(self.ledger_path, "w", encoding="utf-8") as f:
                json.dump(queue, f, indent=2)
        except Exception:
            pass # Silent failure to avoid blocking daemon

    def save(self):
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

    def load(self):
        """Load weights and stats from disk."""
        if self.model_path.exists():
            try:
                with open(self.model_path, "rb") as f:
                    state = pickle.load(f)
                self.W1 = state["W1"]
                self.b1 = state["b1"]
                self.W2 = state["W2"]
                self.b2 = state["b2"]
                self.running_mean = state["running_mean"]
                self.running_var = state["running_var"]
                self.count = max(1, state["count"])
                self.burn_in_cycles = state["burn_in_cycles"]
            except Exception:
                pass # Fallback to random init