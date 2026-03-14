
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.metrics import ProjectMetricsEngine


class TestProjectMetricsEngine(unittest.TestCase):

    @patch("src.core.metrics.PromptLinter")
    @patch("src.core.metrics.AnomalyWarden")
    @patch("src.core.metrics.subprocess.run")
    @patch("src.core.metrics.os.path.exists")
    @patch("src.core.metrics.open")
    @patch("src.core.metrics.Path.exists", return_value=False)
    def test_compute_score(self, mock_path_exists, mock_open, mock_exists, mock_run, mock_cortex_cls, mock_linter_cls):
        # Setup mocks
        mock_linter = mock_linter_cls.return_value
        mock_cortex = mock_cortex_cls.return_value

        mock_linter.calculate_integrity_score.return_value = 100.0
        mock_cortex.forward.return_value = 0.5  # anomaly prob 0.5 -> alignment 50

        # Mock file existence: weights.json -> False (use defaults), others -> True
        def exists_side_effect(path):
            return "weights.json" not in str(path)
        mock_exists.side_effect = exists_side_effect

        # Mock file read: return dummy content for muninn.py
        mock_open.return_value.__enter__.return_value.read.return_value = "dependency-free content"

        # Mock Subprocess (Radon)
        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.stdout = "Average complexity: A"
        mock_run.return_value = mock_process

        engine = ProjectMetricsEngine()

        # Compute
        # Prompt=100 (15) -> 15
        # Alignment=50 (mock forward returns 0.5) (15) -> 7.5
        # Function=80 (default) (35) -> 28
        # Form=90 (A) (25) -> 22.5
        # Lore=50 (default) (10) -> 5
        # Current GPHS weighting = 40% structural + 15% prompt + 15% alignment + 30% complexity
        # Structural defaults to 70 when no Chronicle state map is present.
        # Total = (70*0.40) + (100*0.15) + (50*0.15) + (70*0.30) = 71.5

        score = engine.compute(".")
        self.assertAlmostEqual(score, 71.5, places=1)

    @patch("src.core.metrics.PromptLinter")
    @patch("src.core.metrics.AnomalyWarden")
    @patch("src.core.metrics.subprocess.run")
    @patch("src.core.metrics.Path.exists", return_value=False)
    def test_radon_failure(self, mock_path_exists, mock_run, mock_cortex_cls, mock_linter_cls):
        mock_linter = mock_linter_cls.return_value
        mock_cortex = mock_cortex_cls.return_value

        # Radon fails
        mock_process = MagicMock()
        mock_process.returncode = 1
        mock_run.return_value = mock_process

        mock_linter.calculate_integrity_score.return_value = 0.0
        mock_cortex.forward.return_value = 1.0  # anomaly prob 1.0 -> alignment 0

        engine = ProjectMetricsEngine()

        # With the current weighting, GPHS falls back to structural 70 and complexity 70 when Radon fails.
        # Total = (70*0.40) + (0*0.15) + (0*0.15) + (70*0.30) = 49.0

        score = engine.compute(".")
        self.assertAlmostEqual(score, 49.0, places=1)

if __name__ == "__main__":
    unittest.main()
