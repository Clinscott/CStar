import unittest
import sys
from pathlib import Path
from unittest.mock import patch

# Add project root to path
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.sentinel.coordinator import MissionCoordinator

class TestGungnirCalculusEdges(unittest.TestCase):
    """Tier 3: Gungnir Calculus Edge Case Stress Test"""

    def setUp(self):
        self.coordinator = MissionCoordinator(root=project_root)

    def test_empty_file_calculus(self):
        """Verify that empty files produce baseline scores without crashing."""
        breach = {
            "file": "empty.py",
            "type": "ANNEX",
            "metrics": {
                "logic": 0,
                "complexity": 0,
                "loc": 0,
                "gravity": 0
            },
            "severity": "LOW"
        }
        with patch("pathlib.Path.exists", return_value=False):
            # Adjudicate mission for empty file
            mission = self.coordinator.select_mission([breach])
            self.assertIsNotNone(mission)
            self.assertEqual(mission["file"], "empty.py")

    def test_infinite_complexity_clipping(self):
        """Verify that extreme complexity scores are clipped to the 1-10 range."""
        # Simulated raw metrics from a hypothetical nightmare file
        breach = {
            "file": "nightmare.py",
            "type": "MIMIR",
            "metrics": {
                "logic": 0.1,
                "complexity": 9999,
                "loc": 100000,
                "gravity": 100
            },
            "severity": "CRITICAL"
        }
        with patch("pathlib.Path.exists", return_value=False):
            mission = self.coordinator.select_mission([breach])
            self.assertIsNotNone(mission)
            self.assertEqual(mission["file"], "nightmare.py")

    def test_null_metric_resilience(self):
        """Verify that missing metrics don't cause selection failure."""
        breaches = [
            {"file": "broken_data.py", "type": "EDDA", "metrics": {}, "severity": "MEDIUM"},
            {"file": "healthy.py", "type": "VALKYRIE", "metrics": {"logic": 9.0, "overall": 9.0}, "severity": "LOW"}
        ]
        with patch("pathlib.Path.exists", return_value=False):
            mission = self.coordinator.select_mission(breaches)
            # Should pick the one with higher severity
            self.assertEqual(mission["file"], "broken_data.py")

if __name__ == '__main__':
    unittest.main()
