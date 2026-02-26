import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from src.sentinel.code_sanitizer import neuter_qmd_document, perform_quarantine_scan
from src.sentinel.sandbox_warden import SandboxWarden

# ==============================================================================
# Suite 3: Crucible Lockdown
# ==============================================================================

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
        ok, msg = perform_quarantine_scan(payload)
        assert ok is False
        assert any(term in msg.lower() for term in ["forbidden", "dangerous", "access"])


class TestQMDNeutering:
    """[ODIN] Verifies zero-trust enforcement for Quarto documents."""

    def test_neuter_qmd_no_yaml_injects_header(self, tmp_path):
        """Passing a string with no YAML frontmatter should result in a valid execute: false header."""
        qmd_file = tmp_path / "research.qmd"
        content = "# Simple Document\n\nprint('hello')"
        qmd_file.write_text(content)

        neuter_qmd_document(qmd_file)

        updated = qmd_file.read_text()
        assert updated.startswith("---\nexecute: false\n---")
        assert "# Simple Document" in updated


class TestZombiePurge:
    """[ODIN] Verifies persistent teardown even on execution failure."""

    @patch("src.sentinel.sandbox_warden.subprocess.run")
    def test_sandbox_zombie_purge_on_timeout(self, mock_run):
        """
        Simulate a hanging Docker container that triggers a TimeoutExpired.
        Assert that 'docker rm -f' is explicitly called in the finally block.
        """
        # 1. Setup Mock sequence:
        #   - 1st call: docker --version (during __init__)
        #   - 2nd call: docker run (raises Timeout)
        #   - 3rd call: docker rm -f (purge)

        mock_run.side_effect = [
            MagicMock(returncode=0), # version check
            subprocess.TimeoutExpired(cmd="docker run...", timeout=5), # run check
            MagicMock(returncode=0) # rm check
        ]

        warden = SandboxWarden()
        # Reset mock after init
        mock_run.reset_mock()
        mock_run.side_effect = [
            MagicMock(returncode=0), # image check
            subprocess.TimeoutExpired(cmd="docker run...", timeout=5),
            MagicMock(returncode=0)
        ]

        result = warden.run_in_sandbox(Path("skills_db/dummy.py"))

        # ASSERTIONS:
        # 1. Assert exactly 3 calls (Image check, Run, Purge)
        assert mock_run.call_count == 3

        # 2. Verify the 3rd call (Purge) is docker rm -f
        # call_args_list[2] is the (args, kwargs) tuple of the third call
        purge_cmd = mock_run.call_args_list[2][0][0]
        assert "rm" in purge_cmd
        assert "-f" in purge_cmd
        assert "docker" in purge_cmd

        # 3. Verify status
        assert result["timed_out"] is True
        assert result["exit_code"] == -1
