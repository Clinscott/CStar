import os
import sys
import json
import asyncio
import pytest
import shutil
from pathlib import Path
from unittest.mock import MagicMock, patch, AsyncMock, mock_open

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Now imports can proceed — AnomalyWarden exists in atomic_gpt.py
from src.sentinel.muninn import Muninn
from tests.harness.manual_learn import run_learning_cycle
from tests.harness.raven_proxy import RavenProxy

@pytest.fixture
def mock_hud():
    with patch("src.sentinel.muninn.SovereignHUD") as mock:
        yield mock

@pytest.fixture
def muninn_instance(mock_hud):
    with patch("src.sentinel.muninn.TheWatcher"), \
         patch("src.sentinel.muninn.ProjectMetricsEngine") as mock_metrics_class, \
         patch("src.sentinel.muninn.AlfredOverwatch"), \
         patch("src.sentinel.muninn.GungnirSPRT"), \
         patch("src.sentinel.muninn.AntigravityUplink"), \
         patch("google.genai.Client"), \
         patch.dict(os.environ, {"GOOGLE_API_KEY": "MOCK_KEY"}):
        
        # Setup metrics engine mock to return a float
        mock_metrics_class.return_value.compute.return_value = 85.0
        
        m = Muninn(target_path=str(PROJECT_ROOT))
        yield m

def test_muninn_api_key_priority(mock_hud):
    """Assert that Muninn prioritizes MUNINN_API_KEY over GOOGLE_API_KEY."""
    env_vars = {
        "MUNINN_API_KEY": "MUNINN_PRIORITY_KEY",
        "GOOGLE_API_KEY": "SHARED_FALLBACK_KEY"
    }
    with patch.dict(os.environ, env_vars), \
         patch("src.sentinel.muninn.AntigravityUplink") as mock_uplink, \
         patch("src.sentinel.muninn.TheWatcher"), \
         patch("src.sentinel.muninn.ProjectMetricsEngine"), \
         patch("src.sentinel.muninn.AlfredOverwatch"), \
         patch("src.sentinel.muninn.GungnirSPRT"), \
         patch("google.genai.Client"):
        
        m = Muninn(target_path=str(PROJECT_ROOT))
        assert m.api_key == "MUNINN_PRIORITY_KEY"
        # Ensure AntigravityUplink was initialized with the priority key
        mock_uplink.assert_called_with(api_key="MUNINN_PRIORITY_KEY")

def test_muninn_anti_oscillation(muninn_instance):
    """Assert that execution skips forge loop if file is locked."""
    # Setup mock breaches
    target_file = "unstable_logic.py"
    breaches = ([{'file': target_file, 'type': 'TEST_BREACH', 'action': 'Fix it'}], {})
    
    muninn_instance._execute_hunt_async = AsyncMock(return_value=breaches)
    muninn_instance.watcher.is_locked.return_value = True
    
    # Run
    with patch.object(muninn_instance, "_forge_improvement") as mock_forge:
        result = muninn_instance.run()
        
        assert result is False
        muninn_instance.watcher.is_locked.assert_called_with(target_file)
        mock_forge.assert_not_called()

def test_muninn_crucible_rollback(muninn_instance):
    """Assert that failing verification triggers rollback and records metric."""
    target_file = "hallucinated_fix.py"
    breaches = ([{'file': target_file, 'type': 'MIMIR_STRUCTURAL_BREACH', 'action': 'Improve AST'}], {})
    
    muninn_instance._execute_hunt_async = AsyncMock(return_value=breaches)
    muninn_instance.watcher.is_locked.return_value = False
    
    # Mock Forge to 'succeed' in writing the bad code
    muninn_instance._forge_improvement = MagicMock(return_value=True)
    # Mock The Crucible to fail
    muninn_instance._verify_fix = MagicMock(return_value=False)
    
    with patch.object(muninn_instance, "_rollback") as mock_rollback, \
         patch.object(muninn_instance, "_record_metric") as mock_record:
        
        muninn_instance.run()
        
        mock_rollback.assert_called_once()
        mock_record.assert_called_with("MIMIR", hit=False)

def test_muninn_learning_cycle():
    """Assert that manual_learn cycles call Muninn.run correctly."""
    with patch("tests.harness.manual_learn.Muninn") as MockMuninn, \
         patch("tests.harness.manual_learn.RavenProxy"), \
         patch.dict(os.environ, {"GOOGLE_API_KEY": "FAKE_KEY"}):
        
        mock_m = MockMuninn.return_value
        # First call returns True (improvement), second returns False (stable)
        mock_m.run.side_effect = [True, False]
        
        run_learning_cycle(n_cycles=3)
        
        # Should have called run twice (stopped early on False)
        assert mock_m.run.call_count == 2

def test_raven_proxy_injection(tmp_path):
    """Assert that RavenProxy injects lessons from corrections.json using tmp_path isolation."""
    # Create a dummy corrections.json in tmp_path
    corrections_file = tmp_path / "corrections.json"
    lesson_text = "Always preserve original function signatures."
    corrections_file.write_text(json.dumps({"lessons": [lesson_text]}))
    
    with patch("tests.harness.raven_proxy.genai.Client"):
        proxy = RavenProxy(api_key="FAKE_KEY")
        # Manually point the corrections_path to our tmp file
        proxy.corrections_path = corrections_file
        
        original_content = "Fix the login bug."
        augmented = proxy._inject_lessons(original_content)
        
        assert lesson_text in augmented
        assert original_content in augmented
