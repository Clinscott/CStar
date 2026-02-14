
import pytest
from unittest.mock import MagicMock, patch, mock_open
from pathlib import Path
import sys
import json

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.tools.debug import audit_dialogue

class TestAuditDialogueEmpire:
    
    @patch("src.tools.debug.audit_dialogue.Path.exists", return_value=True)
    @patch("src.tools.debug.audit_dialogue.Path.open", new_callable=mock_open, read_data='{"Persona": "GOD"}')
    @patch("src.tools.debug.audit_dialogue.sv_engine.SovereignVector")
    @patch("src.tools.debug.audit_dialogue.sv_engine.HUD")
    def test_audit_flow(self, mock_hud, mock_sv_cls, mock_file, mock_exists):
        auditor = audit_dialogue.DialogueAuditor()
        
        # Verify init
        assert auditor.persona == "GOD"
        mock_sv_cls.assert_called()
        
        # Mock score
        mock_engine = mock_sv_cls.return_value
        mock_engine.score_identity.return_value = 0.9
        
        auditor.audit("I am the All-Father.")
        
        # Verify HUD calls
        mock_hud.box_top.assert_called()
        mock_hud.box_row.assert_called()
        # Verify verdict
        # Last call to box_row is VERDICT
        args = mock_hud.box_row.call_args_list[-1][0]
        assert "SOUL ALIGNMENT: STABLE" in args[1]

    @patch("src.tools.debug.audit_dialogue.Path.exists", return_value=True)
    @patch("src.tools.debug.audit_dialogue.Path.open", new_callable=mock_open, read_data='{"Persona": "ALFRED"}')
    @patch("src.tools.debug.audit_dialogue.sv_engine.SovereignVector")
    @patch("src.tools.debug.audit_dialogue.sv_engine.HUD")
    def test_audit_deviance(self, mock_hud, mock_sv_cls, mock_file, mock_exists):
        auditor = audit_dialogue.DialogueAuditor()
        
        # Mock score < 0.4
        mock_engine = mock_sv_cls.return_value
        mock_engine.score_identity.return_value = 0.3
        
        auditor.audit("Sup dude.")
        
        args = mock_hud.box_row.call_args_list[-1][0]
        assert "recommend adjusting our tone" in args[1]

if __name__ == "__main__":
    pytest.main([__file__])
