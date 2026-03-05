
import sys
from pathlib import Path
from unittest.mock import MagicMock

import numpy as np
import pytest

# [LINKSCOTT] Strict Pathlib and SysPath Management
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Mock externals to adhere to EMPIRE isolation rules
MOCK_EXTERNALS = ["src.core.sovereign_hud.SovereignHUD"]
for mod in MOCK_EXTERNALS:
    sys.modules[mod] = MagicMock()

from src.core.engine.atomic_gpt import SessionWarden


class TestSessionWardenDeterminismEmpire:
    """
    [EMPIRE] GIVEN-WHEN-THEN Determinism Contract.
    Ensures that dropout layers do not cause stochastic variance during inference.
    """

    def setup_method(self):
        self.warden = SessionWarden(input_dim=3, hidden_dim=4)
        # Guarantee non-zero activations so dropout actually changes the output
        self.warden.W1 = np.ones((3, 4)) * 0.1
        self.warden.W2 = np.ones((4, 1)) * 0.1
        self.warden.b1 = np.ones((1, 4)) * 0.1
        self.test_vector = np.array([0.92, 150.0, 0.05], dtype=np.float32)

    def test_eval_mode_determinism(self):
        """
        GIVEN a SessionWarden in EVAL mode
        WHEN identical vectors are processed multiple times
        THEN the output scores must be identical (Zero Variance).
        """
        self.warden.eval() # [V4] Explicit Eval Mode

        score_1 = self.warden.predict(self.test_vector)
        score_2 = self.warden.predict(self.test_vector)
        score_3 = self.warden.predict(self.test_vector)

        assert score_1 == score_2 == score_3, "Non-deterministic output in eval mode detected."

    def test_train_mode_stochasticity(self):
        """
        GIVEN a SessionWarden in TRAIN mode
        WHEN identical vectors are processed multiple times
        THEN the output scores SHOULD vary (Dropout Active).
        """
        self.warden.train() # [V4] Explicit Train Mode

        scores = [self.warden.predict(self.test_vector) for _ in range(10)]

        # In a 4-neuron bottleneck with 10% dropout, variance is high
        unique_scores = set(scores)
        assert len(unique_scores) > 1, "Dropout appears inactive in train mode."

if __name__ == "__main__":
    pytest.main([__file__])
