
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.tools.debug import audit_dialogue


class TestAuditDialogueEmpire:

    @patch("src.tools.debug.audit_dialogue.SovereignEngine")
    @patch("src.tools.debug.audit_dialogue.SovereignHUD")
    @patch("src.tools.debug.audit_dialogue.DialogueEngine")
    def test_audit_flow(self, mock_dialogue, mock_hud, mock_sv_cls):
        mock_engine = mock_sv_cls.return_value
        mock_engine.score_identity.return_value = 0.9

        auditor = audit_dialogue.DialogueAuditor()
        auditor.audit("test dialogue")

        # Verify SovereignHUD calls
        mock_hud.box_top.assert_called_with("IDENTITY PURITY AUDIT")
        mock_hud.progress_bar.assert_called()

        # Verify persona setup
        assert mock_hud.PERSONA == "GOD"

    @patch("src.tools.debug.audit_dialogue.SovereignEngine")
    @patch("src.tools.debug.audit_dialogue.SovereignHUD")
    @patch("src.tools.debug.audit_dialogue.DialogueEngine")
    def test_audit_deviance(self, mock_dialogue, mock_hud, mock_sv_cls):
        mock_engine = mock_sv_cls.return_value
        mock_engine.score_identity.return_value = 0.3

        auditor = audit_dialogue.DialogueAuditor()
        auditor.audit("deviant dialogue")

        # Verify progress bar called (even if low score)
        mock_hud.progress_bar.assert_called()

        # First row is PERSONA
        mock_hud.box_row.assert_any_call("PERSONA", "GOD", mock_hud.MAGENTA)

if __name__ == "__main__":
    pytest.main([__file__])
