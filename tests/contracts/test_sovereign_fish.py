"""
Sovereign Fish Contract Tests
Verifies: SovereignFish protocol, TheWatcher, CampaignStrategist, EddaStrategist, rollback.
All tests use mock AI client — zero network calls.
"""
import json
import os
import sys
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Ensure project root is on path
project_root = Path(__file__).parent.parent.parent.absolute()
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from src.sentinel.sovereign_fish import (
    CampaignStrategist,
    EddaStrategist,
    SovereignFish,
    TheWatcher,
)


# ==============================================================================
# TheWatcher Tests
# ==============================================================================


class TestWatcherOscillationLock:
    """Identical content hash submitted twice -> LOCKED status."""

    def test_echo_detection_locks_file(self, tmp_path):
        (tmp_path / ".agent").mkdir()
        watcher = TheWatcher(tmp_path)
        rel = "src/sample.py"
        content = "print('hello')"

        # First edit: OK
        assert watcher.record_edit(rel, content) is True

        # Second edit with DIFFERENT content: OK
        assert watcher.record_edit(rel, content + " # v2") is True

        # Third edit with SAME content as first: Oscillation -> LOCKED
        result = watcher.record_edit(rel, content)
        assert result is False
        assert watcher.is_locked(rel) is True


class TestWatcherFatigueLock:
    """4th edit within 24h -> file gets LOCKED."""

    def test_fatigue_locks_after_threshold(self, tmp_path):
        (tmp_path / ".agent").mkdir()
        watcher = TheWatcher(tmp_path)
        rel = "src/fatigue_test.py"

        # Edits 1-3: unique content, all OK
        for i in range(3):
            result = watcher.record_edit(rel, f"version_{i}")
            assert result is True

        # Edit 4: should still succeed but lock future edits
        result = watcher.record_edit(rel, "version_3")
        assert result is True  # 4th edit succeeds but triggers lock
        assert watcher.is_locked(rel) is True


# ==============================================================================
# CampaignStrategist Tests
# ==============================================================================


class TestCampaignStrategist:
    """Parses markdown tables and strikes completed items."""

    PLAN_CONTENT = """\
# Campaign Plan

| # | File | Target | Type | Description |
|---|------|--------|------|-------------|
| 1 | `src/foo.py` | FooClass | REFACTOR | Simplify constructor |
| 2 | ~~`src/bar.py`~~ | ~~BarFunc~~ | ~~FIX~~ | ~~Already done~~ |
| 3 | `src/baz.py` | BazUtil | NEW | Add utility function |
"""

    def test_get_next_target_finds_first_actionable(self, tmp_path):
        (tmp_path / ".agent").mkdir()
        plan_path = tmp_path / ".agent" / "CAMPAIGN_IMPLEMENTATION_PLAN.qmd"
        plan_path.write_text(self.PLAN_CONTENT, encoding="utf-8")

        cs = CampaignStrategist(tmp_path)
        target = cs.get_next_target()

        assert target is not None
        assert target["file"] == "src/foo.py"
        assert "REFACTOR" in target["action"]
        assert "Simplify constructor" in target["action"]

    def test_get_next_target_skips_struck_items(self, tmp_path):
        (tmp_path / ".agent").mkdir()
        # All items struck through
        struck_plan = """\
| # | File | Target | Type | Description |
|---|------|--------|------|-------------|
| 1 | ~~`src/foo.py`~~ | ~~Foo~~ | ~~FIX~~ | ~~Done~~ |
"""
        plan_path = tmp_path / ".agent" / "CAMPAIGN_IMPLEMENTATION_PLAN.qmd"
        plan_path.write_text(struck_plan, encoding="utf-8")

        cs = CampaignStrategist(tmp_path)
        assert cs.get_next_target() is None

    def test_mark_complete_strikes_description(self, tmp_path):
        (tmp_path / ".agent").mkdir()
        plan_path = tmp_path / ".agent" / "CAMPAIGN_IMPLEMENTATION_PLAN.qmd"
        plan_path.write_text(self.PLAN_CONTENT, encoding="utf-8")

        cs = CampaignStrategist(tmp_path)
        target = cs.get_next_target()
        cs.mark_complete(target)

        updated = plan_path.read_text(encoding="utf-8")
        lines = updated.splitlines()
        # The line for item 1 should now have ~~ in the description
        target_line = lines[target["line_index"]]
        assert "~~" in target_line

    def test_returns_none_when_no_plan(self, tmp_path):
        cs = CampaignStrategist(tmp_path)
        assert cs.get_next_target() is None


# ==============================================================================
# EddaStrategist Tests
# ==============================================================================


class TestEddaStrategist:
    """Detects Python files missing docstrings."""

    def test_detects_missing_docstrings(self, tmp_path):
        src_dir = tmp_path / "src"
        src_dir.mkdir()
        # File WITHOUT docstrings
        no_doc = src_dir / "no_docs.py"
        no_doc.write_text("def naked():\n    pass\n", encoding="utf-8")
        # File WITH docstrings
        has_doc = src_dir / "documented.py"
        has_doc.write_text('def solid():\n    """I have docs."""\n    pass\n', encoding="utf-8")

        edda = EddaStrategist(tmp_path)
        targets = edda.scan()

        # Should flag the undocumented file
        flagged_files = [t["file"] for t in targets]
        assert any("no_docs.py" in f for f in flagged_files)
        # Should NOT flag the documented file
        assert not any("documented.py" in f for f in flagged_files)


# ==============================================================================
# SovereignFish Tests (with Mock AI Client)
# ==============================================================================


class TestSovereignFishScanCycle:
    """run() returns False when no breaches are found (clean codebase)."""

    @patch("src.sentinel.sovereign_fish.AnnexStrategist")
    def test_no_breaches_returns_false(self, mock_annex_cls, tmp_path, mock_genai_client):
        # Setup: AnnexStrategist reports no breaches
        mock_annex = MagicMock()
        mock_annex.breaches = []
        mock_annex_cls.return_value = mock_annex

        os.environ["GOOGLE_API_KEY"] = "TEST_KEY"
        try:
            fish = SovereignFish(str(tmp_path), client=mock_genai_client)
            result = fish.run()
            assert result is False
        finally:
            os.environ.pop("GOOGLE_API_KEY", None)


class TestRollback:
    """_rollback() restores .bak file correctly."""

    def test_rollback_restores_backup(self, tmp_path, mock_genai_client):
        src_dir = tmp_path / "src"
        src_dir.mkdir()
        target_file = src_dir / "target.py"
        original_content = "# Original content\n"
        target_file.write_text(original_content, encoding="utf-8")

        # Create a .bak file
        bak_file = Path(f"{target_file}.bak")
        bak_file.write_text(original_content, encoding="utf-8")

        # Overwrite the target with "bad" content
        target_file.write_text("# Bad content\n", encoding="utf-8")

        os.environ["GOOGLE_API_KEY"] = "TEST_KEY"
        try:
            fish = SovereignFish(str(tmp_path), client=mock_genai_client)
            target = {"file": "src/target.py"}
            fish._rollback(target)

            # Verify rollback restored original
            restored = target_file.read_text(encoding="utf-8")
            assert restored == original_content
        finally:
            os.environ.pop("GOOGLE_API_KEY", None)


class TestGauntletEscalation:
    """Verifies 3 Flash retries then 1 Pro escalation (4 total API calls)."""

    def test_escalates_to_pro_on_final_attempt(self, tmp_path, mock_genai_client):
        # Track which models are called
        models_called = []
        original_generate = mock_genai_client.models.generate_content

        def track_model_call(*args, **kwargs):
            model = kwargs.get("model") or (args[0] if args else "unknown")
            models_called.append(model)
            response = MagicMock()
            response.text = json.dumps({
                "code": "def hello(): pass",
                "test": "def test_hello(): assert True"
            })
            return response

        mock_genai_client.models.generate_content.side_effect = track_model_call

        # Create a minimal temp_gauntlet structure
        (tmp_path / "tests" / "empire_tests" / "temp_gauntlet").mkdir(parents=True)
        target_file = tmp_path / "src" / "sample.py"
        target_file.parent.mkdir(parents=True, exist_ok=True)
        target_file.write_text("def hello(): pass\n", encoding="utf-8")

        os.environ["GOOGLE_API_KEY"] = "TEST_KEY"
        try:
            fish = SovereignFish(str(tmp_path), client=mock_genai_client)
            target = {"file": "src/sample.py", "action": "Test action"}

            # Make pytest always fail so we exhaust all retries
            with patch("subprocess.run") as mock_subprocess:
                mock_result = MagicMock()
                mock_result.returncode = 1
                mock_result.stdout = "FAILED"
                mock_result.stderr = ""
                mock_subprocess.return_value = mock_result

                result = fish._run_gauntlet(
                    target, "def hello(): pass\n", "Feature: test"
                )

            # Should have called 4 times (3 Flash + 1 Pro)
            assert len(models_called) == 4
            # Last call should use Pro model
            assert models_called[-1] == "gemini-2.5-pro"
            # First 3 should use Flash
            for m in models_called[:3]:
                assert m == "gemini-2.5-flash"
            # Result should be None (all failed)
            assert result is None
        finally:
            os.environ.pop("GOOGLE_API_KEY", None)
