
import os
import sys
import unittest
from unittest.mock import MagicMock, patch
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.metrics import ProjectMetricsEngine

class TestProjectMetricsEngine(unittest.TestCase):
    def setUp(self):
        self.mock_linter = MagicMock()
        self.mock_cortex = MagicMock()
        
        # Patch dependencies
        self.linter_patcher = patch("src.core.metrics.PromptLinter", return_value=self.mock_linter)
        self.cortex_patcher = patch("src.core.metrics.AtomicCortex", return_value=self.mock_cortex)
        
        self.MockLinter = self.linter_patcher.start()
        self.MockCortex = self.cortex_patcher.start()
        
        # Setup default mock behaviors
        self.mock_linter.calculate_integrity_score.return_value = 100.0
        self.mock_cortex.calculate_project_loss.return_value = 0.5

    def tearDown(self):
        self.linter_patcher.stop()
        self.cortex_patcher.stop()

    @patch("src.core.metrics.subprocess.run")
    @patch("src.core.metrics.os.path.exists")
    @patch("src.core.metrics.open")
    def test_compute_score(self, mock_open, mock_exists, mock_run):
        # Mock file existence: weights.json -> False (use defaults), others -> True
        def exists_side_effect(path):
            if "weights.json" in str(path):
                return False
            return True
        mock_exists.side_effect = exists_side_effect
        
        # Mock file read: return dummy content for muninn.py
        mock_open.return_value.__enter__.return_value.read.return_value = "dependency-free content"
        
        # Mock Subprocess (Radon)
        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.stdout = "Average complexity: A"
        mock_run.return_value = mock_process
        
        # Initialize Engine (will use default weights)
        engine = ProjectMetricsEngine() 
        
        # Compute
        # Prompt=100 (15)
        # Alignment=50 (loss=0.5 -> 1-0.5=0.5 -> 50) (15) -> 7.5
        # Function=80 (default) (35) -> 28
        # Form=90 (A) (25) -> 22.5
        # Lore=50 (default) (10) -> 5
        # Total = 15 + 7.5 + 28 + 22.5 + 5 = 78.0
        
        score = engine.compute(".")
        
        self.assertAlmostEqual(score, 78.0, places=1)
        
    @patch("src.core.metrics.subprocess.run")
    def test_radon_failure(self, mock_run):
        # Radon fails or returns non-A
        mock_process = MagicMock()
        mock_process.returncode = 1
        mock_run.return_value = mock_process
        
        engine = ProjectMetricsEngine()
        # Force other mocks
        self.MockLinter.return_value.calculate_integrity_score.return_value = 0.0
        self.MockCortex.return_value.calculate_project_loss.return_value = 1.0 # alignment 0
        
        # Function=80, Form=70 (exception/default), Prompt=0, Alignment=0, Lore=50
        # (80*35) + (70*25) + (0) + (0) + (50*10)
        # 2800 + 1750 + 500 = 5050 / 100 = 50.5
        
        score = engine.compute(".")
        self.assertAlmostEqual(score, 50.5, places=1)

if __name__ == "__main__":
    unittest.main()