"""
Bonus Warden Tests
Verifies: Valkyrie (Dead Code), Mimir (Complexity), and Priority Integration.
Uses mocking to avoid external tool dependencies (Vulture/Radon) where possible.
"""
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch
import sys
import os

project_root = Path(__file__).parent.parent.parent.absolute()
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from src.sentinel.sovereign_fish import (
    ValkyrieWarden,
    MimirWarden,
    SovereignFish
)

class TestValkyrieWarden:
    """Detects dead code using Vulture (Mocked)."""

    @patch('src.sentinel.sovereign_fish.vulture')
    def test_finds_unused_function(self, mock_vulture_module, tmp_path):
        # Setup Mock Vulture
        mock_v = MagicMock()
        mock_vulture_module.Vulture.return_value = mock_v
        
        # Mock item
        mock_item = MagicMock()
        mock_item.filename = str(tmp_path / "src" / "dead.py")
        mock_item.lineno = 10
        mock_item.message = "unused function 'dead'"
        mock_item.confidence = 60 # High confidence
        
        mock_v.get_unused_code.return_value = [mock_item]

        # Init Warden
        valkyrie = ValkyrieWarden(tmp_path)
        
        # Run Scan
        targets = valkyrie.scan()

        # Verify
        assert len(targets) == 1
        assert targets[0]["type"] == "VALKYRIE_BREACH"
        assert "dead.py" in targets[0]["file"]
        assert "unused function 'dead'" in targets[0]["action"]
        
        # Verify Vulture was called correctly
        mock_v.scavenge.assert_called()

    @patch('src.sentinel.sovereign_fish.vulture')
    def test_filters_low_confidence(self, mock_vulture_module, tmp_path):
        # Setup Mock Vulture
        mock_v = MagicMock()
        mock_vulture_module.Vulture.return_value = mock_v
        
        # Mock item with low confidence
        mock_item = MagicMock()
        mock_item.filename = str(tmp_path / "src" / "ignored.py")
        mock_item.confidence = 5 # Below threshold of 10
        
        mock_v.get_unused_code.return_value = [mock_item]

        valkyrie = ValkyrieWarden(tmp_path)
        targets = valkyrie.scan()

        assert len(targets) == 0


class TestMimirWarden:
    """Detects high complexity using Radon."""

    def test_finds_complex_function(self, tmp_path):
        # We can keep this real since it was passing, or mock it too.
        # Let's keep it real for now as Radon seems stable.
        src = tmp_path / "src"
        src.mkdir()
        target = src / "complex_mess.py"
        # 12 branches
        target.write_text("""
def nightmare(x):
    if x == 1: pass
    elif x == 2: pass
    elif x == 3: pass
    elif x == 4: pass
    elif x == 5: pass
    elif x == 6: pass
    elif x == 7: pass
    elif x == 8: pass
    elif x == 9: pass
    elif x == 10: pass
    elif x == 11: pass
    else: pass
""", encoding="utf-8")

        mimir = MimirWarden(tmp_path)
        targets = mimir.scan()

        assert len(targets) > 0
        assert targets[0]["type"] == "MIMIR_BREACH"
        assert "complex_mess.py" in targets[0]["file"]


class TestWardenPriority:
    """Verifies integration order in SovereignFish.run()."""
    
    @patch('src.sentinel.sovereign_fish.HeimdallWarden')
    @patch('src.sentinel.sovereign_fish.ValkyrieWarden')
    @patch('src.sentinel.sovereign_fish.MimirWarden')
    @patch('src.sentinel.sovereign_fish.FreyaWarden')
    def test_valkyrie_precedes_beauty(self, mock_visual, mock_mimir, mock_valkyrie, mock_annex, tmp_path, mock_genai_client):
        # Setup: All strategists find targets
        mock_annex_inst = MagicMock()
        mock_annex_inst.scan.return_value = [] # No critical breaches
        mock_annex_inst.breaches = []
        mock_annex.return_value = mock_annex_inst

        mock_valkyrie_inst = MagicMock()
        mock_valkyrie_inst.scan.return_value = [{"file": "dead.py", "action": "Prune"}]
        mock_valkyrie.return_value = mock_valkyrie_inst

        mock_mimir_inst = MagicMock()
        mock_mimir_inst.scan.return_value = [{"file": "complex.py", "action": "Simplify"}]
        mock_mimir.return_value = mock_mimir_inst

        mock_visual_inst = MagicMock()
        mock_visual_inst.scan.return_value = [{"file": "ugly.py", "action": "Beautify"}]
        mock_visual.return_value = mock_visual_inst

        os.environ["GOOGLE_API_KEY"] = "TEST"
        fish = SovereignFish(str(tmp_path), client=mock_genai_client)
        
        fish._emit_metrics_summary = MagicMock()
        fish._save_state = MagicMock()
        # Mock _forge_improvement to avoid execution phase
        fish._forge_improvement = MagicMock(return_value=None)
        
        with patch('src.sentinel.sovereign_fish.HUD') as mock_hud:
            mock_hud.PERSONA = "ODIN"
            
            fish.run()
            
            log_calls = [str(c) for c in mock_hud.persona_log.call_args_list]
            target_logs = [l for l in log_calls if "Target:" in l]
            
            assert len(target_logs) > 0
            # Should choose Valkyrie (Prune)
            assert "Prune" in target_logs[0]
