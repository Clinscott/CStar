
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.sovereign_hud import SovereignHUD


class TestUIEmpire:

    def setup_method(self):
        # Reset SovereignHUD static state
        SovereignHUD._INITIALIZED = False
        SovereignHUD.PERSONA = "ALFRED"
        SovereignHUD.DIALOGUE = None

    def test_ensure_persona(self, tmp_path):
        # Instead of mocking Path.open, we use a real temp file
        agent_dir = tmp_path / ".agent"
        agent_dir.mkdir()
        config_file = agent_dir / "config.json"
        config_file.write_text('{"system": {"persona": "ODIN"}}', encoding='utf-8')

        with patch("src.core.sovereign_hud.Path.cwd", return_value=tmp_path):
            SovereignHUD._ensure_persona()
            assert SovereignHUD.PERSONA == "ODIN"
            assert SovereignHUD._INITIALIZED is True

    def test_progress_bar(self):
        bar = SovereignHUD.progress_bar(0.5, width=10)
        assert bar.count("█") == 5

    def test_sparkline(self):
        data = [0, 5, 10]
        spark = SovereignHUD.render_sparkline(data)
        assert len(spark) == 3
        assert isinstance(spark, str)
        assert any(c in " ▂▃▄▅▆▇█" for c in spark)

    def test_box_rendering(self, capsys):
        SovereignHUD.box_top("TEST TITLE", width=40)
        SovereignHUD.box_row("KEY", "VALUE")
        SovereignHUD.box_bottom()
        captured = capsys.readouterr()
        assert "TEST TITLE" in captured.out
        assert "KEY" in captured.out
        assert "VALUE" in captured.out

    def test_log_rejection(self, tmp_path):
        with patch("src.core.sovereign_hud.Path.cwd", return_value=tmp_path):
            SovereignHUD.log_rejection("TEST_PERSONA", "Reason", "Details")

            # Check file exists in tmp_path
            ledger = tmp_path / ".agent" / "traces" / "quarantine" / "REJECTIONS.qmd"
            assert ledger.exists()
            content = ledger.read_text(encoding='utf-8')
            assert "TEST_PERSONA" in content
            assert "Reason" in content

if __name__ == "__main__":
    pytest.main([__file__])
