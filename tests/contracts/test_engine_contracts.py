import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
sys.path.append(PROJECT_ROOT)

from src.core.engine.orchestrator import SovereignOrchestrator


class TestEngineContracts(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name)
        self.base = self.root / ".agents"
        self.base.mkdir()
        self.orchestrator = SovereignOrchestrator(
            self.root,
            self.base,
            {"REC": 1.5},
            {"version": "1.0.1"},
        )

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    @patch("src.core.engine.orchestrator.SovereignHUD")
    def test_transition(self, mock_hud: MagicMock) -> None:
        engine = MagicMock()
        engine.normalize.return_value = "status"
        injector = MagicMock()
        executor = MagicMock()
        reporter = MagicMock()
        context = MagicMock()

        engine.search.return_value = [
            {"trigger": "STATUS", "score": 2.0, "is_global": False},
        ]
        self.orchestrator.execute_search(
            "status", engine, injector, executor, reporter, context,
        )
        payload = reporter.render_hud.call_args.args[0]
        self.assertEqual(payload.target_workflow, "STATUS")
        executor.handle_proactive.assert_called_once_with(payload)

        reporter.reset_mock()
        executor.reset_mock()
        engine.search.return_value = []
        injector.proactive_discovery.return_value = None
        self.orchestrator.execute_search(
            "unknown capability", engine, injector, executor, reporter, context,
        )
        self.assertIsNone(reporter.render_hud.call_args.args[0])
        executor.handle_proactive.assert_not_called()
        executor.suggest_forge.assert_called_once_with("unknown capability")
        mock_hud.persona_log.assert_any_call(
            "WARN",
            "SovereignEngine: No matching local skills found. External research requires the authorized Researcher lane.",
        )
        self.assertIsNone(self.orchestrator.web_fallback("unknown capability"))


if __name__ == "__main__":
    unittest.main()
