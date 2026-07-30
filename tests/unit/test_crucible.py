from pathlib import Path
from unittest.mock import patch

import pytest

from src.core.engine.utils.code_sanitizer import BifrostGate, RETIRED_SOURCE_WRITE_ERROR
from src.core.engine.utils.sandbox_warden import (
    LEGACY_SANDBOX_WARDEN_ERROR,
    SandboxWarden,
)

# ==============================================================================
# Suite 3: Crucible Lockdown
# ==============================================================================

gate = BifrostGate()

class TestCrucibleSecurity:
    """[ODIN] Verifies the Bifrost Gate's ability to halt advanced exploits."""

    @pytest.mark.parametrize("payload", [
        "__import__('os').system('whoami')",
        "().__class__.__base__.__subclasses__()[0]",
        "import builtins; builtins.eval('1+1')",
        "[eval(x) for x in ['1+1']]", # Nested AST
        "(lambda: [getattr(x, '__cl' + 'ass__') for x in [[]]])()" # Obfuscated
    ])
    def test_deep_ast_bypass_prevention(self, payload):
        """Assert that advanced and obfuscated payloads are caught by the AST walker."""
        ok, msg = gate.perform_quarantine_scan(payload)
        assert ok is False
        assert any(term in msg.lower() for term in ["forbidden", "dangerous", "access"])


class TestQMDNeutering:
    """Source mutation must go through an explicitly reviewed patch."""

    def test_neuter_qmd_fails_closed_without_writing(self, tmp_path):
        qmd_file = tmp_path / "research.qmd"
        content = "# Simple Document\n\nprint('hello')"
        qmd_file.write_text(content)

        with pytest.raises(RuntimeError, match=RETIRED_SOURCE_WRITE_ERROR):
            BifrostGate.neuter_qmd_document(qmd_file)

        assert qmd_file.read_text() == content


class TestZombiePurge:
    """The former direct sandbox must fail before Docker or native execution."""

    @patch("subprocess.run")
    @patch("pathlib.Path.resolve")
    def test_sandbox_action_fails_before_process_or_path_access(
        self,
        mock_resolve,
        mock_run,
    ):
        warden = SandboxWarden()

        with pytest.raises(
            RuntimeError,
            match=f"^{LEGACY_SANDBOX_WARDEN_ERROR}$",
        ):
            warden.run_in_sandbox(Path("skills_db/dummy.py"))

        mock_resolve.assert_not_called()
        mock_run.assert_not_called()
