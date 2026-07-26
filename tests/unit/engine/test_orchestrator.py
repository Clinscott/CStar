import json
import pytest
from unittest.mock import MagicMock, patch, mock_open
from pathlib import Path
from src.core.engine.orchestrator import SovereignOrchestrator
from src.core.payload import IntentPayload
from src.tools.brave_search import BraveSearch

@pytest.fixture
def orchestrator(tmp_path):
    project_root = tmp_path / "project"
    base_path = tmp_path / "base"
    project_root.mkdir()
    base_path.mkdir()
    thresholds = {"REC": 1.5}
    config = {"version": "1.0.0"}
    return SovereignOrchestrator(project_root, base_path, thresholds, config)

class TestSovereignOrchestrator:
    @patch("src.core.engine.orchestrator.SovereignHUD")
    def test_execute_search_no_query(self, mock_hud, orchestrator):
        context = MagicMock()
        context.strategy.enforce_policy.return_value = ["Policy result"]
        
        orchestrator.execute_search("", None, None, None, None, context)
        
        mock_hud.persona_log.assert_called_with("INFO", "Policy result")

    @patch("src.core.engine.orchestrator.SovereignHUD")
    def test_execute_search_local_hit(self, mock_hud, orchestrator):
        engine = MagicMock()
        engine.search.return_value = [{"score": 2.0, "trigger": "LOCAL_SKILL"}]
        engine.normalize.return_value = "normalized_query"
        
        injector = MagicMock()
        executor = MagicMock()
        reporter = MagicMock()
        context = MagicMock()

        orchestrator.execute_search("my query", engine, injector, executor, reporter, context)
        
        reporter.render_hud.assert_called()
        args, _ = reporter.render_hud.call_args
        payload = args[0]
        assert isinstance(payload, IntentPayload)
        assert payload.target_workflow == "LOCAL_SKILL"
        assert payload.system_meta["confidence"] == 2.0

    @patch("src.core.engine.orchestrator.BraveSearch")
    @patch("src.core.engine.orchestrator.SovereignHUD")
    def test_execute_search_fallback(self, mock_hud, mock_brave_class, orchestrator):
        engine = MagicMock()
        engine.search.return_value = [] # No local hit
        engine.normalize.return_value = "normalized_query"
        
        injector = MagicMock()
        injector.proactive_discovery.return_value = None
        
        mock_brave = mock_brave_class.return_value
        mock_brave.search.return_value = [{"title": "Web result", "url": "http://example.com", "description": "desc"}]
        
        executor = MagicMock()
        reporter = MagicMock()
        context = MagicMock()

        orchestrator.execute_search("missing skill", engine, injector, executor, reporter, context)
        
        mock_hud.persona_log.assert_any_call("INFO", "SovereignEngine: No matching skills found. Fallback...")
        
        args, _ = reporter.render_hud.call_args
        payload = args[0]
        assert payload.target_workflow == "WEB_FALLBACK"

    def test_create_payload_with_terminal_state(self, orchestrator):
        engine = MagicMock()
        engine.normalize.return_value = "normalized"
        top = {"score": 0.9, "trigger": "test_trigger"}
        
        state_dir = orchestrator.base_path / "state"
        state_dir.mkdir()
        state_file = state_dir / "terminal.json"
        state_data = {"last_cmd": "exit"}
        state_file.write_text(json.dumps(state_data))
        
        payload = orchestrator.create_payload("raw", top, engine)
        
        assert payload.terminal_state["last_cmd"] == "exit"
        assert payload.system_meta["version"] == "1.0.0"

    @patch("src.core.engine.orchestrator.BraveSearch")
    def test_web_fallback_brave(self, mock_brave_class, orchestrator):
        mock_brave = mock_brave_class.return_value
        mock_brave.search.return_value = [{"title": "T1", "url": "U1", "description": "D1"}]
        
        result = orchestrator.web_fallback("query")
        assert result["trigger"] == "WEB_FALLBACK"
        assert "T1" in result["data"]
        assert result["web_results"][0]["title"] == "T1"
        mock_brave.search.assert_called_once_with(
            "Corvus Star agent command 'query' meaning programmatic interface"
        )

    @patch("src.core.engine.orchestrator.BraveSearch")
    def test_web_fallback_empty_brave_result_returns_none(self, mock_brave_class, orchestrator):
        mock_brave_class.return_value.search.return_value = []

        assert orchestrator.web_fallback("query") is None
        mock_brave_class.return_value.search.assert_called_once()

    def test_web_fallback_missing_brave_credentials_returns_none(
        self,
        orchestrator,
        monkeypatch,
        tmp_path,
    ):
        monkeypatch.delenv("BRAVE_API_KEY", raising=False)
        monkeypatch.setattr(
            BraveSearch,
            "QUOTA_FILE",
            tmp_path / ".agents" / "brave_quota.json",
        )
        network_get = MagicMock(side_effect=AssertionError("network call was not expected"))
        monkeypatch.setattr("src.tools.brave_search.requests.get", network_get)

        assert orchestrator.web_fallback("query") is None
        network_get.assert_not_called()
