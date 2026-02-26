import tempfile
import unittest
from pathlib import Path

import numpy as np

from src.core.engine.atomic_gpt import AnomalyWarden


class TestAnomalyWarden(unittest.TestCase):
    def setUp(self):
        """Create isolated temp paths for each test to avoid state pollution."""
        self._tmp = tempfile.mkdtemp()
        self.model_path = Path(self._tmp) / "warden.pkl"
        self.ledger_path = Path(self._tmp) / "ledger.json"

    def test_forward_returns_probability(self):
        """Ensure forward() returns a float between 0 and 1."""
        warden = AnomalyWarden(model_path=self.model_path, ledger_path=self.ledger_path)
        x = [100.0, 50, 3, 0.01]  # [latency_ms, token_count, loop_iterations, error_rate]
        prob = warden.forward(x)

        self.assertIsInstance(prob, float)
        self.assertGreaterEqual(prob, 0.0)
        self.assertLessEqual(prob, 1.0)

    def test_train_step_updates_weights(self):
        """Verify that a training step modifies the weight matrices."""
        warden = AnomalyWarden(model_path=self.model_path, ledger_path=self.ledger_path)
        # Bypass burn-in so forward() computes real gradients
        warden.burn_in_cycles = 0
        warden.count = 100  # pretend we have enough samples for normalization
        w1_before = warden.W1.copy()
        warden.train_step([100, 50, 3, 0.01], [1.0], lr=0.1)

        # At least one weight should have changed
        self.assertFalse(np.array_equal(w1_before, warden.W1))

    def test_normalize_uses_running_stats(self):
        """Z-score normalization should use running mean/var."""
        warden = AnomalyWarden(model_path=self.model_path, ledger_path=self.ledger_path)
        warden.running_mean = np.array([100.0, 50.0, 3.0, 0.01])
        warden.running_var = np.ones(4)
        warden.count = 10

        x = np.array([100.0, 50.0, 3.0, 0.01]).reshape(1, -1)
        result = warden._normalize(x)
        # With mean == x, result should be ~0
        np.testing.assert_array_almost_equal(result, np.zeros((1, 4)), decimal=5)


if __name__ == "__main__":
    unittest.main()
